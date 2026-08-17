/**
 * The out-of-the-box scenario is the app's shop window: whatever it shows on
 * first load is what a reader judges the tool by. It must land on the
 * v1-compatible one-way loop and produce a credible, self-consistent result.
 */
import { describe, expect, it } from 'vitest'
import { defaultParams } from './defaults.ts'
import { toSimParams } from './simParams.ts'
import { REPS, SIM_HOURS, avgStats, batchRun, repSeed } from './engine/sim.ts'

describe('defaultParams', () => {
  it('ships the supported one-way guide path (reverse pickup is experimental, off)', () => {
    // Reverse-direction empty pickup creates opposing traffic outside the
    // supported one-way contract. The experimental give-way rule can arbitrate
    // that narrow maneuver, but it remains opt-in — see sim.reverse.test.ts.
    expect(defaultParams().allowReversePickup).toBe(false)
  })

  it('produces a credible default result: 5 vehicles keep up with 40 jobs/hr', () => {
    // The app's "validate this fleet" button, exactly: REPS runs of SIM_HOURS
    // each on repSeed's schedule, averaged. Routed through repSeed rather than
    // spelled out, because spelling it out is how this test previously came to
    // batch seeds 42/7961 while the app batched 42/43 — and then pinned
    // 41.6 jobs/hr, a number the app has never displayed.
    const P = toSimParams(defaultParams())
    const runs = []
    for (let r = 0; r < REPS; r++) runs.push(batchRun(P, repSeed(defaultParams().seed, r), SIM_HOURS))
    const st = avgStats(runs)
    expect(st.met).toBe(true)
    expect(st.stranded).toBe(0)
    expect(st.blocked).toBeLessThan(0.1)
    // Flow time on a 400 m loop with 30 s load + 30 s unload is minutes, not hours.
    expect(st.p95).toBeLessThan(1800)

    // The published figures: what the validation card renders on first load,
    // what the README quotes, and what docs/media/*.png show. Tolerances are
    // sized for cross-engine ULP noise in Math.log/Math.sqrt, NOT for
    // statistical spread — the run is deterministic, so a change bigger than
    // this means the model or the seed schedule moved, and the README and the
    // screenshots need regenerating with it.
    expect(st.tph).toBeCloseTo(39.12, 1)
    expect(st.offeredRate).toBeCloseTo(39.06, 1)
    expect(st.p95).toBeCloseTo(615.5, 0)
    expect(st.blocked).toBeCloseTo(0.021, 3)

    // Throughput clears the offered load by the same margin the engine's own
    // `met` criterion uses. Stated separately from `met` so the number the
    // README explains is visible here rather than hidden behind a boolean.
    expect(st.tph).toBeGreaterThanOrEqual(st.offeredRate * 0.98)
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
