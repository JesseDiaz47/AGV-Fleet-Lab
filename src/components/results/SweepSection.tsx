import { SweepChart } from './SweepChart.tsx'
import { SweepTable } from './SweepTable.tsx'
import { Verdict } from './Verdict.tsx'
import type { SweepStatus } from '../../hooks/useSweep.ts'
import type { SweepPoint } from '../../lib/engine/sweep.ts'
import { sweepToCsv } from '../../lib/csvExport.ts'
import { downloadCsv, timestampSlug } from '../../lib/download.ts'
import { fmtPercent } from '../../lib/format.ts'
import type { ScenarioParams } from '../../types/domain.ts'

interface SweepSectionProps {
  params: ScenarioParams
  scenarioName: string
  analyticNReq: number
  status: SweepStatus
  results: SweepPoint[]
  progress: number
  onRun: () => void
}

/** Composes the sweep chart/table/verdict views around a sweep run owned by the caller (App), so its results can also feed the combined PDF export. */
export function SweepSection({ params, scenarioName, analyticNReq, status, results, progress, onRun }: SweepSectionProps) {
  function exportCsv() {
    downloadCsv(`agv-fleet-lab-sweep-${scenarioName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${timestampSlug()}.csv`, sweepToCsv(results))
  }

  return (
    <>
      <section className="card">
        <div className="card-title-row">
          <div className="card-title">Fleet-size sweep</div>
          <div className="card-title-row__actions">
            {results.length > 0 && (
              <button type="button" className="btn btn-sm" onClick={exportCsv}>
                Export CSV
              </button>
            )}
            <button type="button" className="btn btn-sm btn-primary" onClick={onRun} disabled={status === 'running'}>
              {status === 'running' ? `Running… ${fmtPercent(progress * 100, 0)}` : 'Run sweep'}
            </button>
          </div>
        </div>
        <p className="card-hint">
          Simulates every fleet size from 1 up through headroom above the analytic estimate, 2 reps each.
        </p>
        {status === 'idle' && <p className="empty-hint">Not run yet for this scenario.</p>}
        {results.length > 0 && <SweepChart results={results} demand={params.demand} />}
        {results.length > 0 && <SweepTable results={results} />}
      </section>
      <Verdict analyticNReq={analyticNReq} chosenFleet={params.fleet} results={results} />
    </>
  )
}
