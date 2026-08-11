/**
 * Reverse-direction empty pickup: experimental give-way invariants.
 *
 * The guide-path model is a SINGLE ONE-WAY LOOP with follow-the-leader,
 * no-passing spacing. Letting an empty vehicle back up toward a pickup puts
 * it nose-to-nose with forward traffic unless the experimental give-way rule
 * intervenes. These tests pin the narrow invariants that rule must preserve;
 * they are not proof of a general bidirectional traffic-control model:
 *
 *   - no head-on conflict (a reverse vehicle backing into a forward vehicle),
 *   - no permanent blocking (every jam must clear on its own),
 *   - throughput must not collapse as the fleet grows,
 *   - reverse OFF must stay byte-identical to the v1 one-way baseline.
 */
import { describe, expect, it } from 'vitest'
import { REPS, SIM_HOURS, ST, Sim, WARMUP, avgStats, batchRun, type SimParams } from './sim.ts'

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
  allowReversePickup: true,
}

/**
 * Longest continuous stretch (seconds) any single vehicle spent blocked, plus
 * the number of steps a reverse-heading vehicle was inside `minGap` of a
 * forward-heading vehicle that was closing on it (a head-on conflict).
 *
 * The one-way baseline clears every jam within ~175 s at these settings, so a
 * jam lasting minutes on end is a deadlock, not congestion. Reading
 * `lastBlockedIds` is purely observational — it does not affect the run.
 */
function trafficProbe(P: SimParams, seed: number, seconds: number) {
  const sim = new Sim(P, seed)
  const streak = new Map<number, number>()
  let worstBlockedSteps = 0
  let headOnSteps = 0
  const steps = Math.round(seconds / 0.1)
  for (let i = 0; i < steps; i++) {
    sim.step()
    for (const v of sim.vehicles) {
      if (sim.lastBlockedIds.has(v.id)) {
        const n = (streak.get(v.id) ?? 0) + 1
        streak.set(v.id, n)
        if (n > worstBlockedSteps) worstBlockedSteps = n
      } else {
        streak.set(v.id, 0)
      }
    }
    const onTrack = sim.vehicles.filter((v) => !v.offTrack && v.state !== ST.STRANDED)
    for (const rev of onTrack) {
      if (rev.heading !== -1) continue
      for (const f of onTrack) {
        if (f === rev || f.heading !== 1) continue
        // `f` sits directly behind `rev` in forward terms, so `rev` is backing
        // straight into it: the two are closing head-on.
        if (sim.fwd(f.pos, rev.pos) < P.minGap) headOnSteps++
      }
    }
  }
  return { sim, worstBlockedS: worstBlockedSteps * 0.1, headOnSteps }
}

describe('reverse pickup — head-on conflict', () => {
  it('never lets a reversing vehicle close inside minGap of forward traffic', () => {
    for (const fleet of [2, 5, 8]) {
      const { headOnSteps } = trafficProbe({ ...base, fleet }, 42, WARMUP + 4 * 3600)
      expect(headOnSteps, `fleet ${fleet} had head-on conflicts`).toBe(0)
    }
  })
})

describe('reverse pickup — deadlock freedom', () => {
  it('clears every jam: no vehicle stays blocked for minutes on end', () => {
    // The one-way baseline's worst single-vehicle jam at these settings is
    // ~175 s (well under two laps of the 400 m loop at 1.5 m/s). 600 s is a
    // generous ceiling that still separates congestion from gridlock.
    for (const fleet of [2, 5, 8]) {
      const { worstBlockedS } = trafficProbe({ ...base, fleet }, 42, WARMUP + 4 * 3600)
      expect(worstBlockedS, `fleet ${fleet} deadlocked`).toBeLessThan(600)
    }
  })

  it('strands no vehicles on the default scenario (a gridlocked fleet drains to 0% SoC)', () => {
    const st = batchRun({ ...base, fleet: 5 }, 42, SIM_HOURS)
    expect(st.stranded).toBe(0)
  })
})

describe('reverse pickup — throughput credibility', () => {
  it('keeps up with demand at the baseline knee of 5 vehicles', () => {
    const P = { ...base, fleet: 5 }
    const runs = []
    for (let r = 0; r < REPS; r++) runs.push(batchRun(P, 42 + r * 7919, SIM_HOURS))
    const st = avgStats(runs)
    expect(st.tph).toBeGreaterThanOrEqual(st.offeredRate * 0.98)
    expect(st.met).toBe(true)
  })

  it('throughput rises with fleet size over a small sweep', () => {
    // Not strict monotonicity — over-fleeting a single loop genuinely costs
    // throughput. But a bigger fleet must not be dramatically WORSE than a
    // fleet of one, which is what a deadlocking model produces.
    const tph = [1, 2, 3, 4, 5].map((fleet) => batchRun({ ...base, fleet }, 42, 4).tph)
    for (let i = 1; i < tph.length; i++) {
      expect(tph[i], `fleet ${i + 1} (${tph[i].toFixed(2)}/hr) collapsed vs fleet ${i} (${tph[i - 1].toFixed(2)}/hr)`).toBeGreaterThan(tph[i - 1] * 0.9)
    }
  })

  it('produces finite, physically meaningful KPIs', () => {
    const st = batchRun({ ...base, fleet: 5 }, 42, 4)
    for (const [k, v] of Object.entries(st)) {
      if (typeof v === 'number') expect(Number.isFinite(v), `${k} is not finite`).toBe(true)
    }
    expect(st.p50).toBeGreaterThan(0)
    expect(st.p95).toBeGreaterThanOrEqual(st.p50)
    // A flow time of hours on a 400 m loop with 30 s handling is not credible.
    expect(st.p95).toBeLessThan(3600)
    expect(st.blocked).toBeLessThan(0.25)
    // A fleet averaging single-digit charge has been sitting still, not working.
    expect(st.avgSoc).toBeGreaterThan(10)
  })
})

describe('reverse pickup — determinism and conservation still hold', () => {
  it('is deterministic for identical seeds', () => {
    const a = new Sim({ ...base }, 7)
    a.runFor(WARMUP + 3600)
    const b = new Sim({ ...base }, 7)
    b.runFor(WARMUP + 3600)
    expect(b.completed).toBe(a.completed)
    expect(b.stats()).toEqual(a.stats())
    expect(a.completed).toBeGreaterThan(0)
  })

  it('conserves state-time as fleet-seconds', () => {
    const s = new Sim({ ...base }, 11)
    s.runFor(WARMUP + 3600)
    const total = (Object.values(s.stateTime) as number[]).reduce((x, y) => x + y, 0)
    const expected = 3600 * base.fleet
    expect(Math.abs(total - expected) / expected).toBeLessThan(0.01)
  })
})

describe('reverse pickup — KPI accounting', () => {
  it('reports a share that matches the observed reverse pickups', () => {
    const st = batchRun({ ...base, fleet: 5 }, 42, SIM_HOURS)
    expect(st.pickupsObserved).toBeGreaterThan(0)
    expect(st.reversePickups).toBeLessThanOrEqual(st.pickupsObserved)
    expect(st.reversePickupShare).toBeCloseTo(st.reversePickups / st.pickupsObserved, 12)
  })

  it('reports exactly zero reverse activity when the feature is off', () => {
    const st = batchRun({ ...base, fleet: 5, allowReversePickup: false }, 42, SIM_HOURS)
    expect(st.reversePickups).toBe(0)
    expect(st.reversePickupShare).toBe(0)
    expect(st.pickupsObserved).toBeGreaterThan(0)
  })

  it('counts a reverse pickup only when the vehicle actually arrived reversing', () => {
    // Walk the run and tally reverse arrivals independently of the engine's
    // own counter, then compare.
    const sim = new Sim({ ...base, fleet: 5 }, 42)
    let expectedReverse = 0
    const steps = Math.round((WARMUP + 4 * 3600) / 0.1)
    for (let i = 0; i < steps; i++) {
      const before = sim.vehicles.map((v) => ({ state: v.state, heading: v.heading }))
      sim.step()
      sim.vehicles.forEach((v, idx) => {
        const wasReversingToPickup = before[idx].state === ST.TO_PICKUP && before[idx].heading === -1
        if (wasReversingToPickup && v.state === ST.LOADING && sim.t > WARMUP) expectedReverse++
      })
    }
    expect(sim.reversePickups).toBe(expectedReverse)
  })
})

describe('reverse pickup — the one-way baseline is untouched', () => {
  it('reproduces the v1 pinned fleet-5 knee when disabled', () => {
    const P = { ...base, fleet: 5, allowReversePickup: false }
    const runs = []
    for (let r = 0; r < REPS; r++) runs.push(batchRun(P, 42 + r * 7919, SIM_HOURS))
    const st = avgStats(runs)
    expect(st.met).toBe(true)
    expect(st.tph).toBeCloseTo(41.6, 0)
    expect(st.busy).toBeCloseTo(0.74, 1)
    expect(st.stranded).toBe(0)
  })

  it('an unset allowReversePickup behaves identically to explicitly off', () => {
    const off = { ...base, allowReversePickup: false }
    const unset: SimParams = { ...base }
    delete unset.allowReversePickup
    const a = new Sim(off, 42)
    a.runFor(WARMUP + 3600)
    const b = new Sim(unset, 42)
    b.runFor(WARMUP + 3600)
    expect(b.completed).toBe(a.completed)
    expect(b.stats()).toEqual(a.stats())
  })
})
