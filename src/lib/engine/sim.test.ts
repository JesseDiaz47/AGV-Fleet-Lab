import { describe, expect, it } from 'vitest'
import { REPS, SIM_HOURS, Sim, WARMUP, avgStats, batchRun, type SimParams } from './sim.ts'

// Same hand-checked default scenario as analytic.test.ts, plus a starting fleet.
const base: SimParams = {
  demand: 40,
  loopLen: 400,
  stations: 6,
  speed: 1.5,
  minGap: 3,
  loadS: 30,
  unloadS: 30,
  spreadPct: 25,
  battery: true,
  runtimeH: 6,
  chargeH: 1,
  thresholdPct: 20,
  targetPct: 90,
  chargeBays: 1,
  parkIdle: true,
  fleet: 5,
}

describe('Sim — determinism', () => {
  it('same seed produces the same number of completions', () => {
    const s1 = new Sim({ ...base }, 7)
    s1.runFor(1800)
    const s2 = new Sim({ ...base }, 7)
    s2.runFor(1800)
    expect(s1.completed).toBe(s2.completed)
    expect(s1.completed).toBeGreaterThan(0)
  })
})

describe('Sim — edge cases', () => {
  it('near-zero demand yields ~0 jobs and finite stats (no NaN)', () => {
    const s = new Sim({ ...base, demand: 0.0001, fleet: 3 }, 5)
    s.runFor(WARMUP + 3600)
    const stats = s.stats()
    expect(s.completed).toBeLessThanOrEqual(1)
    expect(Number.isFinite(stats.avgSoc)).toBe(true)
  })
})

describe('Sim — conservation', () => {
  it('state-time buckets sum to fleet-seconds (post-warmup)', () => {
    const s = new Sim({ ...base }, 11)
    s.runFor(WARMUP + 3600)
    const total = (Object.values(s.stateTime) as number[]).reduce((a, b) => a + b, 0)
    const expected = 3600 * base.fleet
    expect(Math.abs(total - expected) / expected).toBeLessThan(0.01)
  })
})

describe('Sim — fleet performance regression pins', () => {
  it('a fleet of 6 keeps up with the default scenario', () => {
    const st = batchRun({ ...base, fleet: 6 }, 42, 4)
    expect(st.met).toBe(true)
    expect(st.tph).toBeGreaterThanOrEqual(st.offeredRate * 0.98)
    expect(st.p95).toBeGreaterThanOrEqual(st.p50)
    expect(st.p50).toBeGreaterThan(0)
  })

  it('a fleet of 8 on one bay with park-idle strands no vehicles and keeps up', () => {
    const st = batchRun({ ...base, fleet: 8 }, 42, 8)
    expect(st.stranded).toBe(0)
    expect(st.met).toBe(true)
    expect(st.tph).toBeGreaterThanOrEqual(st.offeredRate * 0.98)
  })

  it('the default seed confirms 5 vehicles as the knee (matches v1 baseline)', () => {
    // Same methodology as the app's "validate this fleet": REPS runs of
    // SIM_HOURS each, seeds offset by 7919, averaged — not a single run.
    const P = { ...base, fleet: 5 }
    const runs = []
    for (let r = 0; r < REPS; r++) runs.push(batchRun(P, 42 + r * 7919, SIM_HOURS))
    const st = avgStats(runs)
    expect(st.met).toBe(true)
    expect(st.tph).toBeCloseTo(41.6, 0)
    expect(st.busy).toBeCloseTo(0.74, 1)
  })
})
