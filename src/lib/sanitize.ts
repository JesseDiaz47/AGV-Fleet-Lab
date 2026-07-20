/**
 * The one validator for AppState. Wired into both persistence.ts (localStorage
 * load) and backup.ts (JSON restore) — corrupt storage and a tampered import
 * file are rejected/repaired the same way. Never trust, always repair-or-drop.
 */
import { optionalNumber, oneOf, uniqueIds, isObject, type Validated } from './validate.ts'
import { defaultParams, makeScenario } from './defaults.ts'
import {
  DISPATCH_RULES,
  PARAM_LIMITS,
  type AppState,
  type DispatchRule,
  type Scenario,
  type ScenarioParams,
  type ShiftBlock,
} from '../types/domain.ts'

function numOrDefault(raw: unknown, key: keyof typeof PARAM_LIMITS, fallback: number): number {
  const [min, max] = PARAM_LIMITS[key]
  const v = optionalNumber(raw, max, min)
  return v === null || v === 'invalid' ? fallback : v
}

function bool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function sanitizeWeights(raw: unknown, stations: number): number[] | null {
  if (!Array.isArray(raw) || raw.length !== stations) return null
  const weights = raw.map((v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : NaN))
  if (weights.some((w) => Number.isNaN(w))) return null
  if (weights.every((w) => w === 0)) return null // all-zero is meaningless, fall back to uniform
  return weights
}

function sanitizeShiftProfile(raw: unknown): ShiftBlock[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const blocks: ShiftBlock[] = []
  for (const item of raw) {
    if (!isObject(item)) return null
    const startHour = item.startHour
    const multiplier = item.multiplier
    if (typeof startHour !== 'number' || !Number.isFinite(startHour) || startHour < 0 || startHour >= 24) return null
    if (typeof multiplier !== 'number' || !Number.isFinite(multiplier) || multiplier < 0) return null
    blocks.push({ startHour, multiplier })
  }
  blocks.sort((a, b) => a.startHour - b.startHour)
  if (blocks[0]?.startHour !== 0) return null // must cover the full 24h cycle from hour 0
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].startHour === blocks[i - 1].startHour) return null // no duplicate starts
  }
  return blocks
}

export function sanitizeScenarioParams(raw: unknown): ScenarioParams {
  const d = defaultParams()
  if (!isObject(raw)) return d
  const stations = numOrDefault(raw.stations, 'stations', d.stations)
  return {
    demand: numOrDefault(raw.demand, 'demand', d.demand),
    loopLen: numOrDefault(raw.loopLen, 'loopLen', d.loopLen),
    stations,
    speed: numOrDefault(raw.speed, 'speed', d.speed),
    minGap: numOrDefault(raw.minGap, 'minGap', d.minGap),
    parkIdle: bool(raw.parkIdle, d.parkIdle),
    loadS: numOrDefault(raw.loadS, 'loadS', d.loadS),
    unloadS: numOrDefault(raw.unloadS, 'unloadS', d.unloadS),
    spreadPct: numOrDefault(raw.spreadPct, 'spreadPct', d.spreadPct),
    battery: bool(raw.battery, d.battery),
    runtimeH: numOrDefault(raw.runtimeH, 'runtimeH', d.runtimeH),
    chargeH: numOrDefault(raw.chargeH, 'chargeH', d.chargeH),
    thresholdPct: numOrDefault(raw.thresholdPct, 'thresholdPct', d.thresholdPct),
    targetPct: numOrDefault(raw.targetPct, 'targetPct', d.targetPct),
    chargeBays: numOrDefault(raw.chargeBays, 'chargeBays', d.chargeBays),
    availabilityPct: numOrDefault(raw.availabilityPct, 'availabilityPct', d.availabilityPct),
    maxUtilPct: numOrDefault(raw.maxUtilPct, 'maxUtilPct', d.maxUtilPct),
    fleet: numOrDefault(raw.fleet, 'fleet', d.fleet),
    seed: numOrDefault(raw.seed, 'seed', d.seed),
    dispatchRule: oneOf<DispatchRule>(raw.dispatchRule, DISPATCH_RULES, d.dispatchRule),
    originWeights: sanitizeWeights(raw.originWeights, stations),
    destWeights: sanitizeWeights(raw.destWeights, stations),
    shiftProfile: sanitizeShiftProfile(raw.shiftProfile),
  }
}

function sanitizeScenario(raw: unknown): Scenario | null {
  if (!isObject(raw)) return null
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : null
  if (!id || !name) return null
  const now = new Date().toISOString()
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : now
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt
  const revision = typeof raw.revision === 'number' && Number.isFinite(raw.revision) ? Math.max(1, Math.round(raw.revision)) : 1
  return {
    id,
    name,
    createdAt,
    updatedAt,
    revision,
    params: sanitizeScenarioParams(raw.params),
  }
}

export function sanitizeState(raw: unknown): Validated<AppState> {
  if (!isObject(raw)) {
    const scenario = makeScenario('Default scenario')
    return { ok: true, value: { scenarios: [scenario], activeScenarioId: scenario.id, compareIds: [] } }
  }
  const rawScenarios = Array.isArray(raw.scenarios) ? raw.scenarios : []
  let scenarios = rawScenarios.map(sanitizeScenario).filter((s): s is Scenario => s !== null)
  scenarios = uniqueIds(scenarios)
  if (scenarios.length === 0) scenarios = [makeScenario('Default scenario')]

  const ids = new Set(scenarios.map((s) => s.id))
  const activeScenarioId = typeof raw.activeScenarioId === 'string' && ids.has(raw.activeScenarioId) ? raw.activeScenarioId : scenarios[0].id
  const rawCompareIds = Array.isArray(raw.compareIds) ? raw.compareIds : []
  const validCompareIds = rawCompareIds.filter((id): id is string => typeof id === 'string' && ids.has(id))
  const compareIds = Array.from(new Set(validCompareIds)).slice(0, 4)

  return { ok: true, value: { scenarios, activeScenarioId, compareIds } }
}
