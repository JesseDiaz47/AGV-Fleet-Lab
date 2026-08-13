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
import { fleetFeasibility } from './feasibility.ts'
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
/**
 * Clearance a reversing vehicle must hold behind itself, as a multiple of
 * `minGap`.
 *
 * The guide path is one-way: there is no siding, no passing, and no signalling
 * to arbitrate two vehicles that meet nose-to-nose. So reverse travel gets no
 * right of way. Forward traffic keeps its normal `minGap`; the reversing
 * vehicle holds double that and gives way (reverts to forward) the moment the
 * clearance is lost. Two consequences make the model sound:
 *   - the follower's `minGap` is never infringed, because the vehicle moving
 *     against the flow stops closing the gap while a full gap still remains;
 *   - no head-on standoff can persist, because giving way is unconditional —
 *     the reversing vehicle always has the forward lap available to it.
 */
export const REVERSE_CLEARANCE = 2
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
  /**
   * Allow empty (idle) vehicles to backtrack toward a pickup instead of
   * lapping forward. When false, behavior is identical to the v1 one-way
   * loop (v1's own regression numbers pin to this). When true, the
   * dispatcher picks the shorter of fwd vs. rev empty travel to the
   * pickup station.
   */
  allowReversePickup?: boolean
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
  /**
   * Direction of travel. +1 = forward (v1 default), -1 = reverse (only legal
   * while empty on the way to a pickup). Used only when
   * `allowReversePickup` is on and the dispatcher chose the shorter path.
   */
  heading: 1 | -1
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
  /** Fraction of post-warmup pickups that went reverse (0 when reverse is off). */
  reversePickupShare: number
  /** Post-warmup count of pickups completed while still travelling reverse. */
  reversePickups: number
  /** Post-warmup count of all pickups (denominator for the share). */
  pickupsObserved: number
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
  /** Post-warmup count of pickups (TO_PICKUP → LOADING transitions). */
  pickupsObserved: number
  /** Of those, how many arrived while still reversing (give-way trips finish forward and do not count). */
  reversePickups: number

  constructor(P: SimParams, seed: number) {
    // Refuse geometry the guide path cannot hold. A fleet whose combined
    // minGap exceeds the loop starts with its vehicles already inside each
    // other, and stepping it produces 0 jobs/hr at a blocked share of 1.0 —
    // a number that reads as congestion data rather than as an impossible
    // layout. Better to fail loudly than to publish it.
    const fit = fleetFeasibility(P)
    if (!fit.feasible) throw new RangeError(`Infeasible guide-path geometry: ${fit.reason}`)
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
        heading: 1, // v1 default; reverse is only assigned by the dispatcher
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
    this.pickupsObserved = 0
    this.reversePickups = 0
  }

  fwd(from: number, to: number): number {
    return (((to - from) % this.L) + this.L) % this.L
  }

  /**
   * True when the stretch of loop a vehicle would sweep while backing up
   * `revDist` m is free of other on-track vehicles, with `REVERSE_CLEARANCE`
   * gaps of margin.
   *
   * A vehicle may only commit to reverse into a segment it can see is empty —
   * backing blind into oncoming traffic on a one-way path is not a maneuver
   * the model can represent. Vehicles on the charge spur are off the guide
   * path and don't count; stranded ones have been pulled off by ops.
   */
  reverseArcClear(v: Vehicle, revDist: number): boolean {
    for (const o of this.vehicles) {
      if (o.id === v.id || o.offTrack || o.state === ST.STRANDED) continue
      // fwd(o → v) is exactly how far v must back up before it reaches o.
      if (this.fwd(o.pos, v.pos) <= revDist + REVERSE_CLEARANCE * this.P.minGap) return false
    }
    return true
  }

  /**
   * True when `v`, currently off the guide path on the charge/park spur, can
   * merge back onto the loop at its own position without infringing `minGap`.
   *
   * The spur is modelled as a siding hanging off one point of the loop, so
   * re-entry is a merge into live traffic, not a teleport: both the vehicle
   * that will be ahead and the one that will be behind must already be at
   * least `minGap` away. A single check on the leader is not enough — the
   * follower cannot brake retroactively for a vehicle that appeared inside
   * its gap between two snapshots.
   *
   * Exactly `minGap` counts as clear: that is the same closest approach the
   * follow-the-leader rule allows on the loop itself (`gap - minGap`), so the
   * merge rule and the travel rule agree at the boundary. Vehicles already on
   * the spur don't occupy the loop; stranded ones have been pulled off it.
   */
  reEntryClear(v: Vehicle): boolean {
    for (const o of this.vehicles) {
      if (o.id === v.id || o.offTrack || o.state === ST.STRANDED) continue
      if (this.fwd(v.pos, o.pos) < this.P.minGap) return false // would land inside the leader's gap
      if (this.fwd(o.pos, v.pos) < this.P.minGap) return false // would land inside a follower's gap
    }
    return true
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
    // ctx.pending is a reference to this.pending, so mutations below (shift)
    // are visible to the strategy on the next call. ctx.vehicles is rebuilt
    // per iteration instead: a vehicle parked on the spur is only a candidate
    // while it can actually merge back into traffic, and dispatching one
    // changes that answer for the next parked vehicle in the same step.
    const allowReverse = this.P.allowReversePickup === true
    while (this.pending.length) {
      const ctx: DispatchContext = {
        vehicles: this.vehicles.filter((v) => !v.offTrack || this.reEntryClear(v)),
        pending: this.pending,
        stations: this.stations,
        battery: this.P.battery,
        thresholdPct: this.P.thresholdPct,
        idleState: ST.IDLE,
        fwd: (from, to) => this.fwd(from, to),
      }
      const assignment = strategy(ctx)
      if (!assignment) return
      const best = this.vehicles.find((v) => v.id === assignment.vehicleId)!
      const job = this.pending[0]
      const pickupS = this.stations[job.origin].s
      // Reverse is only legal empty (job not yet picked up), shorter than
      // lapping forward, AND into a segment confirmed clear of other traffic.
      // When reverse is off, heading stays +1 and behavior is byte-identical
      // to v1.
      const fwdDist = this.fwd(best.pos, pickupS)
      const revDist = this.L - fwdDist
      best.heading = allowReverse && revDist < fwdDist && this.reverseArcClear(best, revDist) ? -1 : 1
      best.job = this.pending.shift()!
      best.state = ST.TO_PICKUP
      best.targetS = pickupS
      best.offTrack = false // parked vehicles re-enter the loop at the spur
    }
  }

  /**
   * Merges parked vehicles that belong on the loop rather than on the spur
   * back into traffic, one at a time and only where `minGap` survives.
   *
   * Under the circulate policy (`parkIdle` off) the spur is only ever a
   * charging stop, so a vehicle idling there is waiting for a slot in traffic.
   * Under park-idle the spur IS home: those vehicles wait for dispatch instead
   * (see `dispatch`), and a vehicle queued for a bay must not wander off.
   *
   * Called from `step()` before the position snapshot, so anything that merges
   * here is visible to every follower's gap in the same step.
   */
  mergeFromSpur(): void {
    if (this.P.parkIdle) return
    for (const v of this.vehicles) {
      if (v.offTrack && v.state === ST.IDLE && this.reEntryClear(v)) v.offTrack = false
    }
  }

  step(): void {
    this.t += DT
    this.spawnJobs()
    this.dispatch()
    this.mergeFromSpur()
    this.lastBlockedIds.clear()

    const P = this.P
    const L = this.L
    // follow-the-leader gaps from a position snapshot (max move/step << minGap);
    // charging vehicles sit on the spur, off the guide path — they don't block
    const order = this.vehicles.filter((v) => !v.offTrack).sort((a, b) => a.pos - b.pos)
    // Forward gap = distance to the next vehicle in the loop order. Reverse
    // gap = distance to the PREVIOUS vehicle (the one trailing this one).
    // A vehicle going reverse (heading -1) honors its reverse gap; everyone
    // else honors the forward gap. With heading pinned to +1 (the v1
    // default), revGap is never read and behavior is byte-identical.
    const gapOf = new Map<number, number>()
    const revGapOf = new Map<number, number>()
    for (let i = 0; i < order.length; i++) {
      const ahead = order[(i + 1) % order.length]
      const behind = order[(i - 1 + order.length) % order.length]
      const fwdGap = order.length === 1 ? L : ((ahead.pos - order[i].pos + L) % L)
      const revGap = order.length === 1 ? L : ((order[i].pos - behind.pos + L) % L)
      gapOf.set(order[i].id, fwdGap)
      revGapOf.set(order[i].id, revGap)
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
          // The bay is released immediately (a charged vehicle must never hold
          // one hostage), but the vehicle stays on the spur: rejoining the
          // guide path is `mergeFromSpur`'s job at the top of a step, so that
          // followers see the merge in the same position snapshot they brake
          // against. Until then it is an ordinary parked idle vehicle.
          v.offTrack = true
        }
      } else if (MOVING.has(v.state)) {
        if (P.parkIdle && v.state === ST.IDLE && v.targetS === null) v.targetS = this.chargeBayS
        const vmax = v.state === ST.IDLE ? P.speed * IDLE_SPEED : P.speed
        const desired = vmax * DT
        // Reverse heading is only legal on the empty leg (TO_PICKUP from
        // idle, or IDLE heading back to a parked station). Once loaded
        // (TO_DROP / TO_CHARGE) we force forward — never back up with a load.
        let mayReverse = v.heading === -1 && (v.state === ST.TO_PICKUP || v.state === ST.IDLE)
        if (mayReverse && (revGapOf.get(v.id) ?? L) < REVERSE_CLEARANCE * P.minGap) {
          // Give way: forward traffic has caught up to within the reverse
          // clearance, so abandon the shortcut and finish the trip forward.
          // Unconditional — a vehicle moving against the flow never makes
          // oncoming traffic wait, which is what keeps the loop deadlock-free.
          v.heading = 1
          mayReverse = false
        }
        const gap = mayReverse ? (revGapOf.get(v.id) ?? L) : (gapOf.get(v.id) ?? L)
        let move = Math.min(desired, Math.max(0, gap - P.minGap))
        let arrived = false
        if (v.targetS !== null) {
          const dist = mayReverse ? this.L - this.fwd(v.pos, v.targetS) : this.fwd(v.pos, v.targetS)
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
        v.pos = mayReverse ? ((v.pos - move) % L + L) % L : (v.pos + move) % L
        v.soc = Math.max(0, v.soc - this.drainMove * DT)
        if (arrived) {
          if (v.state === ST.TO_PICKUP) {
            // Count the pickup (post-warmup only) and remember whether it
            // went reverse, for the share KPI.
            if (record) {
              this.pickupsObserved++
              if (mayReverse) this.reversePickups++
            }
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
          // A vehicle that arrived at a pickup reverts to forward heading
          // for the loaded leg. After IDLE→park, heading doesn't matter
          // (we'll only set it again at the next dispatch).
          v.heading = 1
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
      reversePickupShare: this.pickupsObserved > 0 ? this.reversePickups / this.pickupsObserved : 0,
      reversePickups: this.reversePickups,
      pickupsObserved: this.pickupsObserved,
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
    reversePickupShare: m((s) => s.reversePickupShare),
    reversePickups: list.reduce((a, s) => a + s.reversePickups, 0),
    pickupsObserved: list.reduce((a, s) => a + s.pickupsObserved, 0),
  }
}
