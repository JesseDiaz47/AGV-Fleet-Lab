import { describe, expect, it } from 'vitest'
import { sanitizeScenarioParams, sanitizeState } from './sanitize.ts'
import { defaultParams, makeScenario } from './defaults.ts'
import { fleetFeasibility } from './engine/feasibility.ts'

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

  it('filters compareIds to only ids that still exist, capped at 4', () => {
    const a = makeScenario('A')
    const state = { scenarios: [a], activeScenarioId: a.id, compareIds: [a.id, 'ghost', a.id, 'ghost2', 'ghost3'] }
    const result = sanitizeState(state)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.compareIds).toEqual([a.id])
  })
})

describe('sanitize and geometric feasibility', () => {
  // Every one of these values is individually inside PARAM_LIMITS; only their
  // combination is impossible. The sanitizer's job is to hand back exactly
  // what was stored — clamping fleet or minGap here would silently rewrite a
  // versioned scenario record into a different scenario. Refusing to SIMULATE
  // it is the engine's job (see engine/feasibility.ts).
  const impossible = { loopLen: 60, minGap: 20, fleet: 14 }

  it('preserves an infeasible combination of individually valid values', () => {
    const p = sanitizeScenarioParams({ ...defaultParams(), ...impossible })
    expect(p.loopLen).toBe(60)
    expect(p.minGap).toBe(20)
    expect(p.fleet).toBe(14)
  })

  it('reports it as infeasible rather than repairing it', () => {
    const p = sanitizeScenarioParams({ ...defaultParams(), ...impossible })
    expect(fleetFeasibility(p).feasible).toBe(false)
    expect(fleetFeasibility(p).maxFleet).toBe(2)
  })

  it('round-trips an imported infeasible scenario without touching its revision', () => {
    const sc = { ...makeScenario('Tampered'), revision: 7, params: { ...defaultParams(), ...impossible } }
    const result = sanitizeState({ scenarios: [sc], activeScenarioId: sc.id, compareIds: [] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const restored = result.value.scenarios[0]
    expect(restored.revision).toBe(7)
    expect(restored.params.fleet).toBe(14)
    expect(restored.params.minGap).toBe(20)
    expect(restored.params.loopLen).toBe(60)
  })

  it('leaves a feasible scenario feasible', () => {
    expect(fleetFeasibility(sanitizeScenarioParams(defaultParams())).feasible).toBe(true)
  })
})
