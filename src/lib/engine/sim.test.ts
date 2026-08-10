import { describe, expect, it } from 'vitest'
import { REPS, SIM_HOURS, Sim, WARMUP, avgStats, batchRun, type SimParams } from './sim.ts'

// Same hand-checked default scenario as analytic.test.ts, plus a starting fleet.
// Reverse-direction empty pickup defaults OFF in the regression fixture so the
// pinned tph/busy numbers stay byte-identical to the v1 baseline — the
// separate reverse-pickup tests opt in explicitly.
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
  allowReversePickup: false,
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

describe('Sim — dispatch rule wiring', () => {
  it('an unset dispatchRule behaves identically to explicit nearestVehicle', () => {
    const a = new Sim({ ...base }, 42)
    a.runFor(WARMUP + 3600)
    const b = new Sim({ ...base, dispatchRule: 'nearestVehicle' }, 42)
    b.runFor(WARMUP + 3600)
    expect(b.completed).toBe(a.completed)
  })

  it('fcfs and longestIdleVehicle still produce valid, stable-enough runs', () => {
    for (const dispatchRule of ['fcfs', 'longestIdleVehicle'] as const) {
      const st = batchRun({ ...base, fleet: 8, dispatchRule }, 42, 4)
      expect(st.stranded).toBe(0)
      expect(Number.isFinite(st.tph)).toBe(true)
      expect(st.tph).toBeGreaterThan(0)
    }
  })

  it('nearestVehicle throughput is at least as good as the naive fcfs baseline at a tight fleet size', () => {
    // Nearest-vehicle dispatch is why the sim beats the analytic estimate;
    // a naive FCFS-any-idle policy should never do better.
    const nearest = batchRun({ ...base, fleet: 5, dispatchRule: 'nearestVehicle' }, 42, 8)
    const fcfs = batchRun({ ...base, fleet: 5, dispatchRule: 'fcfs' }, 42, 8)
    expect(nearest.tph).toBeGreaterThanOrEqual(fcfs.tph - 0.5) // small slack for stochastic noise
  })
})

describe('Sim — shift profile wiring', () => {
  it('an unset shiftProfile behaves identically to null', () => {
    const a = new Sim({ ...base }, 42)
    a.runFor(WARMUP + 3600)
    const b = new Sim({ ...base, shiftProfile: null }, 42)
    b.runFor(WARMUP + 3600)
    expect(b.completed).toBe(a.completed)
  })

  it('a peaked shift profile still produces a valid, non-crashing run', () => {
    const st = batchRun(
      {
        ...base,
        fleet: 8,
        shiftProfile: [
          { startHour: 0, multiplier: 0.3 },
          { startHour: 8, multiplier: 2 },
          { startHour: 16, multiplier: 0.5 },
        ],
      },
      42,
      8,
    )
    expect(Number.isFinite(st.tph)).toBe(true)
    expect(st.stranded).toBeGreaterThanOrEqual(0)
  })
})

describe('Sim — reverse-direction empty pickup', () => {
  it('regression: allowReversePickup=false reproduces the v1 pinned fleet-5 knee', () => {
    // The reverse-pickup feature must not perturb the pinned numbers when
    // disabled — that's the contract that lets the rest of the suite stay
    // green after the feature lands.
    const P = { ...base, fleet: 5, allowReversePickup: false }
    const runs = []
    for (let r = 0; r < REPS; r++) runs.push(batchRun(P, 42 + r * 7919, SIM_HOURS))
    const st = avgStats(runs)
    expect(st.met).toBe(true)
    expect(st.tph).toBeCloseTo(41.6, 0)
    expect(st.busy).toBeCloseTo(0.74, 1)
    expect(st.reversePickupShare).toBe(0)
  })

  it('allowReversePickup=true actually fires reverse pickups on the default scenario', () => {
    // The default layout has 6 stations on a 400m loop; with 5 vehicles
    // and the given demand, at least some pickups should be shorter via
    // reverse than via forward — the counter must reflect that.
    const P = { ...base, fleet: 5, allowReversePickup: true }
    const st = batchRun(P, 42, SIM_HOURS)
    expect(st.reversePickups).toBeGreaterThan(0)
    expect(st.pickupsObserved).toBeGreaterThan(0)
  })

  it('reversePickupShare is the fraction of observed pickups that went reverse', () => {
    const P = { ...base, fleet: 5, allowReversePickup: true }
    const st = batchRun(P, 42, SIM_HOURS)
    expect(st.reversePickupShare).toBeGreaterThan(0)
    expect(st.reversePickupShare).toBeLessThanOrEqual(1)
    expect(st.reversePickupShare).toBeCloseTo(st.reversePickups / st.pickupsObserved, 6)
  })
})

describe('Sim — lastBlockedIds (render-only, does not affect stats)', () => {
  it('gets populated during congestion without changing completion counts', () => {
    // Tight fleet + wide min gap forces congestion quickly, so some vehicle
    // should get tallied as blocked within a short warm run.
    const congested: SimParams = { ...base, fleet: 8, minGap: 15 }
    const withTracking = new Sim(congested, 42)
    let sawBlocked = false
    for (let i = 0; i < 6000; i++) {
      withTracking.step()
      if (withTracking.lastBlockedIds.size > 0) sawBlocked = true
    }
    expect(sawBlocked).toBe(true)

    // Reading lastBlockedIds is purely observational: an identical run that
    // never reads it completes the same number of jobs.
    const untouched = new Sim(congested, 42)
    untouched.runFor(600)
    expect(untouched.completed).toBe(withTracking.completed)
  })
})
