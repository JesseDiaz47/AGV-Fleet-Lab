/**
 * Runs the fleet-size sweep progressively — one size at a time, yielded via
 * setTimeout — so the UI can show a running chart/table instead of a single
 * multi-second blocking call.
 */
import { useCallback, useRef, useState } from 'react'
import { analyze } from '../lib/engine/analytic.ts'
import { REPS, SIM_HOURS, avgStats, batchRun, repSeed, type SimStats } from '../lib/engine/sim.ts'
import { sweepSizes, type SweepPoint } from '../lib/engine/sweep.ts'
import { toAnalyticParams, toSimParams } from '../lib/simParams.ts'
import type { ScenarioParams } from '../types/domain.ts'

export type SweepStatus = 'idle' | 'running' | 'done'

function toPoint(n: number, avg: SimStats): SweepPoint {
  return { n, tph: avg.tph, offered: avg.offeredRate, blocked: avg.blocked, busy: avg.busy, p95: avg.p95, met: avg.met }
}

export function useSweep() {
  const [status, setStatus] = useState<SweepStatus>('idle')
  const [results, setResults] = useState<SweepPoint[]>([])
  const [progress, setProgress] = useState(0)
  const tokenRef = useRef(0)

  const run = useCallback((params: ScenarioParams) => {
    const token = ++tokenRef.current
    // `params` carries loopLen/minGap, so infeasible fleet sizes are dropped
    // here rather than simulated — the engine would refuse them anyway.
    const sizes = sweepSizes(analyze(toAnalyticParams(params)), params)
    setStatus('running')
    setResults([])
    setProgress(0)
    const simParams = toSimParams(params)
    const points: SweepPoint[] = []
    if (sizes.length === 0) {
      setStatus('done')
      return
    }
    let i = 0
    const step = () => {
      if (token !== tokenRef.current) return
      const n = sizes[i]
      const reps: SimStats[] = []
      for (let r = 0; r < REPS; r++) reps.push(batchRun({ ...simParams, fleet: n }, repSeed(params.seed, r), SIM_HOURS))
      points.push(toPoint(n, avgStats(reps)))
      i++
      setResults(points.slice())
      setProgress(i / sizes.length)
      if (i < sizes.length) {
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
    setProgress(0)
  }, [])

  return { status, results, progress, run, reset }
}
