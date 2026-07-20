import { useMemo } from 'react'
import { buildVerdictLines } from '../../lib/verdict.ts'
import type { SweepPoint } from '../../lib/engine/sweep.ts'

interface VerdictProps {
  analyticNReq: number
  chosenFleet: number
  results: SweepPoint[]
}

export function Verdict({ analyticNReq, chosenFleet, results }: VerdictProps) {
  const lines = useMemo(() => buildVerdictLines(analyticNReq, chosenFleet, results), [analyticNReq, chosenFleet, results])

  if (results.length === 0) {
    return (
      <section className="card">
        <div className="card-title">Verdict</div>
        <p className="empty-hint">Run the fleet-size sweep to get a plain-English read on the scenario.</p>
      </section>
    )
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
