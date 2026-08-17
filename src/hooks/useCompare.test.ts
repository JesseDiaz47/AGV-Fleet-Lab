import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCompare } from './useCompare.ts'
import { defaultParams, makeScenario } from '../lib/defaults.ts'
import { toSimParams } from '../lib/simParams.ts'
import { REPS, SIM_HOURS, avgStats, batchRun, repSeed } from '../lib/engine/sim.ts'

describe('useCompare', () => {
  it('produces one result per scenario, matched by id', async () => {
    // Disable reverse-direction pickup so this test continues to assert
    // fleet-size sensitivity under the v1 dispatch model — with reverse on,
    // an undersized fleet can claw back throughput via backtracking and the
    // "more vehicles ≥ throughput" invariant no longer holds.
    const a = makeScenario('A', { ...defaultParams(), fleet: 4, seed: 1, allowReversePickup: false })
    const b = makeScenario('B', { ...defaultParams(), fleet: 8, seed: 2, allowReversePickup: false })
    const { result } = renderHook(() => useCompare())

    act(() => result.current.run([a, b]))
    await waitFor(() => expect(result.current.status).toBe('done'), { timeout: 15000 })

    expect(result.current.results.map((r) => r.scenarioId).sort()).toEqual([a.id, b.id].sort())
    const resultA = result.current.results.find((r) => r.scenarioId === a.id)!
    const resultB = result.current.results.find((r) => r.scenarioId === b.id)!
    // Both fleets fit the default 400 m loop at a 3 m gap, so both must have
    // actually simulated — `simulated: null` is reserved for geometry the
    // engine refuses (see engine/feasibility.ts).
    const simA = resultA.simulated
    const simB = resultB.simulated
    if (!simA || !simB) throw new Error('both scenarios fit their loop, so both should have simulated')
    // More vehicles should never simulate lower throughput than fewer, for
    // the same demand — a basic sanity check that each result used its own
    // scenario's fleet size rather than a shared/default one.
    expect(simB.tph).toBeGreaterThanOrEqual(simA.tph)
  })

  it('batches each scenario on exactly the repetitions repSeed names', async () => {
    // Compare is the third batched production path, alongside validation and
    // the sweep, and it must run the same seed schedule as both — a comparison
    // whose columns were sampled differently is not a comparison. Guards the
    // same way they do: equality against an independently computed reference,
    // not a restatement of the formula.
    //
    // A 40 m loop at a 12 m gap keeps this to two short runs per scenario.
    const tiny = { ...defaultParams(), loopLen: 40, minGap: 12, stations: 3, demand: 10, fleet: 2 }
    const sc = makeScenario('Seed guard', { ...tiny, seed: 99 })
    const P = toSimParams(sc.params)
    const reference = avgStats(
      Array.from({ length: REPS }, (_, r) => batchRun(P, repSeed(sc.params.seed, r), SIM_HOURS)),
    )

    const { result } = renderHook(() => useCompare())
    act(() => result.current.run([sc]))
    await waitFor(() => expect(result.current.status).toBe('done'), { timeout: 20000 })

    const sim = result.current.results[0]?.simulated
    if (!sim) throw new Error('the scenario fits its loop, so it should have simulated')
    expect(sim.tph).toBe(reference.tph)
    expect(sim.offeredRate).toBe(reference.offeredRate)
    expect(sim.p95).toBe(reference.p95)
    expect(sim.met).toBe(reference.met)
  })

  it('reset invalidates an in-flight run', async () => {
    vi.useRealTimers()
    const a = makeScenario('A')
    const b = makeScenario('B')
    const { result } = renderHook(() => useCompare())

    act(() => result.current.run([a, b]))
    act(() => result.current.reset())
    await new Promise((r) => setTimeout(r, 50))

    expect(result.current.status).toBe('idle')
    expect(result.current.results).toEqual([])
  })
})
