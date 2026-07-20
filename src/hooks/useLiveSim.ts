/**
 * Drives a mutable `Sim` instance in real time via requestAnimationFrame.
 * Framework-only glue: all the actual stepping logic lives in `lib/engine/sim.ts`.
 *
 * The sim is (re)built explicitly via `restart()`, not on every params edit —
 * editing the scenario form doesn't yank the live view out from under a
 * running watch; the user applies changes with an explicit restart.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { DT, Sim, type StateTime } from '../lib/engine/sim.ts'
import { toSimParams } from '../lib/simParams.ts'
import type { ScenarioParams } from '../types/domain.ts'

export interface LiveTiles {
  simTime: number
  liveTph: number
  share: StateTime
  fleet: number
  avgSoc: number
  backlog: number
  stranded: number
  completed: number
}

function computeTiles(sim: Sim): LiveTiles {
  const total = (Object.values(sim.liveState) as number[]).reduce((a, b) => a + b, 0) || 1e-9
  const share = {} as StateTime
  for (const k of Object.keys(sim.liveState) as (keyof StateTime)[]) share[k] = sim.liveState[k] / total
  return {
    simTime: sim.t,
    liveTph: sim.liveTph(),
    share,
    fleet: sim.vehicles.length,
    avgSoc: sim.vehicles.reduce((a, v) => a + v.soc, 0) / sim.vehicles.length,
    backlog: sim.pending.length,
    stranded: sim.strandedCount,
    completed: sim.completed,
  }
}

/** Sim-seconds simulated per real second, at speed multiplier 1x. */
const BASE_RATE = 20

export function useLiveSim(scenarioId: string, params: ScenarioParams) {
  const simRef = useRef<Sim>(new Sim(toSimParams(params), params.seed))
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [frame, setFrame] = useState(0)
  const [tiles, setTiles] = useState<LiveTiles>(() => computeTiles(simRef.current))
  const paramsRef = useRef(params)
  paramsRef.current = params

  const restart = useCallback((next: ScenarioParams = paramsRef.current) => {
    simRef.current = new Sim(toSimParams(next), next.seed)
    setTiles(computeTiles(simRef.current))
    setFrame((f) => f + 1)
  }, [])

  // Switching to a different scenario replaces the live view; editing the
  // current scenario's fields does not, until the user restarts explicitly.
  useEffect(() => {
    restart(paramsRef.current)
    setRunning(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId])

  useEffect(() => {
    if (!running) return
    let raf: number
    let last = performance.now()
    const loop = (now: number) => {
      const dtReal = Math.min(0.25, Math.max(0, (now - last) / 1000))
      last = now
      const steps = Math.round((dtReal * BASE_RATE * speed) / DT)
      for (let i = 0; i < steps; i++) simRef.current.step()
      setTiles(computeTiles(simRef.current))
      setFrame((f) => f + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running, speed])

  const play = useCallback(() => setRunning(true), [])
  const pause = useCallback(() => setRunning(false), [])

  return { sim: simRef.current, frame, tiles, running, speed, setSpeed, play, pause, restart }
}
