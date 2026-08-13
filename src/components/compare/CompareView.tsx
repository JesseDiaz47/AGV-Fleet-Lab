import { useEffect, useMemo } from 'react'
import { useCompare, type CompareResult } from '../../hooks/useCompare.ts'
import { DASH, fmtNum, fmtPercent, unit } from '../../lib/format.ts'
import { fleetFeasibility } from '../../lib/engine/feasibility.ts'
import type { SimStats } from '../../lib/engine/sim.ts'
import type { Scenario } from '../../types/domain.ts'

const fmtTph = unit('/hr', 1)
const fmtSec = unit('s', 0)

/**
 * One simulated cell. The two empty cases are different and must not look the
 * same: no result yet is a dash, while `simulated === null` means the fleet
 * cannot fit its loop, so there is no run to report and never will be until
 * the geometry changes.
 */
function simCell(r: CompareResult | undefined, render: (s: SimStats) => string): string {
  if (!r) return DASH
  if (!r.simulated) return 'Not simulated'
  return render(r.simulated)
}

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
    { label: 'Fleet fits the loop', render: (sc) => (fleetFeasibility(sc.params).feasible ? 'Yes' : 'No') },
    { label: 'Analytic N required', render: (_sc, r) => (r ? fmtNum(r.analytic.nReq) : DASH) },
    { label: 'Simulated throughput', render: (_sc, r) => simCell(r, (s) => fmtTph(s.tph)) },
    { label: 'Utilization', render: (_sc, r) => simCell(r, (s) => fmtPercent(s.busy * 100)) },
    { label: 'Blocked', render: (_sc, r) => simCell(r, (s) => fmtPercent(s.blocked * 100)) },
    { label: 'p95 flow time', render: (_sc, r) => simCell(r, (s) => fmtSec(s.p95)) },
    { label: 'Meets demand', render: (_sc, r) => simCell(r, (s) => (s.met ? 'Yes' : 'No')) },
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
      <div className="table-scroll compare-desktop-table">
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
      <div className="compare-mobile-cards" role="list" aria-label="Scenario comparison summaries">
        {selected.map((sc) => {
          const result = resultFor(sc.id)
          return (
            <section className="compare-mobile-card" role="listitem" aria-label={sc.name} key={sc.id}>
              <h3>{sc.name}</h3>
              <dl>
                {rows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.render(sc, result)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )
        })}
      </div>
    </section>
  )
}
