/**
 * The out-of-the-box scenario is the app's shop window: whatever it shows on
 * first load is what a reader judges the tool by. It must land on the
 * v1-compatible one-way loop and produce a credible, self-consistent result.
 */
import { describe, expect, it } from 'vitest'
import { defaultParams } from './defaults.ts'
import { toSimParams } from './simParams.ts'
import { REPS, SIM_HOURS, avgStats, batchRun } from './engine/sim.ts'

describe('defaultParams', () => {
  it('ships the supported one-way guide path (reverse pickup is experimental, off)', () => {
    // Reverse-direction empty pickup puts a vehicle nose-to-nose with forward
    // traffic on a one-way loop, which the spacing model cannot arbitrate.
    // It is opt-in only — see sim.reverse.test.ts.
    expect(defaultParams().allowReversePickup).toBe(false)
  })

  it('produces a credible default result: 5 vehicles keep up with 40 jobs/hr', () => {
    // Same methodology as the app's "validate this fleet" button.
    const P = toSimParams(defaultParams())
    const runs = []
    for (let r = 0; r < REPS; r++) runs.push(batchRun(P, defaultParams().seed + r * 7919, SIM_HOURS))
    const st = avgStats(runs)
    expect(st.met).toBe(true)
    expect(st.tph).toBeCloseTo(41.6, 0)
    expect(st.stranded).toBe(0)
    expect(st.blocked).toBeLessThan(0.1)
    // Flow time on a 400 m loop with 30 s load + 30 s unload is minutes, not hours.
    expect(st.p95).toBeLessThan(1800)
  })

  it('sweeps to a knee at or below the default fleet size', () => {
    // The default scenario must not present the reader with "no fleet size
    // met demand" on first load.
    const P = toSimParams(defaultParams())
    const met = [1, 2, 3, 4, 5, 6].filter((fleet) => batchRun({ ...P, fleet }, defaultParams().seed, 4).met)
    expect(met.length).toBeGreaterThan(0)
    expect(Math.min(...met)).toBeLessThanOrEqual(defaultParams().fleet)
  })
})
