/**
 * The battery-model switch.
 *
 * `battery: false` means the battery is OUTSIDE THE MODEL — not "a battery
 * that never charges". analyze() reads the flag exactly that way (it zeroes
 * chargeOverhead), so the simulation has to agree: with the flag off there is
 * no drain, no charging traffic, and no dead-battery strandings.
 *
 * The bug these pin against: drain and the strand check ran unconditionally
 * while every recharge path was gated on P.battery, so turning the battery
 * model off gave every vehicle a one-way discharge. On the default scenario
 * the whole fleet ran flat and stranded, throughput fell ~35%, and the run
 * flipped from "meets demand" to "falls short" — on the setting the user
 * picked to say batteries don't matter.
 *
 * A spacing-only check cannot catch this: stranded vehicles are pulled OFF
 * the guide path, so a loop full of corpses satisfies every gap invariant.
 * These assertions are on throughput, charge and stranding instead.
 */
import { describe, expect, it } from 'vitest'
import { SIM_HOURS, Sim, WARMUP, batchRun, type SimParams } from './sim.ts'

const SEED = 1234

// The hand-checked default scenario shared with sim.test.ts / analytic.test.ts.
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

describe('Sim — battery model off', () => {
  // 8 h at runtimeH: 6 is comfortably past a full discharge from any starting
  // charge. A shorter probe would pass with the drain bug still in place.
  const off = batchRun({ ...base, battery: false }, SEED, SIM_HOURS)

  it('strands nobody — there is no battery to run flat', () => {
    expect(off.stranded).toBe(0)
  })

  it('holds every vehicle at full charge for the whole run', () => {
    expect(off.avgSoc).toBe(100)
  })

  it('generates no charging traffic at all', () => {
    expect(off.share.charging).toBe(0)
  })

  it('keeps up with demand', () => {
    expect(off.tph).toBeGreaterThanOrEqual(off.offeredRate * 0.98)
    expect(off.met).toBe(true)
  })

  it('never lets a vehicle leave full charge, step by step', () => {
    const sim = new Sim({ ...base, battery: false, fleet: 8 }, 42)
    const steps = Math.round((WARMUP + 7200) / 0.1)
    for (let i = 0; i < steps; i++) {
      sim.step()
      for (const v of sim.vehicles) expect(v.soc).toBe(100)
    }
  })

  it('does at least as well as the same scenario carrying charge overhead', () => {
    // Not a tautology: it is the whole reason the flag exists. Charging pulls
    // vehicles off the loop, so removing the constraint cannot cost throughput.
    const on = batchRun({ ...base }, SEED, SIM_HOURS)
    expect(off.tph).toBeGreaterThanOrEqual(on.tph)
  })
})

describe('Sim — battery model on (the drain still has to work)', () => {
  // The counterweight: the fix above must not become "delete the battery
  // model". With the flag ON, charge has to move and bays have to see use.
  const on = batchRun({ ...base }, SEED, SIM_HOURS)

  it('discharges vehicles below full', () => {
    expect(on.avgSoc).toBeLessThan(100)
    expect(on.avgSoc).toBeGreaterThan(0)
  })

  it('sends vehicles to the charge bays', () => {
    expect(on.share.charging).toBeGreaterThan(0)
  })

  it('still strands a fleet that cannot outrun its own discharge', () => {
    // One bay, 1 h of runtime, 2 h to refill: the fleet cannot keep itself
    // charged and vehicles must die. Proves strandings are still reachable.
    const starved = batchRun({ ...base, fleet: 6, runtimeH: 1, chargeH: 2, chargeBays: 1 }, 42, SIM_HOURS)
    expect(starved.stranded).toBeGreaterThan(0)
  })
})
