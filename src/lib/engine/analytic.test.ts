import { describe, expect, it } from 'vitest'
import { analyze, type AnalyticParams } from './analytic.ts'

// Hand-checked defaults from the v1 tool: L=400 m, v=1.5 m/s, load=unload=30 s,
// demand=40/hr, availability 95%, util cap 85%, runtime 6 h, charge 1 h.
const base: AnalyticParams = {
  loopLen: 400,
  speed: 1.5,
  loadS: 30,
  unloadS: 30,
  demand: 40,
  battery: true,
  runtimeH: 6,
  chargeH: 1,
  availabilityPct: 95,
  maxUtilPct: 85,
}

describe('analyze — hand-checked regression pin', () => {
  it('cycle time is 326.667 s', () => {
    const a = analyze(base)
    expect(a.cycle).toBeCloseTo(326.6667, 3)
  })

  it('capacity per vehicle is 11.02 jobs/hr', () => {
    const a = analyze(base)
    expect(a.perVehicle).toBeCloseTo(11.0204, 3)
  })

  it('derate is 0.95 * (6/7) * 0.85 = 0.6921', () => {
    const a = analyze(base)
    expect(a.derate).toBeCloseTo(0.95 * (6 / 7) * 0.85, 9)
  })

  it('requires 6 vehicles with battery/charging modeled', () => {
    const a = analyze(base)
    expect(a.nReq).toBe(6)
  })

  it('requires 5 vehicles with charging overhead off', () => {
    const a = analyze({ ...base, battery: false })
    expect(a.nReq).toBe(5)
  })
})
