/**
 * Pluggable dispatch strategies. Each strategy picks ONE vehicle to serve
 * the head-of-queue job (the queue is always FCFS-ordered by arrival, so
 * "which job goes next" is already decided — dispatch is about which
 * *vehicle* serves it). `Sim.dispatch()` calls the selected strategy
 * repeatedly until it returns null.
 *
 * Deliberately decoupled from sim.ts's concrete types (accepts minimal
 * structural shapes instead) so this module has zero engine-internals
 * knowledge and sim.ts can import it without a circular dependency.
 */

export interface DispatchVehicle {
  id: number
  state: string
  soc: number
  pos: number
  /** Sim-time this vehicle last entered its idle state. */
  idleSince: number
}

export interface DispatchJob {
  origin: number
}

export interface DispatchStation {
  s: number
}

export interface DispatchContext {
  vehicles: DispatchVehicle[]
  pending: DispatchJob[]
  stations: DispatchStation[]
  battery: boolean
  thresholdPct: number
  /** The string value of the engine's IDLE state (avoids importing sim.ts's enum). */
  idleState: string
  fwd: (from: number, to: number) => number
}

export interface DispatchAssignment {
  vehicleId: number
}

export type DispatchStrategy = (ctx: DispatchContext) => DispatchAssignment | null

function eligibleIdle(ctx: DispatchContext): DispatchVehicle[] {
  return ctx.vehicles.filter((v) => v.state === ctx.idleState && !(ctx.battery && v.soc < ctx.thresholdPct))
}

/** v1's original rule: nearest eligible idle vehicle to the next job's pickup. */
export const nearestVehicle: DispatchStrategy = (ctx) => {
  if (ctx.pending.length === 0) return null
  const job = ctx.pending[0]
  let best: DispatchVehicle | null = null
  let bestDist = Infinity
  for (const v of eligibleIdle(ctx)) {
    const d = ctx.fwd(v.pos, ctx.stations[job.origin].s)
    if (d < bestDist) {
      bestDist = d
      best = v
    }
  }
  return best ? { vehicleId: best.id } : null
}

/** No optimization: first eligible idle vehicle in fleet order. The naive baseline. */
export const fcfsAnyIdle: DispatchStrategy = (ctx) => {
  if (ctx.pending.length === 0) return null
  const v = eligibleIdle(ctx)[0]
  return v ? { vehicleId: v.id } : null
}

/** Load-balancing: the vehicle that has sat idle longest gets the next job. */
export const longestIdleVehicle: DispatchStrategy = (ctx) => {
  if (ctx.pending.length === 0) return null
  let best: DispatchVehicle | null = null
  for (const v of eligibleIdle(ctx)) {
    if (!best || v.idleSince < best.idleSince) best = v
  }
  return best ? { vehicleId: best.id } : null
}

export type DispatchRuleKey = 'nearestVehicle' | 'fcfs' | 'longestIdleVehicle'

export const DISPATCH_STRATEGIES: Record<DispatchRuleKey, DispatchStrategy> = {
  nearestVehicle,
  fcfs: fcfsAnyIdle,
  longestIdleVehicle,
}
