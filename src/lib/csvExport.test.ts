import { describe, expect, it } from 'vitest'
import { statsToCsvRow, sweepToCsv } from './csvExport.ts'
import type { SweepPoint } from './engine/sweep.ts'
import type { SimStats } from './engine/sim.ts'

const sampleStats: SimStats = {
  tph: 39.19,
  offeredRate: 39.06,
  p50: 285.4,
  p95: 615.2,
  share: { loaded: 0.4, empty: 0.3, handling: 0.05, blocked: 0.02, charging: 0.1, idle: 0.13 },
  busy: 0.70001,
  blocked: 0.023,
  backlog: 1,
  met: true,
  stranded: 0,
  avgSoc: 72.5,
  reversePickupShare: 0.142857,
  reversePickups: 12,
  pickupsObserved: 84,
}

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

describe('statsToCsvRow', () => {
  it('writes a header + single row with all reverse-pickup KPIs', () => {
    const csv = statsToCsvRow(sampleStats, 5)
    const lines = csv.trim().split('\n')

    expect(lines[0]).toBe(
      'Fleet,Throughput (jobs/hr),Offered (jobs/hr),Utilization (%),Blocked (%),p50 flow time (s),p95 flow time (s),Backlog,Reverse pickup share (%),Reverse pickups,Pickups observed,Meets demand',
    )
    expect(lines[1]).toBe('5,39.19,39.06,70,2.3,285.4,615.2,1,14.3,12,84,Yes')
  })
})
