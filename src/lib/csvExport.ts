/** CSV export for the fleet-size sweep table. */
import { toCsv, csvRound } from './csv.ts'
import type { SweepPoint } from './engine/sweep.ts'
import type { SimStats } from './engine/sim.ts'

export function sweepToCsv(results: SweepPoint[]): string {
  return toCsv(
    ['Fleet', 'Throughput (jobs/hr)', 'Offered (jobs/hr)', 'Utilization (%)', 'Blocked (%)', 'p95 flow time (s)', 'Meets demand'],
    results.map((r) => [
      r.n,
      csvRound(r.tph, 2),
      csvRound(r.offered, 2),
      csvRound(r.busy * 100, 1),
      csvRound(r.blocked * 100, 1),
      csvRound(r.p95, 1),
      r.met ? 'Yes' : 'No',
    ]),
  )
}

/**
 * Per-scenario row CSV export. Captures the headline KPIs of a single
 * batch-run SimStats alongside the scenario's chosen fleet — useful for
 * pasting a "best of N scenarios" comparison into a spreadsheet.
 */
export function statsToCsvRow(stats: SimStats, fleet: number): string {
  return toCsv(
    [
      'Fleet',
      'Throughput (jobs/hr)',
      'Offered (jobs/hr)',
      'Utilization (%)',
      'Blocked (%)',
      'p50 flow time (s)',
      'p95 flow time (s)',
      'Backlog',
      'Reverse pickup share (%)',
      'Reverse pickups',
      'Pickups observed',
      'Meets demand',
    ],
    [
      [
        fleet,
        csvRound(stats.tph, 2),
        csvRound(stats.offeredRate, 2),
        csvRound(stats.busy * 100, 1),
        csvRound(stats.blocked * 100, 1),
        csvRound(stats.p50, 1),
        csvRound(stats.p95, 1),
        csvRound(stats.backlog, 1),
        csvRound(stats.reversePickupShare * 100, 1),
        stats.reversePickups,
        stats.pickupsObserved,
        stats.met ? 'Yes' : 'No',
      ],
    ],
  )
}
