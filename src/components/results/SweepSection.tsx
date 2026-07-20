import { useEffect } from 'react'
import { useSweep } from '../../hooks/useSweep.ts'
import { SweepChart } from './SweepChart.tsx'
import { SweepTable } from './SweepTable.tsx'
import { Verdict } from './Verdict.tsx'
import { fmtPercent } from '../../lib/format.ts'
import type { ScenarioParams } from '../../types/domain.ts'

interface SweepSectionProps {
  params: ScenarioParams
  scenarioId: string
  analyticNReq: number
}

/** Owns the fleet-size sweep run and composes its chart/table/verdict views. */
export function SweepSection({ params, scenarioId, analyticNReq }: SweepSectionProps) {
  const { status, results, progress, run, reset } = useSweep()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => reset(), [scenarioId])

  return (
    <>
      <section className="card">
        <div className="card-title-row">
          <div className="card-title">Fleet-size sweep</div>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => run(params)} disabled={status === 'running'}>
            {status === 'running' ? `Running… ${fmtPercent(progress * 100, 0)}` : 'Run sweep'}
          </button>
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
