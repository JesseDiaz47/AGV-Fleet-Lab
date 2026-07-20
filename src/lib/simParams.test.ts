import { describe, expect, it } from 'vitest'
import { defaultParams } from './defaults.ts'
import { toAnalyticParams, toSimParams } from './simParams.ts'

describe('toSimParams / toAnalyticParams', () => {
  it('carries every field the sim engine needs, dropping analytic-only fields', () => {
    const params = defaultParams()
    const sim = toSimParams(params)
    expect(sim.fleet).toBe(params.fleet)
    expect(sim.dispatchRule).toBe(params.dispatchRule)
    expect(sim.originWeights).toBe(params.originWeights)
    expect(sim.shiftProfile).toBe(params.shiftProfile)
    expect(sim).not.toHaveProperty('availabilityPct')
    expect(sim).not.toHaveProperty('seed')
  })

  it('carries every field the analytic model needs, dropping sim-only fields', () => {
    const params = defaultParams()
    const a = toAnalyticParams(params)
    expect(a.availabilityPct).toBe(params.availabilityPct)
    expect(a.maxUtilPct).toBe(params.maxUtilPct)
    expect(a).not.toHaveProperty('fleet')
    expect(a).not.toHaveProperty('dispatchRule')
  })
})
