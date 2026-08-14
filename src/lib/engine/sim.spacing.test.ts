/**
 * Guide-path spacing invariant.
 *
 * The engine is a follow-the-leader, no-passing model: every vehicle ON the
 * guide path must stay at least `minGap` from every other vehicle on it. That
 * is the single physical rule the whole congestion model rests on — if it is
 * violated, "blocked share" and every throughput number derived from it are
 * describing vehicles that drove through each other.
 *
 * The checks below recompute pairwise circular separation from scratch, on
 * every step, independently of the engine's own gap bookkeeping. Vehicles on
 * the charge/park spur are off the guide path and are excluded; so are
 * stranded ones (ops has pulled them off).
 */
import { describe, expect, it } from 'vitest'
import { ST, Sim, WARMUP, type SimParams } from './sim.ts'

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

interface Violation {
  t: number
  a: number
  b: number
  posA: number
  posB: number
  sep: number
}

/** Shortest distance between two points on a circle of circumference L. */
function circularSep(a: number, b: number, L: number): number {
  const d = Math.abs(a - b) % L
  return Math.min(d, L - d)
}

/** Steps the sim and reports every step where two on-track vehicles are closer than minGap. */
function spacingProbe(P: SimParams, seed: number, seconds: number): Violation[] {
  const sim = new Sim(P, seed)
  const violations: Violation[] = []
  const steps = Math.round(seconds / 0.1)
  for (let i = 0; i < steps; i++) {
    sim.step()
    const onTrack = sim.vehicles.filter((v) => !v.offTrack && v.state !== ST.STRANDED)
    for (let x = 0; x < onTrack.length; x++) {
      for (let y = x + 1; y < onTrack.length; y++) {
        const sep = circularSep(onTrack[x].pos, onTrack[y].pos, P.loopLen)
        if (sep < P.minGap - 1e-6) {
          violations.push({ t: sim.t, a: onTrack[x].id, b: onTrack[y].id, posA: onTrack[x].pos, posB: onTrack[y].pos, sep })
        }
      }
    }
  }
  return violations
}

function describeFirst(v: Violation[]): string {
  if (v.length === 0) return 'none'
  const f = v[0]
  return `t=${f.t.toFixed(1)}s veh${f.a}@${f.posA.toFixed(4)}m veh${f.b}@${f.posB.toFixed(4)}m sep=${f.sep.toFixed(4)}m`
}

describe('guide-path spacing invariant', () => {
  it('holds on the default scenario with reverse pickup off', () => {
    const v = spacingProbe({ ...base }, 42, WARMUP + 3600)
    expect(v.length, `spacing violated: ${describeFirst(v)}`).toBe(0)
  })

  it('holds on the default scenario with reverse pickup on', () => {
    const v = spacingProbe({ ...base, allowReversePickup: true }, 42, WARMUP + 3600)
    expect(v.length, `spacing violated: ${describeFirst(v)}`).toBe(0)
  })

  it('holds across fleet sizes, both headings, with and without park-idle', () => {
    for (const fleet of [2, 5, 8, 12]) {
      for (const allowReversePickup of [false, true]) {
        for (const parkIdle of [false, true]) {
          const v = spacingProbe({ ...base, fleet, allowReversePickup, parkIdle }, 42, WARMUP + 1800)
          expect(
            v.length,
            `fleet ${fleet} reverse=${allowReversePickup} parkIdle=${parkIdle}: ${describeFirst(v)}`,
          ).toBe(0)
        }
      }
    }
  })

  it('holds with the battery model off (no charge-bay traffic at all)', () => {
    const v = spacingProbe({ ...base, battery: false, fleet: 8 }, 42, WARMUP + 1800)
    expect(v.length, `spacing violated: ${describeFirst(v)}`).toBe(0)
  })

  it('holds when the charge bay is busy enough to queue vehicles on the spur', () => {
    // Short runtime + slow charge + one bay: vehicles pile up parked at the
    // spur and re-enter the loop constantly.
    const v = spacingProbe({ ...base, fleet: 10, runtimeH: 1, chargeH: 2, chargeBays: 1 }, 42, WARMUP + 1800)
    expect(v.length, `spacing violated: ${describeFirst(v)}`).toBe(0)
  })

  it('reproduces the reported default-scenario violation and proves it is gone', () => {
    // The reported evidence: at t=182.5 s on the default geometry one vehicle
    // sat on the loop at the charge spur (366.6667 m) while a parked vehicle
    // was dispatched straight back onto the guide path on top of it, ending
    // the step 0.15 m away with minGap = 3 m.
    const v = spacingProbe({ ...base }, 42, 400)
    const atTheSpur = v.filter((x) => Math.abs(x.t - 182.5) < 0.05)
    expect(atTheSpur).toEqual([])
    expect(v).toEqual([])
  })
})

describe('spur re-entry rule', () => {
  /** Builds a sim and hand-places vehicles for a direct re-entry check. */
  function placed(P: Partial<SimParams>, positions: Array<{ pos: number; offTrack: boolean }>): Sim {
    const sim = new Sim({ ...base, fleet: positions.length, ...P }, 1)
    positions.forEach((p, i) => {
      sim.vehicles[i].pos = p.pos
      sim.vehicles[i].offTrack = p.offTrack
      sim.vehicles[i].state = ST.IDLE
    })
    return sim
  }

  it('lets a vehicle merge onto an empty loop', () => {
    const sim = placed({}, [{ pos: 366.6667, offTrack: true }])
    expect(sim.reEntryClear(sim.vehicles[0])).toBe(true)
  })

  it('refuses to merge on top of an on-track vehicle', () => {
    const sim = placed({}, [
      { pos: 366.6667, offTrack: true },
      { pos: 366.6667, offTrack: false },
    ])
    expect(sim.reEntryClear(sim.vehicles[0])).toBe(false)
  })

  it('treats an exact minGap gap ahead as clear, and a hair less as blocked', () => {
    const ahead = (d: number) =>
      placed({ minGap: 3 }, [
        { pos: 100, offTrack: true },
        { pos: 100 + d, offTrack: false },
      ])
    expect(ahead(3).reEntryClear(ahead(3).vehicles[0])).toBe(true)
    expect(ahead(2.999).reEntryClear(ahead(2.999).vehicles[0])).toBe(false)
  })

  it('treats an exact minGap gap behind as clear, and a hair less as blocked', () => {
    const behind = (d: number) =>
      placed({ minGap: 3 }, [
        { pos: 100, offTrack: true },
        { pos: 100 - d, offTrack: false },
      ])
    expect(behind(3).reEntryClear(behind(3).vehicles[0])).toBe(true)
    expect(behind(2.999).reEntryClear(behind(2.999).vehicles[0])).toBe(false)
  })

  it('checks the gap across the wraparound seam, not just within [0, L)', () => {
    // Entry at 395 m on a 400 m loop with minGap 10: a vehicle at 2 m is 7 m
    // ahead once the seam is crossed, so the merge is not clear.
    const sim = placed({ loopLen: 400, minGap: 10 }, [
      { pos: 395, offTrack: true },
      { pos: 2, offTrack: false },
    ])
    expect(sim.reEntryClear(sim.vehicles[0])).toBe(false)

    // And 12 m ahead across the same seam is clear.
    const ok = placed({ loopLen: 400, minGap: 10 }, [
      { pos: 395, offTrack: true },
      { pos: 7, offTrack: false },
    ])
    expect(ok.reEntryClear(ok.vehicles[0])).toBe(true)
  })

  it('ignores vehicles that are themselves off the guide path or stranded', () => {
    const sim = placed({}, [
      { pos: 366.6667, offTrack: true },
      { pos: 366.6667, offTrack: true },
      { pos: 367, offTrack: false },
    ])
    sim.vehicles[2].state = ST.STRANDED
    expect(sim.reEntryClear(sim.vehicles[0])).toBe(true)
  })
})

describe('spur re-entry does not starve or corrupt state', () => {
  it('never leaves a vehicle waiting off-track indefinitely on the default scenario', () => {
    const sim = new Sim({ ...base }, 42)
    const waitingSince = new Map<number, number>()
    let worstWait = 0
    const steps = Math.round((WARMUP + 3600) / 0.1)
    for (let i = 0; i < steps; i++) {
      sim.step()
      for (const v of sim.vehicles) {
        // Only count a vehicle that is idle on the spur with work queued: it
        // wants to be on the loop and something is holding it back.
        const wantsTrack = v.offTrack && v.state === ST.IDLE && sim.pending.length > 0
        if (!wantsTrack) {
          waitingSince.delete(v.id)
          continue
        }
        if (!waitingSince.has(v.id)) waitingSince.set(v.id, sim.t)
        worstWait = Math.max(worstWait, sim.t - waitingSince.get(v.id)!)
      }
    }
    // One lap of the 400 m loop at 1.5 m/s is ~267 s; a merge window has to
    // open long before a vehicle has watched two laps go by.
    expect(worstWait).toBeLessThan(600)
  })

  it('keeps charge-bay ownership consistent with vehicle state at every step', () => {
    const sim = new Sim({ ...base, fleet: 8, runtimeH: 1, chargeH: 2 }, 42)
    const steps = Math.round((WARMUP + 1800) / 0.1)
    // Check with plain comparisons and assert once, as the starvation test
    // above does: an expect() per vehicle per step costs more than the 27k
    // simulation steps it is guarding.
    let violation: string | null = null
    for (let i = 0; i < steps && violation === null; i++) {
      sim.step()
      if (sim.charging.size > base.chargeBays) {
        violation = `step ${i}: ${sim.charging.size} bays in use, capacity ${base.chargeBays}`
        break
      }
      for (const v of sim.vehicles) {
        if (sim.charging.has(v.id) !== (v.state === ST.CHARGING)) {
          violation = `step ${i}: veh ${v.id} state ${v.state} vs bay ownership ${sim.charging.has(v.id)}`
          break
        }
      }
    }
    expect(violation).toBeNull()
  })

  it('keeps station waiting counts and the pending queue honest', () => {
    const sim = new Sim({ ...base, fleet: 6 }, 42)
    const steps = Math.round((WARMUP + 1800) / 0.1)
    let violation: string | null = null
    for (let i = 0; i < steps && violation === null; i++) {
      sim.step()
      for (const st of sim.stations) {
        if (st.waiting < 0) {
          violation = `step ${i}: station waiting count ${st.waiting}`
          break
        }
      }
      if (violation !== null) break
      // Every job is either pending, or held by exactly one vehicle.
      const held = sim.vehicles.filter((v) => v.job !== null).length
      const assignedStates = sim.vehicles.filter(
        (v) => v.state === ST.TO_PICKUP || v.state === ST.LOADING || v.state === ST.TO_DROP || v.state === ST.UNLOADING,
      ).length
      if (held !== assignedStates) violation = `step ${i}: ${held} jobs held vs ${assignedStates} assigned states`
    }
    expect(violation).toBeNull()
    // Waiting counts must reconcile with jobs not yet picked up.
    const totalWaiting = sim.stations.reduce((a, s) => a + s.waiting, 0)
    const notYetPicked = sim.pending.length + sim.vehicles.filter((v) => v.state === ST.TO_PICKUP).length
    expect(totalWaiting).toBe(notYetPicked)
  })

  it('never lets battery drop below zero or above 100', () => {
    const sim = new Sim({ ...base, fleet: 8, runtimeH: 1, chargeH: 2 }, 42)
    const steps = Math.round((WARMUP + 1800) / 0.1)
    let violation: string | null = null
    for (let i = 0; i < steps && violation === null; i++) {
      sim.step()
      for (const v of sim.vehicles) {
        // Negated range check, so a NaN soc is a violation rather than a pass.
        if (!(v.soc >= 0 && v.soc <= 100)) {
          violation = `step ${i}: veh ${v.id} soc ${v.soc}`
          break
        }
      }
    }
    expect(violation).toBeNull()
  })
})
