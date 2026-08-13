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

  describe('auto-restart on the feasibility boundary', () => {
    it('rebuilds a sim automatically when geometry flips infeasible → feasible', () => {
      // Start infeasible — hook holds a null sim.
      const { result, rerender } = renderHook(({ id, p }) => useLiveSim(id, p), {
        initialProps: { id: 'auto', p: impossible },
      })
      expect(result.current.sim).toBeNull()
      // The user fixes the geometry. Without auto-restart they would have to
      // click Restart to see anything; with it, the hook rebuilds itself.
      rerender({ id: 'auto', p: defaultParams() })
      expect(result.current.sim).not.toBeNull()
      expect(result.current.tiles.fleet).toBe(defaultParams().fleet)
    })

    it('nulls the sim automatically when geometry flips feasible → infeasible', () => {
      // Start feasible. The user has been watching a live run.
      const { result, rerender } = renderHook(({ id, p }) => useLiveSim(id, p), {
        initialProps: { id: 'auto', p: defaultParams() },
      })
      expect(result.current.sim).not.toBeNull()
      // The user tightens the geometry past feasibility. Auto-restart replaces
      // the running sim with null so the feasibility card appears immediately,
      // instead of the canvas freezing on the last good frame.
      rerender({ id: 'auto', p: impossible })
      expect(result.current.sim).toBeNull()
      expect(result.current.tiles.fleet).toBe(0)
    })

    it('does not auto-restart on params edits that stay within feasibility', () => {
      // Same scenarioId, feasible throughout — no restart should fire, so the
      // user can keep watching a running sim while they tweak the form.
      const { result, rerender } = renderHook(({ id, p }) => useLiveSim(id, p), {
        initialProps: { id: 'auto', p: defaultParams() },
      })
      const before = result.current.sim
      expect(before).not.toBeNull()
      // Same feasibility, different demand: the existing explicit-restart
      // contract says edits do not yank the live view, and that contract
      // holds here — the same Sim instance is still in place.
      rerender({ id: 'auto', p: { ...defaultParams(), demand: 50 } })
      expect(result.current.sim).toBe(before)
    })
  })
})
