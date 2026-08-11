import { useEffect, useRef } from 'react'
import { useLiveSim } from '../../hooks/useLiveSim.ts'
import { draw } from '../../lib/engine/render.ts'
import { fmtNum, fmtPercent, unit } from '../../lib/format.ts'
import { BUCKETS } from '../../lib/engine/sim.ts'
import { toSimParams } from '../../lib/simParams.ts'
import { FeasibilityNotice } from '../ui/FeasibilityNotice.tsx'
import type { Scenario } from '../../types/domain.ts'

const fmtTph = unit('/hr', 1)
const SPEEDS = [1, 2, 5, 20]

interface SimViewProps {
  scenario: Scenario
}

export function SimView({ scenario }: SimViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { sim, frame, tiles, running, speed, setSpeed, play, pause, restart } = useLiveSim(
    scenario.id,
    scenario.params,
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !sim) return
    draw(canvas, sim, sim.lastBlockedIds)
  }, [sim, frame])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !sim) return
    const ro = new ResizeObserver(() => draw(canvas, sim, sim.lastBlockedIds))
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [sim])

  // Nothing to watch: the fleet cannot be placed on the loop at all.
  if (!sim) {
    return (
      <section className="card simview">
        <div className="card-title">Live track view</div>
        <FeasibilityNotice params={scenario.params} />
        <p className="empty-hint">No run to show until the fleet fits the guide path.</p>
      </section>
    )
  }

  const paramsDirty = JSON.stringify(sim.P) !== JSON.stringify(toSimParams(scenario.params))

  return (
    <section className="card simview">
      <div className="card-title-row">
        <div className="card-title">Live track view</div>
        <div className="simview__controls">
          {running ? (
            <button type="button" className="btn btn-sm" onClick={pause}>
              Pause
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-primary" onClick={play}>
              Play
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => restart(scenario.params)}>
            Restart
          </button>
          <div className="simview__speeds" role="group" aria-label="Simulation speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                className={`btn btn-sm${speed === s ? ' btn-active' : ''}`}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
      {paramsDirty && (
        <p className="simview__stale">
          Scenario edited since this run started — click Restart to apply the new params.
        </p>
      )}
      <canvas ref={canvasRef} className="simview__canvas" aria-label="Live AGV loop simulation" />
      <div className="simview__tiles">
        <div className="metric-tile">
          <span className="metric-tile__label">Sim time</span>
          <span className="metric-tile__value">{(tiles.simTime / 3600).toFixed(2)} h</span>
        </div>
        <div className="metric-tile">
          <span className="metric-tile__label">Live throughput</span>
          <span className="metric-tile__value">{fmtTph(tiles.liveTph)}</span>
        </div>
        <div className="metric-tile">
          <span className="metric-tile__label">Completed</span>
          <span className="metric-tile__value">{fmtNum(tiles.completed)}</span>
        </div>
        <div className="metric-tile">
          <span className="metric-tile__label">Backlog</span>
          <span className="metric-tile__value">{fmtNum(tiles.backlog)}</span>
        </div>
        <div className="metric-tile">
          <span className="metric-tile__label">Avg SOC</span>
          <span className="metric-tile__value">{fmtPercent(tiles.avgSoc)}</span>
        </div>
        <div className="metric-tile">
          <span className="metric-tile__label">Stranded</span>
          <span className="metric-tile__value">{fmtNum(tiles.stranded)}</span>
        </div>
      </div>
      <div className="simview__bucketbar" aria-hidden="true">
        {BUCKETS.map((b) => (
          <div
            key={b.key}
            className="simview__bucketbar-seg"
            style={{ width: `${(tiles.share[b.key] * 100).toFixed(2)}%`, background: b.color ?? 'transparent' }}
            title={`${b.name}: ${fmtPercent(tiles.share[b.key] * 100)}`}
          />
        ))}
      </div>
      <div className="simview__legend">
        {BUCKETS.map((b) => (
          <span key={b.key} className="simview__legend-item">
            <span className="simview__legend-swatch" style={{ background: b.color ?? 'transparent' }} />
            {b.name}
          </span>
        ))}
      </div>
    </section>
  )
}
