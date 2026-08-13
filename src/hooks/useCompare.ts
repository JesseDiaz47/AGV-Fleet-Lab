/**
 * Runs the analytic estimate + a batched simulation (at each scenario's own
 * fleet size) for a set of 2-4 scenarios, one at a time yielded via
 * setTimeout, for the side-by-side compare view.
 */
import { useCallback, useRef, useState } from 'react'
import { analyze, type AnalyticResult } from '../lib/engine/analytic.ts'
import { REPS, SIM_HOURS, avgStats, batchRun, type SimStats } from '../lib/engine/sim.ts'
import { fleetFeasibility } from '../lib/engine/feasibility.ts'
import { toAnalyticParams, toSimParams } from '../lib/simParams.ts'
import type { Scenario } from '../types/domain.ts'

export type CompareStatus = 'idle' | 'running' | 'done'

export interface CompareResult {
  scenarioId: string
  analytic: AnalyticResult
  /** `null` when the scenario's fleet cannot physically fit its loop — see engine/feasibility.ts. */
  simulated: SimStats | null
}

export function useCompare() {
  const [status, setStatus] = useState<CompareStatus>('idle')
  const [results, setResults] = useState<CompareResult[]>([])
  const tokenRef = useRef(0)

  const run = useCallback((scenarios: Scenario[]) => {
    const token = ++tokenRef.current
    setStatus('running')
    setResults([])
    const out: CompareResult[] = []
    let i = 0
    const step = () => {
      if (token !== tokenRef.current) return
      const sc = scenarios[i]
      const analytic = analyze(toAnalyticParams(sc.params))
      // The analytic pass is pure arithmetic and stays meaningful, but a fleet
      // that cannot fit its loop has no simulation to report — comparing it
      // against scenarios that ran would put an impossible layout in the same
      // table as measured ones.
      if (!fleetFeasibility(sc.params).feasible) {
        out.push({ scenarioId: sc.id, analytic, simulated: null })
      } else {
        const simParams = toSimParams(sc.params)
        const reps: SimStats[] = []
        for (let r = 0; r < REPS; r++) reps.push(batchRun(simParams, sc.params.seed + r, SIM_HOURS))
        out.push({ scenarioId: sc.id, analytic, simulated: avgStats(reps) })
      }
      i++
      setResults(out.slice())
      if (i < scenarios.length) {
        setTimeout(step, 0)
        return
      }
      setStatus('done')
    }
    setTimeout(step, 0)
  }, [])

  const reset = useCallback(() => {
    tokenRef.current++
    setStatus('idle')
    setResults([])
  }, [])

  return { status, results, run, reset }
}
