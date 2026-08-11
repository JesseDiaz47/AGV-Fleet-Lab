/**
 * The live view sits directly in front of a constructor that now throws on
 * geometry the guide path cannot hold (see engine/feasibility.ts). If this
 * hook ever builds a `Sim` unguarded, an infeasible scenario takes the whole
 * app down on render rather than showing the feasibility notice.
 */
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useLiveSim } from './useLiveSim.ts'
import { defaultParams } from '../lib/defaults.ts'
import { DASH, unit } from '../lib/format.ts'

// Individually valid, jointly impossible: 14 * 20 m of claimed clearance on a
// 60 m loop.
const impossible = { ...defaultParams(), loopLen: 60, minGap: 20, fleet: 14 }

describe('useLiveSim', () => {
  it('builds a sim for geometry that fits', () => {
    const { result } = renderHook(() => useLiveSim('feasible', defaultParams()))
    expect(result.current.sim).not.toBeNull()
    expect(result.current.tiles.fleet).toBe(defaultParams().fleet)
  })

  it('reports no sim instead of throwing when the fleet cannot fit the loop', () => {
    const { result } = renderHook(() => useLiveSim('infeasible', impossible))
    expect(result.current.sim).toBeNull()
  })

  it('publishes no fabricated KPIs for a fleet that cannot exist', () => {
    const { result } = renderHook(() => useLiveSim('infeasible', impossible))
    const { tiles } = result.current
    // Throughput is unknown, not zero — `format.ts` renders a non-finite as an
    // em-dash precisely so a missing number never reads as a measured one.
    expect(unit('/hr', 1)(tiles.liveTph)).toBe(DASH)
    expect(tiles.completed).toBe(0)
    expect(tiles.fleet).toBe(0)
    // 0/0 from an empty fleet would put a literal NaN into the state bars.
    expect(Number.isFinite(tiles.avgSoc)).toBe(true)
    for (const [key, share] of Object.entries(tiles.share)) {
      expect(Number.isFinite(share), `share.${key} = ${share}`).toBe(true)
    }
  })

  it('restarting onto infeasible geometry clears the sim rather than throwing', () => {
    const { result } = renderHook(() => useLiveSim('feasible', defaultParams()))
    expect(result.current.sim).not.toBeNull()
    expect(() => act(() => result.current.restart(impossible))).not.toThrow()
    expect(result.current.sim).toBeNull()
  })
})
