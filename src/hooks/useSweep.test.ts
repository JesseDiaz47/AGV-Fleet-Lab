/**
 * The sweep batches the same way validation does, and it feeds the chart, the
 * table, the CSV and the verdict — so its seed schedule is public behavior too.
 *
 * This is a guard, not a spec: routing the sweep through `repSeed` did not
 * change what it computes. It exists so that the next hand-written seed
 * expression cannot silently put the sweep on a different schedule from
 * validation, which is the drift that produced the mismatched regression pins.
 */
import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useSweep } from './useSweep.ts'
import { defaultParams } from '../lib/defaults.ts'
import { toAnalyticParams, toSimParams } from '../lib/simParams.ts'
import { analyze } from '../lib/engine/analytic.ts'
import { sweepSizes } from '../lib/engine/sweep.ts'
import { REPS, SIM_HOURS, avgStats, batchRun, repSeed } from '../lib/engine/sim.ts'

// A deliberately small guide path: 40 m at a 12 m gap holds at most 3 vehicles,
// so `sweepSizes` returns [1, 2, 3] and the whole sweep is a handful of short
// runs. The point here is the seed schedule, not the default scenario's numbers
// — those are pinned in lib/defaults.test.ts.
const tinyParams = () => ({ ...defaultParams(), loopLen: 40, minGap: 12, stations: 3, demand: 10, fleet: 2 })

describe('useSweep', () => {
  it('batches every fleet size on exactly the repetitions repSeed names', async () => {
    const params = tinyParams()
    const P = toSimParams(params)
    const sizes = sweepSizes(analyze(toAnalyticParams(params)), params)
    expect(sizes).toEqual([1, 2, 3]) // guard the fixture itself: a silent widening would slow this to a crawl

    const reference = sizes.map((n) =>
      avgStats(Array.from({ length: REPS }, (_, r) => batchRun({ ...P, fleet: n }, repSeed(params.seed, r), SIM_HOURS))),
    )

    const { result } = renderHook(() => useSweep())
    act(() => result.current.run(params))
    await waitFor(() => expect(result.current.status).toBe('done'), { timeout: 20000 })

    expect(result.current.results.map((p) => p.n)).toEqual(sizes)
    // Exact equality: same deterministic engine, same seeds. Any drift in the
    // seed schedule moves these numbers.
    result.current.results.forEach((point, i) => {
      expect(point.tph).toBe(reference[i].tph)
      expect(point.offered).toBe(reference[i].offeredRate)
      expect(point.p95).toBe(reference[i].p95)
      expect(point.met).toBe(reference[i].met)
    })
  })
})
