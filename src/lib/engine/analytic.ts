/**
 * Analytic first-pass fleet-sizing estimate (Egbelu 1987 style) for a
 * one-way loop with uniformly random origin/destination pairs.
 *
 * T_cycle = (d_loaded + d_empty) / v + t_load + t_unload
 * N = ceil( (demand * T_cycle / 3600) / (availability * (1 - chargeOverhead) * maxUtil) )
 */
export interface AnalyticParams {
  loopLen: number // m
  speed: number // m/s
  loadS: number // s
  unloadS: number // s
  demand: number // jobs/hr
  battery: boolean
  runtimeH: number // h
  chargeH: number // h
  availabilityPct: number // 0-100
  maxUtilPct: number // 0-100
}

export interface AnalyticResult {
  dLoaded: number
  dEmpty: number
  travel: number
  cycle: number
  perVehicle: number
  chargeOverhead: number
  derate: number
  nRaw: number
  nReq: number
}

export function analyze(P: AnalyticParams): AnalyticResult {
  const dLoaded = P.loopLen / 2
  const dEmpty = P.loopLen / 2
  const travel = (dLoaded + dEmpty) / P.speed // s
  const cycle = travel + P.loadS + P.unloadS // s per job
  const perVehicle = 3600 / cycle // jobs/hr at 100%
  const chargeOverhead = P.battery ? P.chargeH / (P.runtimeH + P.chargeH) : 0
  const derate = (P.availabilityPct / 100) * (1 - chargeOverhead) * (P.maxUtilPct / 100)
  const nRaw = P.demand / perVehicle
  const nReq = Math.max(1, Math.ceil(nRaw / derate))
  return { dLoaded, dEmpty, travel, cycle, perVehicle, chargeOverhead, derate, nRaw, nReq }
}
