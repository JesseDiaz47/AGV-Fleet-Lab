import { describe, expect, it } from 'vitest'
import { mulberry32, triSample } from './prng.ts'

describe('triSample', () => {
  it('is symmetric around the mode and bounded', () => {
    const rng = mulberry32(99)
    let sum = 0
    let mn = Infinity
    let mx = -Infinity
    const N = 20000
    for (let i = 0; i < N; i++) {
      const v = triSample(rng, 30, 0.25)
      sum += v
      mn = Math.min(mn, v)
      mx = Math.max(mx, v)
    }
    expect(Math.abs(sum / N - 30)).toBeLessThan(0.5)
    expect(mn).toBeGreaterThanOrEqual(22.5 - 1e-9)
    expect(mx).toBeLessThanOrEqual(37.5 + 1e-9)
  })
})
