import { describe, expect, it } from 'vitest'
import { buildVerdictLines } from './verdict.ts'
import type { SweepPoint } from './engine/sweep.ts'

const point = (n: number, tph: number, met: boolean): SweepPoint => ({
  n,
  tph,
  offered: 40,
  busy: 0.7,
  blocked: 0.02,
  p95: 500,
  met,
})

describe('buildVerdictLines', () => {
  it('returns nothing when the sweep has not been run', () => {
    expect(buildVerdictLines(6, 5, [])).toEqual([])
  })

  it('confirms the analytic estimate when the simulated knee matches it', () => {
    const results = [point(5, 30, false), point(6, 40, true), point(7, 41, true)]
    const lines = buildVerdictLines(6, 6, results)
    expect(lines[0]).toMatch(/confirms the analytic estimate/)
    expect(lines[1]).toMatch(/holds up in simulation/)
  })

  it('flags when congestion pushes the simulated requirement above the analytic estimate', () => {
    const results = [point(5, 30, false), point(6, 35, false), point(7, 40, true)]
    const lines = buildVerdictLines(5, 5, results)
    expect(lines[0]).toMatch(/pushes the simulated requirement up to 7/)
    expect(lines[1]).toMatch(/does NOT meet demand/)
  })

  it('flags when the analytic pass was conservative relative to simulation', () => {
    const results = [point(4, 40, true), point(5, 41, true)]
    const lines = buildVerdictLines(6, 5, results)
    expect(lines[0]).toMatch(/fewer vehicles \(4\)/)
  })

  it('flags when no fleet size in range meets demand', () => {
    const results = [point(1, 10, false), point(2, 18, false)]
    const lines = buildVerdictLines(6, 2, results)
    expect(lines[0]).toMatch(/No fleet size in the sweep range met demand/)
  })

  it('flags rollover when throughput drops as fleet size increases', () => {
    const results = [point(5, 40, true), point(6, 39, true), point(7, 38, true)]
    const lines = buildVerdictLines(5, 5, results)
    expect(lines.some((l) => l.includes('Throughput drops past 6 vehicles'))).toBe(true)
  })
})
