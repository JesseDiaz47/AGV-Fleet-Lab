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

  describe('when nothing met demand', () => {
    // pickKnee() falls back to the best-throughput point for chart/table
    // highlighting. Feeding that fallback into the recommendation produced a
    // self-contradicting verdict: "no fleet size met demand" followed by
    // "consider raising it to at least 1". A recommendation must only ever
    // name a fleet size that actually met demand.
    const collapsed = [point(1, 13.2, false), point(2, 8.5, false), point(3, 6.5, false), point(4, 5.7, false), point(5, 5.0, false)]

    it('never recommends raising the fleet to a size that also fell short', () => {
      const lines = buildVerdictLines(6, 5, collapsed)
      const joined = lines.join('\n')
      expect(joined).toMatch(/No fleet size in the sweep range met demand/)
      expect(joined).not.toMatch(/at least/)
      expect(joined).not.toMatch(/consider raising/i)
    })

    it('exactly reproduces the reported contradiction and proves it is gone', () => {
      // The best-throughput fallback here is fleet 1 — smaller than the chosen
      // fleet of 5 — so the old text read "raise it to at least 1".
      const lines = buildVerdictLines(6, 5, collapsed)
      expect(lines).not.toContain("The scenario's chosen fleet size (5) does NOT meet demand in simulation — consider raising it to at least 1.")
      expect(lines.some((l) => /to at least 1\b/.test(l))).toBe(false)
    })

    it('points at the layout, assumptions, policy or demand target instead', () => {
      const joined = buildVerdictLines(6, 5, collapsed).join('\n')
      expect(joined).toMatch(/guide-path layout|assumptions|operating polic|demand target/i)
    })

    it('still reports that the chosen fleet fell short', () => {
      const lines = buildVerdictLines(6, 5, collapsed)
      expect(lines.some((l) => /chosen fleet size \(5\)/.test(l) && /does NOT meet demand/.test(l))).toBe(true)
    })
  })

  it('still recommends the smallest successful fleet when one exists', () => {
    const results = [point(4, 30, false), point(5, 35, false), point(6, 41, true), point(7, 42, true)]
    const lines = buildVerdictLines(6, 4, results)
    expect(lines.some((l) => /consider raising it to at least 6/.test(l))).toBe(true)
  })

  it('recommends the smallest successful fleet, not the highest-throughput one', () => {
    // Fleet 7 has the best throughput; fleet 6 is the smallest that meets
    // demand and is what should be recommended.
    const results = [point(5, 35, false), point(6, 41, true), point(7, 48, true)]
    const lines = buildVerdictLines(6, 5, results)
    expect(lines.some((l) => /to at least 6\b/.test(l))).toBe(true)
    expect(lines.some((l) => /to at least 7\b/.test(l))).toBe(false)
  })

  describe('when the chosen fleet is larger than the successful region', () => {
    // Fleets 5-7 meet demand; past 7 the loop rolls over and 8/9 fall short.
    // Telling the reader to "raise 8 to at least 5" is a contradiction: 5 is
    // smaller than what they already have. The failure here is over-fleeting.
    const rolledOver = [
      point(4, 30, false),
      point(5, 41, true),
      point(6, 42, true),
      point(7, 41.5, true),
      point(8, 30, false),
      point(9, 22, false),
    ]

    it('never phrases a smaller successful fleet as "raising" the chosen one', () => {
      const joined = buildVerdictLines(6, 8, rolledOver).join('\n')
      expect(joined).not.toMatch(/raising it to at least/i)
      expect(joined).not.toMatch(/to at least 5\b/)
    })

    it('names over-fleeting/congestion as the cause in the chosen-fleet line itself', () => {
      // Not just in the separate rollover line — the line that reports the
      // shortfall has to explain it, or the reader is left with a bare
      // failure and a smaller number.
      const chosenLine = buildVerdictLines(6, 8, rolledOver).find((l) => l.includes('chosen fleet size (8)')) ?? ''
      expect(chosenLine).toMatch(/over-fleet|congestion/i)
    })

    it('still states the smallest fleet that did meet demand', () => {
      const lines = buildVerdictLines(6, 8, rolledOver)
      expect(lines.some((l) => /chosen fleet size \(8\)/.test(l) && /does NOT meet demand/.test(l))).toBe(true)
      expect(lines.some((l) => /\b5 vehicles\b/.test(l))).toBe(true)
    })

    it('applies the same reading further past the rollover', () => {
      const joined = buildVerdictLines(6, 9, rolledOver).join('\n')
      expect(joined).not.toMatch(/raising it to at least/i)
      expect(joined).toMatch(/over-fleet|congestion/i)
    })

    it('still tells a genuinely under-fleeted scenario to raise the fleet', () => {
      const joined = buildVerdictLines(6, 4, rolledOver).join('\n')
      expect(joined).toMatch(/consider raising it to at least 5/)
    })

    it('still says a successful chosen fleet holds up', () => {
      const joined = buildVerdictLines(6, 6, rolledOver).join('\n')
      expect(joined).toMatch(/holds up in simulation/)
    })
  })

  it('flags rollover when throughput drops as fleet size increases', () => {
    const results = [point(5, 40, true), point(6, 39, true), point(7, 38, true)]
    const lines = buildVerdictLines(5, 5, results)
    expect(lines.some((l) => l.includes('Throughput drops past 6 vehicles'))).toBe(true)
  })
})
