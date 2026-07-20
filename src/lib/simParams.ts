/**
 * Glue between the persisted `ScenarioParams` shape and the two engine
 * entry points, which each want a narrower, purpose-built params object.
 */
import type { AnalyticParams } from './engine/analytic.ts'
import type { SimParams } from './engine/sim.ts'
import type { ScenarioParams } from '../types/domain.ts'

export function toSimParams(p: ScenarioParams): SimParams {
  return {
    demand: p.demand,
    loopLen: p.loopLen,
    stations: p.stations,
    speed: p.speed,
    minGap: p.minGap,
    loadS: p.loadS,
    unloadS: p.unloadS,
    spreadPct: p.spreadPct,
    battery: p.battery,
    runtimeH: p.runtimeH,
    chargeH: p.chargeH,
    thresholdPct: p.thresholdPct,
    targetPct: p.targetPct,
    chargeBays: p.chargeBays,
    parkIdle: p.parkIdle,
    fleet: p.fleet,
    originWeights: p.originWeights,
    destWeights: p.destWeights,
    dispatchRule: p.dispatchRule,
    shiftProfile: p.shiftProfile,
  }
}

export function toAnalyticParams(p: ScenarioParams): AnalyticParams {
  return {
    loopLen: p.loopLen,
    speed: p.speed,
    loadS: p.loadS,
    unloadS: p.unloadS,
    demand: p.demand,
    battery: p.battery,
    runtimeH: p.runtimeH,
    chargeH: p.chargeH,
    availabilityPct: p.availabilityPct,
    maxUtilPct: p.maxUtilPct,
  }
}
