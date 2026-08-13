/**
 * Drives a mutable `Sim` instance in real time via requestAnimationFrame.
 * Framework-only glue: all the actual stepping logic lives in `lib/engine/sim.ts`.
 *
 * The sim is (re)built explicitly via `restart()`, not on every params edit —
 * editing the scenario form doesn't yank the live view out from under a
 * running watch; the user applies changes with an explicit restart.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DT, Sim, type StateTime } from '../lib/engine/sim.ts'
import { fleetFeasibility } from '../lib/engine/feasibility.ts'
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

/**
 * Tiles for "there is no sim" — an infeasible fleet. `liveTph` is NaN rather
 * than 0 on purpose: `format.ts` renders a non-finite as an em-dash, so an
 * unknown throughput never reads as a measured zero. (A live `Sim` returns
 * NaN here too for its first 60 s, for the same reason.)
 */
const EMPTY_TILES: LiveTiles = {
  simTime: 0,
  liveTph: NaN,
  share: { loaded: 0, empty: 0, handling: 0, blocked: 0, charging: 0, idle: 0 },
  fleet: 0,
  avgSoc: 0,
  backlog: 0,
  stranded: 0,
  completed: 0,
}

/** Builds a Sim, or null when the scenario's fleet cannot fit its loop (the engine refuses those). */
function buildSim(params: ScenarioParams): Sim | null {
  if (!fleetFeasibility(params).feasible) return null
  return new Sim(toSimParams(params), params.seed)
}

function computeTiles(sim: Sim | null): LiveTiles {
  if (!sim) return EMPTY_TILES
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
  // useRef() evaluates its argument on EVERY render but keeps only the first
  // value, so `useRef(buildSim(params))` would construct a whole Sim —
  // stations, vehicles, two PRNG streams — and throw it away on every render.
  // The rAF loop below bumps `frame` each tick, so that is ~60 discarded
  // fleets per second for as long as the live view runs. Seed it lazily.
  const simRef = useRef<Sim | null>(null)
  const seeded = useRef(false)
  if (!seeded.current) {
    seeded.current = true
    simRef.current = buildSim(params)
  }
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [frame, setFrame] = useState(0)
  const [tiles, setTiles] = useState<LiveTiles>(() => computeTiles(simRef.current))
  const paramsRef = useRef(params)
  paramsRef.current = params
  // Same reason, cheaper case: this walks down from loopLen/minGap on every
  // render otherwise, and it only ever changes when params do.
  const feasible = useMemo(() => fleetFeasibility(params).feasible, [params])

  const restart = useCallback((next: ScenarioParams = paramsRef.current) => {
    simRef.current = buildSim(next)
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

  // Crossing the feasibility boundary auto-restarts so the live view tracks
  // geometry changes in either direction without making the user click
  // Restart themselves. Without this, fixing an over-tight loop leaves the
  // previous (null) sim in place until manual restart; breaking a previously
  // feasible loop leaves the canvas showing the last good frame while the
  // rAF loop silently bails — both are inconsistent with the
  // feasibility-notice UX in the rest of the form.
  useEffect(() => {
    restart(paramsRef.current)
    setRunning(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feasible])

  useEffect(() => {
    if (!running) return
    let raf: number
    let last = performance.now()
    const loop = (now: number) => {
      const sim = simRef.current
      if (!sim) return
      const dtReal = Math.min(0.25, Math.max(0, (now - last) / 1000))
      last = now
      const steps = Math.round((dtReal * BASE_RATE * speed) / DT)
      for (let i = 0; i < steps; i++) sim.step()
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
