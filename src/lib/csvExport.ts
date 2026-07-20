/** CSV export for the fleet-size sweep table. */
import { toCsv, csvRound } from './csv.ts'
import type { SweepPoint } from './engine/sweep.ts'

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
