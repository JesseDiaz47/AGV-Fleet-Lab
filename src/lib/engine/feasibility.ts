/**
 * Geometric feasibility of a fleet on the guide path.
 *
 * VEHICLES ARE POINTS IN THIS MODEL. `minGap` is the whole of the clearance a
 * vehicle claims — headway, braking distance and body length are not modelled
 * separately, and real vehicle length is outside the model. So the only
 * physical constraint the engine can enforce is that the loop has room for
 * every vehicle's gap:
 *
 *     fleet * minGap < loopLen
 *
 * EQUALITY IS DELIBERATELY INFEASIBLE. At `fleet * minGap === loopLen` the
 * vehicles do fit — evenly spaced, each exactly `minGap` from both neighbours
 * — but the follow-the-leader rule moves a vehicle by `max(0, gap - minGap)`,
 * which is zero for every vehicle in that arrangement, forever. It is a valid
 * static packing and an unrunnable one: throughput is identically zero. A
 * strict inequality is the boundary between "tight" and "seized".
 *
 * This is a floor, not a warrant. Clearing it means the fleet can physically
 * exist on the loop; it says nothing about whether the fleet meets demand.
 */

export interface FleetGeometry {
  loopLen: number // m
  minGap: number // m
  fleet: number
}

export interface FleetFeasibility {
  feasible: boolean
  /** Largest fleet this loop and gap can hold, i.e. the largest n with n * minGap < loopLen. */
  maxFleet: number
  /** Plain-English explanation when infeasible, else null. */
  reason: string | null
}

/** True when `fleet` vehicles fit on `loopLen` metres while each holds `minGap`. */
export function isFleetFeasible(loopLen: number, minGap: number, fleet: number): boolean {
  if (!Number.isFinite(loopLen) || !Number.isFinite(minGap) || !Number.isFinite(fleet)) return false
  if (loopLen <= 0 || minGap <= 0 || fleet < 1) return false
  return fleet * minGap < loopLen
}

/**
 * Largest fleet that fits. Derived by walking down from the analytic estimate
 * rather than computing it in closed form, so it agrees with
 * `isFleetFeasible` exactly even where `loopLen / minGap` lands on an integer
 * that floating-point division misses by an ulp.
 */
export function maxFeasibleFleet(loopLen: number, minGap: number): number {
  if (!Number.isFinite(loopLen) || !Number.isFinite(minGap)) return 0
  if (loopLen <= 0 || minGap <= 0) return 0
  let n = Math.floor(loopLen / minGap)
  while (n > 0 && !isFleetFeasible(loopLen, minGap, n)) n--
  return Math.max(0, n)
}

export function fleetFeasibility({ loopLen, minGap, fleet }: FleetGeometry): FleetFeasibility {
  const maxFleet = maxFeasibleFleet(loopLen, minGap)
  if (isFleetFeasible(loopLen, minGap, fleet)) return { feasible: true, maxFleet, reason: null }
  const needed = fleet * minGap
  return {
    feasible: false,
    maxFleet,
    reason:
      `${fleet} vehicles each holding a ${minGap} m gap need more than ${needed} m of guide path, ` +
      `but the loop is ${loopLen} m. This loop holds at most ${maxFleet} vehicle${maxFleet === 1 ? '' : 's'}. ` +
      `Shorten the gap, lengthen the loop, or cut the fleet.`,
  }
}
