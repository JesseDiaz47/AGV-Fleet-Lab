/**
 * The engine refuses geometry it cannot represent.
 *
 * A fleet whose combined `minGap` exceeds the loop cannot exist on the guide
 * path at all — the vehicles are already inside each other at t=0. The old
 * behavior was to simulate it anyway and report the result as data: on
 * loopLen 60 / fleet 14 / minGap 20 a one-hour run returned 0 jobs/hr with a
 * blocked share of exactly 1.0, which reads as "this fleet is congested"
 * rather than "this fleet cannot be built".
 */
import { describe, expect, it } from 'vitest'
import { REPS, SIM_HOURS, Sim, avgStats, batchRun, type SimParams } from './sim.ts'

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

describe('Sim — geometric feasibility', () => {
  it('refuses the reported impossible configuration instead of reporting 0/hr', () => {
    const impossible = { ...base, loopLen: 60, minGap: 20, fleet: 14 }
    expect(() => new Sim(impossible, 42)).toThrow(RangeError)
    expect(() => new Sim(impossible, 42)).toThrow(/60 m|does not fit|infeasible/i)
  })

  it('refuses through batchRun too, so no caller can reach the old behavior', () => {
    expect(() => batchRun({ ...base, loopLen: 60, minGap: 20, fleet: 14 }, 42, 1)).toThrow(RangeError)
  })

  it('refuses an exactly-full loop, which cannot move at all', () => {
    // 3 * 20 = 60: every gap is exactly minGap, so nobody can ever move.
    expect(() => new Sim({ ...base, loopLen: 60, minGap: 20, fleet: 3 }, 42)).toThrow(RangeError)
  })

  it('accepts the largest fleet that does fit on the same loop', () => {
    const sim = new Sim({ ...base, loopLen: 60, minGap: 20, fleet: 2 }, 42)
    expect(sim.vehicles).toHaveLength(2)
  })

  it('leaves every valid scenario in the existing suite alone', () => {
    for (const fleet of [1, 2, 5, 8, 14]) {
      expect(() => new Sim({ ...base, fleet }, 42)).not.toThrow()
    }
    // The congestion fixture used by the lastBlockedIds test: 8 * 15 = 120 m
    // on a 400 m loop is tight but buildable.
    expect(() => new Sim({ ...base, fleet: 8, minGap: 15 }, 42)).not.toThrow()
  })

  it('does not perturb the pinned v1 fleet-5 knee', () => {
    const runs = []
    for (let r = 0; r < REPS; r++) runs.push(batchRun({ ...base, fleet: 5 }, 42 + r * 7919, SIM_HOURS))
    const st = avgStats(runs)
    expect(st.met).toBe(true)
    expect(st.tph).toBeCloseTo(41.6, 0)
    expect(st.busy).toBeCloseTo(0.74, 1)
  })
})
