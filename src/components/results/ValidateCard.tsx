import { useEffect } from 'react'
import { useValidate } from '../../hooks/useValidate.ts'
import { BUCKETS } from '../../lib/engine/sim.ts'
import { fmtNum, fmtPercent, unit } from '../../lib/format.ts'
import type { ScenarioParams } from '../../types/domain.ts'

const fmtTph = unit('/hr', 2)
const fmtSec = unit('s', 0)

interface ValidateCardProps {
  params: ScenarioParams
  scenarioId: string
}

/** Runs the seeded discrete-event simulation at the scenario's chosen fleet size and reports whether it holds up. */
export function ValidateCard({ params, scenarioId }: ValidateCardProps) {
  const { status, result, run, reset } = useValidate()

  // A different scenario invalidates the last run's result.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => reset(), [scenarioId])

  return (
    <section className="card">
      <div className="card-title-row">
        <div className="card-title">Simulation validation</div>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => run(params)} disabled={status === 'running'}>
          {status === 'running' ? 'Running…' : 'Run validation'}
        </button>
      </div>
      <p className="card-hint">
        Runs {params.fleet} vehicles for an 8h batch (2 seeded reps, {params.seed}/{params.seed + 1}) and
        checks whether throughput and backlog hold at that fleet size.
      </p>
      {status === 'idle' && <p className="empty-hint">Not run yet for this scenario.</p>}
      {status === 'running' && <p className="empty-hint">Simulating…</p>}
      {status === 'done' && result && (
        <>
          <div className={`verdict-pill ${result.met ? 'verdict-pill--good' : 'verdict-pill--warn'}`}>
            {result.met ? 'Holds at this fleet size' : 'Falls short at this fleet size'}
          </div>
          <dl className="stat-list">
            <div className="stat-list__row">
              <dt>Simulated throughput</dt>
              <dd>
                {fmtTph(result.tph)} (offered {fmtTph(result.offeredRate)})
              </dd>
            </div>
            <div className="stat-list__row">
              <dt>Fleet utilization</dt>
              <dd>{fmtPercent(result.busy * 100)}</dd>
            </div>
            <div className="stat-list__row">
              <dt>Blocked (congestion)</dt>
              <dd>{fmtPercent(result.blocked * 100)}</dd>
            </div>
            <div className="stat-list__row">
              <dt>Flow time p50 / p95</dt>
              <dd>
                {fmtSec(result.p50)} / {fmtSec(result.p95)}
              </dd>
            </div>
            <div className="stat-list__row">
              <dt>End-of-run backlog</dt>
              <dd>{fmtNum(result.backlog)}</dd>
            </div>
            <div className="stat-list__row">
              <dt>Stranded (dead battery)</dt>
              <dd>{fmtNum(result.stranded)}</dd>
            </div>
            <div className="stat-list__row">
              <dt>Avg state of charge</dt>
              <dd>{fmtPercent(result.avgSoc)}</dd>
            </div>
          </dl>
          <div className="simview__bucketbar" aria-hidden="true">
            {BUCKETS.map((b) => (
              <div
                key={b.key}
                className="simview__bucketbar-seg"
                style={{ width: `${(result.share[b.key] * 100).toFixed(2)}%`, background: b.color ?? 'transparent' }}
                title={`${b.name}: ${fmtPercent(result.share[b.key] * 100)}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
