import { useEffect, useMemo } from 'react'
import { useCompare, type CompareResult } from '../../hooks/useCompare.ts'
import { fmtNum, fmtPercent, unit } from '../../lib/format.ts'
import type { Scenario } from '../../types/domain.ts'

const fmtTph = unit('/hr', 1)
const fmtSec = unit('s', 0)

interface CompareViewProps {
  scenarios: Scenario[]
  compareIds: string[]
}

/** Side-by-side analytic + simulated KPIs for 2-4 selected scenarios. */
export function CompareView({ scenarios, compareIds }: CompareViewProps) {
  const { status, results, run, reset } = useCompare()
  const selected = useMemo(
    () => compareIds.map((id) => scenarios.find((s) => s.id === id)).filter((s): s is Scenario => s !== undefined),
    [scenarios, compareIds],
  )

  // A changed selection invalidates the last comparison run.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => reset(), [compareIds.join(',')])

  if (selected.length < 2) {
    return (
      <section className="card">
        <div className="card-title">Compare scenarios</div>
        <p className="empty-hint">Check at least 2 scenarios above (up to 4) to compare them side by side.</p>
      </section>
    )
  }

  const resultFor = (id: string): CompareResult | undefined => results.find((r) => r.scenarioId === id)

  const rows: { label: string; render: (sc: Scenario, r: CompareResult | undefined) => string }[] = [
    { label: 'Fleet size', render: (sc) => fmtNum(sc.params.fleet) },
    { label: 'Demand', render: (sc) => fmtTph(sc.params.demand) },
    { label: 'Analytic N required', render: (_sc, r) => (r ? fmtNum(r.analytic.nReq) : '—') },
    { label: 'Simulated throughput', render: (_sc, r) => (r ? fmtTph(r.simulated.tph) : '—') },
    { label: 'Utilization', render: (_sc, r) => (r ? fmtPercent(r.simulated.busy * 100) : '—') },
    { label: 'Blocked', render: (_sc, r) => (r ? fmtPercent(r.simulated.blocked * 100) : '—') },
    { label: 'p95 flow time', render: (_sc, r) => (r ? fmtSec(r.simulated.p95) : '—') },
    { label: 'Meets demand', render: (_sc, r) => (r ? (r.simulated.met ? 'Yes' : 'No') : '—') },
  ]

  return (
    <section className="card">
      <div className="card-title-row">
        <div className="card-title">Compare scenarios</div>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => run(selected)} disabled={status === 'running'}>
          {status === 'running' ? `Running… (${results.length}/${selected.length})` : 'Run comparison'}
        </button>
      </div>
      {status === 'idle' && <p className="empty-hint">Not run yet for this selection.</p>}
      <div className="table-scroll">
        <table className="data-table data-table--compare">
          <thead>
            <tr>
              <th>Metric</th>
              {selected.map((sc) => (
                <th key={sc.id}>{sc.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                {selected.map((sc) => (
                  <td key={sc.id}>{row.render(sc, resultFor(sc.id))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
