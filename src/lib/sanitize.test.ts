import { describe, expect, it } from 'vitest'
import { sanitizeScenarioParams, sanitizeState } from './sanitize.ts'
import { defaultParams, makeScenario } from './defaults.ts'
import { analyze } from './engine/analytic.ts'
import { batchRun, SIM_HOURS } from './engine/sim.ts'
import { toAnalyticParams, toSimParams } from './simParams.ts'

/** `n` blocks with distinct start hours spread over the 24h cycle, starting at 0. */
function shiftBlocks(n: number): Array<{ startHour: number; multiplier: number }> {
  return Array.from({ length: n }, (_, i) => ({ startHour: (i * 24) / n, multiplier: 1 }))
}

describe('sanitizeScenarioParams', () => {
  it('fills in defaults for a missing/non-object payload', () => {
    expect(sanitizeScenarioParams(undefined)).toEqual(defaultParams())
    expect(sanitizeScenarioParams(null)).toEqual(defaultParams())
    expect(sanitizeScenarioParams('nope')).toEqual(defaultParams())
  })

  it('clamps out-of-range numbers instead of accepting them', () => {
    const p = sanitizeScenarioParams({ demand: 99999, stations: -5 })
    expect(p.demand).toBe(defaultParams().demand) // out of [1,400] -> fallback
    expect(p.stations).toBe(defaultParams().stations) // out of [2,16] -> fallback
  })

  it('rejects malformed dispatchRule to the default strategy', () => {
    const p = sanitizeScenarioParams({ dispatchRule: 'teleport' })
    expect(p.dispatchRule).toBe('nearestVehicle')
  })

  it('accepts a valid weighted-demand array matching station count', () => {
    const p = sanitizeScenarioParams({ stations: 3, originWeights: [1, 2, 3] })
    expect(p.originWeights).toEqual([1, 2, 3])
  })

  it('drops a weight array with the wrong length', () => {
    const p = sanitizeScenarioParams({ stations: 3, originWeights: [1, 2] })
    expect(p.originWeights).toBeNull()
  })

  it('drops an all-zero weight array (meaningless) back to uniform', () => {
    const p = sanitizeScenarioParams({ stations: 3, originWeights: [0, 0, 0] })
    expect(p.originWeights).toBeNull()
  })

  it('accepts a shift profile that starts at hour 0', () => {
    const p = sanitizeScenarioParams({
      shiftProfile: [
        { startHour: 0, multiplier: 0.5 },
        { startHour: 8, multiplier: 1.5 },
      ],
    })
    expect(p.shiftProfile).toHaveLength(2)
  })

  it('rejects a shift profile that does not start at hour 0', () => {
    const p = sanitizeScenarioParams({ shiftProfile: [{ startHour: 4, multiplier: 1 }] })
    expect(p.shiftProfile).toBeNull()
  })

  it('accepts a shift profile at the 1000-block ceiling', () => {
    const p = sanitizeScenarioParams({ shiftProfile: shiftBlocks(1000) })
    expect(p.shiftProfile).toHaveLength(1000)
  })

  it('rejects a shift profile past the ceiling back to flat demand', () => {
    const p = sanitizeScenarioParams({ shiftProfile: shiftBlocks(1001) })
    expect(p.shiftProfile).toBeNull()
  })
})

describe('sanitizeState', () => {
  it('falls back to a fresh default state for garbage input', () => {
    const result = sanitizeState('not an object')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.scenarios).toHaveLength(1)
    expect(result.value.activeScenarioId).toBe(result.value.scenarios[0].id)
  })

  it('round-trips a valid state exactly', () => {
    const scenario = makeScenario('My scenario')
    const state = { scenarios: [scenario], activeScenarioId: scenario.id, compareIds: [] }
    const result = sanitizeState(state)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.scenarios[0].id).toBe(scenario.id)
    expect(result.value.scenarios[0].name).toBe('My scenario')
    expect(result.value.activeScenarioId).toBe(scenario.id)
  })

  it('drops scenarios missing an id or name rather than crashing', () => {
    const good = makeScenario('Keep me')
    const state = { scenarios: [good, { name: 'no id' }, { id: 'x' }], activeScenarioId: good.id, compareIds: [] }
    const result = sanitizeState(state)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.scenarios).toHaveLength(1)
    expect(result.value.scenarios[0].id).toBe(good.id)
  })

  it('de-duplicates colliding scenario ids instead of losing records', () => {
    const a = makeScenario('A')
    const b = { ...makeScenario('B'), id: a.id }
    const state = { scenarios: [a, b], activeScenarioId: a.id, compareIds: [] }
    const result = sanitizeState(state)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.scenarios).toHaveLength(2)
    expect(new Set(result.value.scenarios.map((s) => s.id)).size).toBe(2)
  })

  it('falls back activeScenarioId to an existing scenario when the stored one is gone', () => {
    const a = makeScenario('A')
    const state = { scenarios: [a], activeScenarioId: 'ghost-id', compareIds: [] }
    const result = sanitizeState(state)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.activeScenarioId).toBe(a.id)
  })

  it('keeps a 200-character name and truncates a longer one', () => {
    const atCap = { ...makeScenario('x'), name: 'n'.repeat(200) }
    const overCap = { ...makeScenario('y'), name: 'n'.repeat(201) }
    const result = sanitizeState({ scenarios: [atCap, overCap], activeScenarioId: atCap.id, compareIds: [] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.scenarios.map((s) => s.name.length)).toEqual([200, 200])
  })

  it('keeps a 64-character id and drops a scenario whose id is longer', () => {
    const atCap = { ...makeScenario('keep'), id: 'i'.repeat(64) }
    const overCap = { ...makeScenario('drop'), id: 'i'.repeat(65) }
    const result = sanitizeState({ scenarios: [atCap, overCap], activeScenarioId: atCap.id, compareIds: [] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.scenarios.map((s) => s.name)).toEqual(['keep'])
  })

  it('still runs the analytic pass and a batch sim at the longest legal values', () => {
    const raw = {
      ...makeScenario('z'),
      id: 'i'.repeat(64),
      name: 'n'.repeat(201),
      params: { ...defaultParams(), shiftProfile: shiftBlocks(1000) },
    }
    const result = sanitizeState({ scenarios: [raw], activeScenarioId: raw.id, compareIds: [] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const scenario = result.value.scenarios[0]
    expect(scenario.name).toHaveLength(200)
    expect(scenario.params.shiftProfile).toHaveLength(1000)

    expect(analyze(toAnalyticParams(scenario.params)).nReq).toBeGreaterThan(0)
    expect(batchRun(toSimParams(scenario.params), scenario.params.seed, SIM_HOURS).tph).toBeGreaterThan(0)
  })

  it('filters compareIds to only ids that still exist, capped at 4', () => {
    const a = makeScenario('A')
    const state = { scenarios: [a], activeScenarioId: a.id, compareIds: [a.id, 'ghost', a.id, 'ghost2', 'ghost3'] }
    const result = sanitizeState(state)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.compareIds).toEqual([a.id])
  })
})
