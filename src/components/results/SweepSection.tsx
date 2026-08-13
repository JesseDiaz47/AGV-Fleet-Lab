import { SweepChart } from './SweepChart.tsx'
import { SweepTable } from './SweepTable.tsx'
import { Verdict } from './Verdict.tsx'
import type { SweepStatus } from '../../hooks/useSweep.ts'
import type { SweepPoint } from '../../lib/engine/sweep.ts'
import { sweepToCsv } from '../../lib/csvExport.ts'
import { downloadCsv, timestampSlug } from '../../lib/download.ts'
import { fmtPercent } from '../../lib/format.ts'
import { fleetFeasibility } from '../../lib/engine/feasibility.ts'
import { FeasibilityNotice } from '../ui/FeasibilityNotice.tsx'
import { PARAM_LIMITS, type ScenarioParams } from '../../types/domain.ts'

const [, FLEET_MAX] = PARAM_LIMITS.fleet

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
  const fit = fleetFeasibility(params)

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
        <FeasibilityNotice params={params} />
        <p className="card-hint">
          Simulates every fleet size from 1 up through headroom above the analytic estimate, 2 reps each.
          {fit.maxFleet < FLEET_MAX && (
            <>
              {' '}
              At a {params.minGap} m gap this {params.loopLen} m loop holds at most {fit.maxFleet}{' '}
              {fit.maxFleet === 1 ? 'vehicle' : 'vehicles'}, so larger fleets are never simulated.
            </>
          )}
        </p>
        {status === 'idle' && <p className="empty-hint">Not run yet for this scenario.</p>}
        {status === 'done' && results.length === 0 && (
          <p className="empty-hint">No fleet size fits this guide path, so there was nothing to sweep.</p>
        )}
        {results.length > 0 && <SweepChart results={results} demand={params.demand} />}
        {results.length > 0 && <SweepTable results={results} />}
      </section>
      <Verdict analyticNReq={analyticNReq} chosenFleet={params.fleet} results={results} />
    </>
  )
}
