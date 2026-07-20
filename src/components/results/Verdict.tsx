import { useMemo } from 'react'
import { findRollover, pickKnee, type SweepPoint } from '../../lib/engine/sweep.ts'

interface VerdictProps {
  analyticNReq: number
  chosenFleet: number
  results: SweepPoint[]
}

/** Plain-English synthesis of the analytic estimate against the simulated sweep. Not a substitute for a full DES study. */
export function Verdict({ analyticNReq, chosenFleet, results }: VerdictProps) {
  const knee = useMemo(() => pickKnee(results), [results])
  const rollover = useMemo(() => findRollover(results), [results])

  if (results.length === 0) {
    return (
      <section className="card">
        <div className="card-title">Verdict</div>
        <p className="empty-hint">Run the fleet-size sweep to get a plain-English read on the scenario.</p>
      </section>
    )
  }

  const chosenPoint = results.find((r) => r.n === chosenFleet)
  const lines: string[] = []

  if (knee !== null) {
    if (knee === analyticNReq) {
      lines.push(`The simulation confirms the analytic estimate: ${knee} vehicles is the smallest fleet that meets demand.`)
    } else if (knee > analyticNReq) {
      lines.push(
        `The analytic pass estimated ${analyticNReq} vehicles, but congestion pushes the simulated requirement up to ${knee} — the single-loop layout is the likely bottleneck, not raw capacity.`,
      )
    } else {
      lines.push(
        `The simulation meets demand with fewer vehicles (${knee}) than the analytic pass estimated (${analyticNReq}) — the analytic derate factors are conservative for this scenario.`,
      )
    }
  } else {
    lines.push(`No fleet size in the sweep range met demand — even the largest simulated fleet falls short.`)
  }

  if (chosenPoint) {
    if (chosenPoint.met) {
      lines.push(`The scenario's chosen fleet size (${chosenFleet}) holds up in simulation.`)
    } else {
      lines.push(`The scenario's chosen fleet size (${chosenFleet}) does NOT meet demand in simulation — consider raising it${knee !== null ? ` to at least ${knee}` : ''}.`)
    }
  }

  if (rollover !== null) {
    lines.push(`Throughput drops past ${rollover} vehicles — over-fleeting this loop creates its own congestion, so more vehicles isn't always better.`)
  }

  return (
    <section className="card">
      <div className="card-title">Verdict</div>
      {lines.map((line, i) => (
        <p key={i} className="verdict-line">
          {line}
        </p>
      ))}
      <p className="card-hint">
        Educational/early-planning read only — not a substitute for a full DES study or vendor sign-off.
      </p>
    </section>
  )
}
