/**
 * Runs the batched discrete-event simulation (REPS independent reps at
 * SIM_HOURS each) against the analytic estimate, yielding between reps via
 * setTimeout so a click doesn't freeze the UI thread.
 */
import { useCallback, useRef, useState } from 'react'
import { REPS, SIM_HOURS, avgStats, batchRun, type SimStats } from '../lib/engine/sim.ts'
import { toSimParams } from '../lib/simParams.ts'
import type { ScenarioParams } from '../types/domain.ts'

export type ValidateStatus = 'idle' | 'running' | 'done'

export function useValidate() {
  const [status, setStatus] = useState<ValidateStatus>('idle')
  const [result, setResult] = useState<SimStats | null>(null)
  const tokenRef = useRef(0)

  const run = useCallback((params: ScenarioParams) => {
    const token = ++tokenRef.current
    setStatus('running')
    setResult(null)
    const simParams = toSimParams(params)
    const reps: SimStats[] = []
    let rep = 0
    const step = () => {
      if (token !== tokenRef.current) return // superseded by a newer run/reset
      reps.push(batchRun(simParams, params.seed + rep, SIM_HOURS))
      rep++
      if (rep < REPS) {
        setTimeout(step, 0)
        return
      }
      setResult(avgStats(reps))
      setStatus('done')
    }
    setTimeout(step, 0)
  }, [])

  const reset = useCallback(() => {
    tokenRef.current++
    setStatus('idle')
    setResult(null)
  }, [])

  return { status, result, run, reset }
}
