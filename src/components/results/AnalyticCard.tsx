import { useMemo } from 'react'
import { analyze } from '../../lib/engine/analytic.ts'
import { toAnalyticParams } from '../../lib/simParams.ts'
import { fmtNum, fmtPercent, unit } from '../../lib/format.ts'
import type { ScenarioParams } from '../../types/domain.ts'

const fmtSec = unit('s', 1)
const fmtTph = unit('/hr', 2)

interface AnalyticCardProps {
  params: ScenarioParams
}

/** Analytic first-pass fleet-sizing estimate (Egbelu-style), recomputed live from the current scenario. */
export function AnalyticCard({ params }: AnalyticCardProps) {
  const a = useMemo(() => analyze(toAnalyticParams(params)), [params])

  return (
    <section className="card">
      <div className="card-title">Analytic estimate</div>
      <div className="analytic-hero">
        <span className="analytic-hero__n">{a.nReq}</span>
        <span className="analytic-hero__label">vehicles required</span>
      </div>
      <dl className="stat-list">
        <div className="stat-list__row">
          <dt>Loaded / empty travel</dt>
          <dd>
            {fmtSec(a.dLoaded / params.speed)} / {fmtSec(a.dEmpty / params.speed)}
          </dd>
        </div>
        <div className="stat-list__row">
          <dt>Cycle time</dt>
          <dd>{fmtSec(a.cycle)}</dd>
        </div>
        <div className="stat-list__row">
          <dt>Capacity per vehicle</dt>
          <dd>{fmtTph(a.perVehicle)}</dd>
        </div>
        <div className="stat-list__row">
          <dt>Charge overhead</dt>
          <dd>{fmtPercent(a.chargeOverhead * 100)}</dd>
        </div>
        <div className="stat-list__row">
          <dt>Derate factor</dt>
          <dd>{fmtNum(a.derate, 4)}</dd>
        </div>
        <div className="stat-list__row">
          <dt>Raw fleet (undirated)</dt>
          <dd>{fmtNum(a.nRaw, 2)}</dd>
        </div>
      </dl>
      <p className="card-hint">
        This is a first pass, not a substitute for the simulation below — it assumes uniform demand and
        no congestion.
      </p>
    </section>
  )
}
