import { useMemo } from 'react'
import { pickKnee, type SweepPoint } from '../../lib/engine/sweep.ts'
import { fmtPercent, unit } from '../../lib/format.ts'

const fmtTph = unit('/hr', 1)
const fmtSec = unit('s', 0)

interface SweepTableProps {
  results: SweepPoint[]
}

export function SweepTable({ results }: SweepTableProps) {
  const knee = useMemo(() => pickKnee(results), [results])

  if (results.length === 0) return null

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Fleet</th>
            <th>Throughput</th>
            <th>Utilization</th>
            <th>Blocked</th>
            <th>p95 flow time</th>
            <th>Meets demand</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.n} className={r.n === knee ? 'data-table__row--highlight' : ''}>
              <td>{r.n}</td>
              <td>{fmtTph(r.tph)}</td>
              <td>{fmtPercent(r.busy * 100)}</td>
              <td>{fmtPercent(r.blocked * 100)}</td>
              <td>{fmtSec(r.p95)}</td>
              <td>{r.met ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
