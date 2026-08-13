import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCompare } from './useCompare.ts'
import { defaultParams, makeScenario } from '../lib/defaults.ts'

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
