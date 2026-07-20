import { describe, expect, it } from 'vitest'
import { findRollover, niceMax, pickKnee, sweepSizes, type SweepPoint } from './sweep.ts'

describe('niceMax', () => {
  it('rounds up to a nice step', () => {
    expect(niceMax(43)).toBe(50)
    expect(niceMax(19)).toBe(20)
    expect(niceMax(0)).toBe(1)
    expect(niceMax(NaN)).toBe(1)
  })
})

describe('sweepSizes', () => {
  it('covers the analytic estimate plus headroom, capped at 14', () => {
    const sizes = sweepSizes({ nReq: 6, nRaw: 3.63, derate: 0.6921 })
    expect(sizes[0]).toBe(1)
    expect(sizes[sizes.length - 1]).toBeGreaterThanOrEqual(9)
    expect(sizes[sizes.length - 1]).toBeLessThanOrEqual(14)
  })
})

const pt = (n: number, tph: number, met: boolean): SweepPoint => ({ n, tph, offered: 40, blocked: 0.05, busy: 0.7, p95: 300, met })

describe('pickKnee', () => {
  it('picks the smallest fleet that meets demand', () => {
    const results = [pt(1, 10, false), pt(2, 20, false), pt(3, 41, true), pt(4, 42, true)]
    expect(pickKnee(results)).toBe(3)
  })

  it('falls back to best throughput when nothing meets demand', () => {
    const results = [pt(1, 10, false), pt(2, 25, false), pt(3, 20, false)]
    expect(pickKnee(results)).toBe(2)
  })

  it('returns null for an empty result set', () => {
    expect(pickKnee([])).toBeNull()
  })
})

describe('findRollover', () => {
  it('finds the first fleet size where throughput drops', () => {
    const results = [pt(1, 10, false), pt(2, 20, true), pt(3, 25, true), pt(4, 24, true)]
    expect(findRollover(results)).toBe(4)
  })

  it('returns null when throughput never drops', () => {
    const results = [pt(1, 10, false), pt(2, 20, true), pt(3, 25, true)]
    expect(findRollover(results)).toBeNull()
  })
})
