/**
 * Discrete-event simulation of a fleet of AGVs on a single one-way loop.
 * Fixed-step engine (Δt = 0.1 s), Poisson job arrivals, symmetric triangular
 * load/unload times, seeded PRNG — identical seed reproduces the run exactly.
 *
 * Ported 1:1 from post-apps/agv-fleet-lab/src/sim.js (v1 single-file tool).
 * Behavior must not change without a matching regression-test update — see
 * sim.selftest.test.ts.
 */
import { mulberry32, triSample, percentile } from '../prng.ts'
import { sampleOrigin, sampleDestination, nextArrivalTime, type ShiftBlock } from './demand.ts'
import { DISPATCH_STRATEGIES, type DispatchContext, type DispatchRuleKey } from './dispatch.ts'

export const ST = {
  TO_PICKUP: 'toPickup',
  LOADING: 'loading',
  TO_DROP: 'toDrop',
  UNLOADING: 'unloading',
  TO_CHARGE: 'toCharge',
  CHARGING: 'charging',
  IDLE: 'idle',
  STRANDED: 'stranded',
} as const
export type VehicleState = (typeof ST)[keyof typeof ST]

export const MOVING = new Set<VehicleState>([ST.TO_PICKUP, ST.TO_DROP, ST.TO_CHARGE, ST.IDLE])
export const WORKING = new Set<VehicleState>([ST.TO_PICKUP, ST.LOADING, ST.TO_DROP, ST.UNLOADING])

// Idle vehicles circulate at line speed: on a no-passing loop a slower idler
// becomes a moving roadblock that drags every working vehicle to its pace.
export const IDLE_SPEED = 1.0
export const DWELL_DRAIN = 0.3 // battery drain while stopped, as a fraction of moving drain
export const OPP_CHARGE_SOC = 60 // idle vehicles top up below this when a bay is free and no work waits
export const DT = 0.1 // s
export const WARMUP = 900 // s excluded from batch statistics

export interface SimParams {
  demand: number // jobs/hr
  loopLen: number // m
  stations: number
  speed: number // m/s
  minGap: number // m
  loadS: number // s
  unloadS: number // s
  spreadPct: number // 0-100
  battery: boolean
  runtimeH: number // h
  chargeH: number // h
  thresholdPct: number // 0-100
  targetPct: number // 0-100
  chargeBays: number
  parkIdle: boolean
  fleet: number
  /** Per-station demand weights. `null`/`undefined` = uniform (v1 behavior). */
  originWeights?: number[] | null
  destWeights?: number[] | null
  /** `undefined` = nearestVehicle (v1 behavior). */
  dispatchRule?: DispatchRuleKey
  /** Shift/time-of-day demand profile. `null`/`undefined` = flat (v1 behavior). */
  shiftProfile?: ShiftBlock[] | null
}

export interface Station {
  id: number
  s: number // position along the loop, m
  waiting: number
}

export interface Job {
  origin: number
  dest: number
  created: number
}

export interface Vehicle {
  id: number
  pos: number
  state: VehicleState
  job: Job | null
  soc: number // state of charge, 0-100
  dwellLeft: number
  targetS: number | null
  offTrack: boolean
  /** Sim-time this vehicle last entered ST.IDLE (for longest-idle dispatch). */
  idleSince: number
}

export type StateBucketKey = 'loaded' | 'empty' | 'handling' | 'blocked' | 'charging' | 'idle'
export type StateTime = Record<StateBucketKey, number>

export interface SimStats {
  tph: number
  offeredRate: number
  p50: number
  p95: number
  share: StateTime
  busy: number
  blocked: number
  backlog: number
  met: boolean
  stranded: number
  avgSoc: number
}

export class Sim {
  P: SimParams
  rngArr: () => number
  rngSvc: () => number
  L: number
  t: number
  stations: Station[]
  chargeBayS: number
  charging: Set<number>
  drainMove: number
  chargeRate: number
  vehicles: Vehicle[]
  pending: Job[]
  completed: number
  offered: number
  flowTimes: number[]
  completionLog: number[]
  nextArrival: number
  stateTime: StateTime
  liveState: StateTime
  backlogStart: number | null
  strandedCount: number
  /** Vehicle ids tallied as 'blocked' on the most recent step(). For rendering only — not read by stats(). */
  lastBlockedIds: Set<number>

  constructor(P: SimParams, seed: number) {
    this.P = P
    // dedicated streams: fleet-size changes must never perturb the arrival
    // pattern, or fleet comparisons drown in arrival noise (CRN discipline)
    this.rngArr = mulberry32(seed)
    this.rngSvc = mulberry32((seed ^ 0x9e3779b9) >>> 0)
    this.L = P.loopLen
    this.t = 0
    this.stations = []
    for (let i = 0; i < P.stations; i++) {
      this.stations.push({ id: i, s: (i * this.L) / P.stations, waiting: 0 })
    }
    // charge bays halfway between last station and station 0, on a spur
    this.chargeBayS = ((P.stations - 0.5) * this.L) / P.stations
    this.charging = new Set()
    this.drainMove = 100 / (P.runtimeH * 3600) // %/s while moving
    this.chargeRate = 100 / (P.chargeH * 3600) // %/s while charging
    this.vehicles = []
    for (let i = 0; i < P.fleet; i++) {
      // stagger initial charge — a synchronized fleet would hit the threshold
      // together hours in and flood the bays (warm-start, keeps runs deterministic)
      const soc = P.fleet === 1 ? P.targetPct : 45 + (i / (P.fleet - 1)) * (P.targetPct - 45)
      this.vehicles.push({
        id: i,
        pos: ((i + 0.35) * this.L) / P.fleet,
        state: ST.IDLE,
        job: null,
        soc,
        dwellLeft: 0,
        targetS: null,
        offTrack: false,
        idleSince: 0,
      })
    }
    this.pending = [] // jobs waiting for a vehicle (FCFS)
    this.completed = 0
    this.offered = 0 // jobs that arrived post-warmup (realized load)
    this.flowTimes = [] // post-warmup completions, seconds
    this.completionLog = [] // sim-times of completions (live rolling window)
    this.nextArrival = nextArrivalTime(this.rngArr, P.demand, P.shiftProfile, this.t)
    this.stateTime = { loaded: 0, empty: 0, handling: 0, blocked: 0, charging: 0, idle: 0 } // post-warmup (batch stats)
    this.liveState = { loaded: 0, empty: 0, handling: 0, blocked: 0, charging: 0, idle: 0 } // since start (live tiles)
    this.backlogStart = null
    this.strandedCount = 0
    this.lastBlockedIds = new Set()
  }

  fwd(from: number, to: number): number {
    return (((to - from) % this.L) + this.L) % this.L
  }

  tally(bucket: StateBucketKey, record: boolean): void {
    this.liveState[bucket] += DT
    if (record) this.stateTime[bucket] += DT
  }

  spawnJobs(): void {
    while (this.t >= this.nextArrival) {
      const o = sampleOrigin(this.rngArr, this.P.stations, this.P.originWeights)
      const d = sampleDestination(this.rngArr, this.P.stations, o, this.P.destWeights)
      this.pending.push({ origin: o, dest: d, created: this.nextArrival })
      this.stations[o].waiting++
      if (this.nextArrival > WARMUP) this.offered++
      this.nextArrival = nextArrivalTime(this.rngArr, this.P.demand, this.P.shiftProfile, this.nextArrival)
    }
  }

  dispatch(): void {
    const strategy = DISPATCH_STRATEGIES[this.P.dispatchRule ?? 'nearestVehicle']
    // ctx.pending/vehicles are references to this.pending/this.vehicles, so
    // mutations below (shift) are visible to the strategy on the next call.
    const ctx: DispatchContext = {
      vehicles: this.vehicles,
      pending: this.pending,
      stations: this.stations,
      battery: this.P.battery,
      thresholdPct: this.P.thresholdPct,
      idleState: ST.IDLE,
      fwd: (from, to) => this.fwd(from, to),
    }
    while (this.pending.length) {
      const assignment = strategy(ctx)
      if (!assignment) return
      const best = this.vehicles.find((v) => v.id === assignment.vehicleId)!
      best.job = this.pending.shift()!
      best.state = ST.TO_PICKUP
      best.targetS = this.stations[best.job.origin].s
      best.offTrack = false // parked vehicles re-enter the loop at the spur
    }
  }

  step(): void {
    this.t += DT
    this.spawnJobs()
    this.dispatch()
    this.lastBlockedIds.clear()

    const P = this.P
    const L = this.L
    // follow-the-leader gaps from a position snapshot (max move/step << minGap);
    // charging vehicles sit on the spur, off the guide path — they don't block
    const order = this.vehicles.filter((v) => !v.offTrack).sort((a, b) => a.pos - b.pos)
    const gapOf = new Map<number, number>()
    for (let i = 0; i < order.length; i++) {
      const ahead = order[(i + 1) % order.length]
      const gap = order.length === 1 ? L : ((ahead.pos - order[i].pos + L) % L)
      gapOf.set(order[i].id, gap)
    }

    const record = this.t > WARMUP
    const anyToCharge = this.vehicles.some((x) => x.state === ST.TO_CHARGE)
    for (const v of this.vehicles) {
      let bucket: StateBucketKey = 'idle'
      if (v.state === ST.TO_DROP) bucket = 'loaded'
      else if (v.state === ST.TO_PICKUP) bucket = 'empty'
      else if (v.state === ST.LOADING || v.state === ST.UNLOADING) bucket = 'handling'
      else if (v.state === ST.CHARGING || v.state === ST.TO_CHARGE) bucket = 'charging'

      if (v.state === ST.STRANDED) {
        this.tally('idle', record)
        continue
      }

      if (v.state === ST.IDLE && v.offTrack) {
        // parked on the spur: sip power; grab a bay when needed (or to top up)
        v.soc = Math.max(0, v.soc - this.drainMove * DWELL_DRAIN * DT)
        if (
          P.battery &&
          this.charging.size < P.chargeBays &&
          (v.soc < P.thresholdPct || (v.soc < OPP_CHARGE_SOC && this.pending.length === 0))
        ) {
          this.charging.add(v.id)
          v.state = ST.CHARGING
        }
        if (P.battery && v.soc < P.thresholdPct) bucket = 'charging' // waiting for a bay
        this.tally(bucket, record)
        continue
      }

      if (v.state === ST.LOADING || v.state === ST.UNLOADING) {
        v.dwellLeft -= DT
        v.soc = Math.max(0, v.soc - this.drainMove * DWELL_DRAIN * DT)
        if (v.dwellLeft <= 0) {
          if (v.state === ST.LOADING) {
            v.state = ST.TO_DROP
            v.targetS = this.stations[v.job!.dest].s
          } else {
            this.completed++
            this.completionLog.push(this.t)
            if (record) this.flowTimes.push(this.t - v.job!.created)
            v.job = null
            if (P.battery && v.soc < P.thresholdPct) {
              v.state = ST.TO_CHARGE
              v.targetS = this.chargeBayS
            } else {
              v.state = ST.IDLE
              v.targetS = null
              v.idleSince = this.t
            }
          }
        }
      } else if (v.state === ST.CHARGING) {
        v.soc = Math.min(100, v.soc + this.chargeRate * DT)
        // interruptible: yield the bay when work is waiting or a needier vehicle circles
        const canYield = v.soc >= P.thresholdPct + 15
        if (v.soc >= P.targetPct || (canYield && (this.pending.length > 0 || anyToCharge))) {
          this.charging.delete(v.id)
          v.state = ST.IDLE
          v.targetS = null
          v.idleSince = this.t
          v.offTrack = false // re-enter at the bay
        }
      } else if (MOVING.has(v.state)) {
        if (P.parkIdle && v.state === ST.IDLE && v.targetS === null) v.targetS = this.chargeBayS
        const vmax = v.state === ST.IDLE ? P.speed * IDLE_SPEED : P.speed
        const desired = vmax * DT
        const gap = gapOf.get(v.id) ?? L
        let move = Math.min(desired, Math.max(0, gap - P.minGap))
        let arrived = false
        if (v.targetS !== null) {
          const dist = this.fwd(v.pos, v.targetS)
          // circulate policy, all bays occupied → don't stop: lap the loop, retry next pass
          const passThrough = v.state === ST.TO_CHARGE && this.charging.size >= P.chargeBays && !P.parkIdle
          if (dist <= move && !passThrough) {
            move = dist
            arrived = true
          }
        }
        if ((desired > 1e-9 && move <= 1e-9 && WORKING.has(v.state)) || (v.state === ST.TO_CHARGE && desired > 1e-9 && move <= 1e-9)) {
          bucket = 'blocked'
          this.lastBlockedIds.add(v.id)
        }
        v.pos = (v.pos + move) % L
        v.soc = Math.max(0, v.soc - this.drainMove * DT)
        if (arrived) {
          if (v.state === ST.TO_PICKUP) {
            v.state = ST.LOADING
            v.dwellLeft = triSample(this.rngSvc, P.loadS, P.spreadPct / 100)
            this.stations[v.job!.origin].waiting--
          } else if (v.state === ST.TO_DROP) {
            v.state = ST.UNLOADING
            v.dwellLeft = triSample(this.rngSvc, P.unloadS, P.spreadPct / 100)
          } else if (v.state === ST.TO_CHARGE) {
            v.targetS = null
            v.offTrack = true
            v.pos = this.chargeBayS // onto the spur
            if (this.charging.size < P.chargeBays) {
              this.charging.add(v.id)
              v.state = ST.CHARGING
            } else {
              v.state = ST.IDLE // park and wait for a bay (park policy)
              v.idleSince = this.t
            }
          } else if (v.state === ST.IDLE) {
            v.targetS = null
            v.offTrack = true
            v.pos = this.chargeBayS // park
          }
        }
        if (v.soc <= 0 && v.state !== ST.CHARGING) {
          // dead battery = fault; ops pull it off the path (it must not gridlock the loop)
          v.state = ST.STRANDED
          v.offTrack = true
          this.strandedCount++
        }
        if (
          P.battery &&
          v.state === ST.IDLE &&
          (v.soc < P.thresholdPct || (v.soc < OPP_CHARGE_SOC && this.charging.size < P.chargeBays && this.pending.length === 0))
        ) {
          v.state = ST.TO_CHARGE
          v.targetS = this.chargeBayS
        }
      }
      this.tally(bucket, record)
    }
    if (record && this.backlogStart === null) this.backlogStart = this.pending.length
  }

  runFor(seconds: number): void {
    const end = this.t + seconds
    while (this.t < end) this.step()
  }

  stats(): SimStats {
    const elapsed = Math.max(1e-9, this.t - WARMUP)
    const tph = (this.flowTimes.length / elapsed) * 3600
    const offeredRate = (this.offered / elapsed) * 3600
    const sorted = this.flowTimes.slice().sort((a, b) => a - b)
    const total = (Object.values(this.stateTime) as number[]).reduce((a, b) => a + b, 0) || 1e-9
    const share = {} as StateTime
    for (const k of Object.keys(this.stateTime) as StateBucketKey[]) share[k] = this.stateTime[k] / total
    const busy = share.loaded + share.empty + share.handling + share.blocked
    // "met" judges stability against the load this run actually offered —
    // a finite Poisson sample runs a few % above or below nominal demand
    const met = tph >= offeredRate * 0.98 && this.pending.length <= Math.max(8, (this.backlogStart ?? 0) + 5)
    return {
      tph,
      offeredRate,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      share,
      busy,
      blocked: share.blocked,
      backlog: this.pending.length,
      met,
      stranded: this.strandedCount,
      avgSoc: this.vehicles.reduce((a, v) => a + v.soc, 0) / this.vehicles.length,
    }
  }

  liveTph(windowS = 1800): number {
    const cut = this.t - windowS
    while (this.completionLog.length && this.completionLog[0] < cut) this.completionLog.shift()
    return this.t < 60 ? NaN : (this.completionLog.length / Math.min(windowS, Math.max(60, this.t))) * 3600
  }
}

export interface BucketDef {
  key: StateBucketKey
  name: string
  color: string | null
}

export const BUCKETS: BucketDef[] = [
  { key: 'loaded', name: 'loaded travel', color: 'var(--c-loaded)' },
  { key: 'empty', name: 'empty travel', color: 'var(--c-empty)' },
  { key: 'handling', name: 'handling', color: 'var(--c-handling)' },
  { key: 'blocked', name: 'blocked', color: 'var(--c-blocked)' },
  { key: 'charging', name: 'charging', color: 'var(--c-charging)' },
  { key: 'idle', name: 'idle', color: null },
]

export const SIM_HOURS = 8
export const REPS = 2

export function batchRun(P: SimParams, seed: number, hours: number): SimStats {
  const sim = new Sim(P, seed)
  sim.runFor(WARMUP + hours * 3600)
  return sim.stats()
}

export function avgStats(list: SimStats[]): SimStats {
  const m = (f: (s: SimStats) => number) => list.reduce((a, s) => a + f(s), 0) / list.length
  const share = {} as StateTime
  for (const b of BUCKETS) share[b.key] = m((s) => s.share[b.key] ?? 0)
  return {
    tph: m((s) => s.tph),
    offeredRate: m((s) => s.offeredRate),
    p50: m((s) => s.p50),
    p95: m((s) => s.p95),
    busy: m((s) => s.busy),
    blocked: m((s) => s.blocked),
    share,
    backlog: m((s) => s.backlog),
    met: list.every((s) => s.met),
    stranded: list.reduce((a, s) => a + s.stranded, 0),
    avgSoc: m((s) => s.avgSoc),
  }
}
