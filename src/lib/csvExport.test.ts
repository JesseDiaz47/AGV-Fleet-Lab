import { describe, expect, it } from 'vitest'
import { sweepToCsv } from './csvExport.ts'
import type { SweepPoint } from './engine/sweep.ts'

describe('sweepToCsv', () => {
  it('produces a header row plus one row per fleet size, rounded', () => {
    const results: SweepPoint[] = [
      { n: 1, tph: 11.123, offered: 40.456, busy: 0.9222, blocked: 0.001, p95: 19826.4, met: false },
      { n: 5, tph: 39.19, offered: 39.06, busy: 0.70001, blocked: 0.023, p95: 615.2, met: true },
    ]
    const csv = sweepToCsv(results)
    const lines = csv.trim().split('\n')

    expect(lines[0]).toBe('Fleet,Throughput (jobs/hr),Offered (jobs/hr),Utilization (%),Blocked (%),p95 flow time (s),Meets demand')
    expect(lines[1]).toBe('1,11.12,40.46,92.2,0.1,19826.4,No')
    expect(lines[2]).toBe('5,39.19,39.06,70,2.3,615.2,Yes')
  })

  it('produces just the header for an empty sweep', () => {
    const csv = sweepToCsv([])
    expect(csv.trim().split('\n').length).toBe(1)
  })
})
