/**
 * Domain model for AGV Fleet Lab v2.
 *
 * A Scenario bundles everything the engine needs (analytic + simulation
 * params) plus identity/versioning so it can be named, duplicated, compared,
 * and exported without ever silently overwriting a prior run.
 */

/** Current persisted schema version. Bump when either shape below changes. */
export const SCHEMA_VERSION = 1

/** Signature used to recognize this app's backup files (see backup.ts). */
export const APP_SIGNATURE = 'agv-fleet-lab'

import type { DispatchRuleKey } from '../lib/engine/dispatch.ts'
import type { ShiftBlock } from '../lib/engine/demand.ts'

export type { ShiftBlock }

/**
 * The job queue is always FCFS-ordered by arrival, so "which job goes next"
 * is already decided before dispatch runs — a rule can only differ on WHICH
 * VEHICLE serves that job. (A literal "longest-waiting job priority" rule
 * would be a no-op: the queue already serves the longest-waiting job first.)
 */
export type DispatchRule = DispatchRuleKey

export const DISPATCH_RULES: DispatchRule[] = ['nearestVehicle', 'fcfs', 'longestIdleVehicle']

export const DISPATCH_RULE_LABEL: Record<DispatchRule, string> = {
  nearestVehicle: 'Nearest idle vehicle (shortest travel)',
  fcfs: 'First idle vehicle (FCFS, no optimization)',
  longestIdleVehicle: 'Longest-idle vehicle (load balancing)',
}

/**
 * Everything the analytic model and the simulation engine both need.
 * Kept as one flat blob (matches the v1 tool's FIELDS) rather than splitting
 * analytic vs. sim params — the two models describe the same scenario.
 */
export interface ScenarioParams {
  // demand
  demand: number // jobs/hr, nominal
  // guide path (single loop)
  loopLen: number // m
  stations: number
  speed: number // m/s
  minGap: number // m
  parkIdle: boolean
  // handling
  loadS: number // s
  unloadS: number // s
  spreadPct: number // 0-100
  // battery
  battery: boolean
  runtimeH: number // h
  chargeH: number // h
  thresholdPct: number // 0-100
  targetPct: number // 0-100
  chargeBays: number
  // planning factors (analytic)
  availabilityPct: number // 0-100
  maxUtilPct: number // 0-100
  // fleet + reproducibility
  fleet: number
  seed: number
  // deeper model (v2)
  dispatchRule: DispatchRule
  /**
   * Per-station demand weights. `null` = uniform (matches v1 behavior
   * exactly). When set, length must equal `stations`; values need not sum to
   * 1 — they're normalized at use.
   */
  originWeights: number[] | null
  destWeights: number[] | null
  /**
   * Shift/time-of-day demand profile as multipliers on `demand`, applied over
   * a repeating 24h cycle. `null` = flat (matches v1 behavior exactly).
   */
  shiftProfile: ShiftBlock[] | null
  /**
   * EXPERIMENTAL, default off. Allow an empty (idle) vehicle to backtrack
   * toward a pickup instead of lapping the loop forward.
   *
   * The supported guide path is a single ONE-WAY loop, so reverse travel is
   * outside the model the analytic pass and the spacing rules are built on.
   * It is admitted only under a narrow give-way rule — reverse only into a
   * confirmed-clear segment, and yield to forward traffic unconditionally
   * (see `REVERSE_CLEARANCE` in `lib/engine/sim.ts`). Reverse travel is only
   * ever legal empty; once a job is loaded the vehicle always goes forward to
   * the drop. Off reproduces the v1 one-way baseline exactly.
   */
  allowReversePickup: boolean
}

export interface Scenario {
  id: string
  name: string
  createdAt: string // ISO
  updatedAt: string // ISO
  /** Bumped on every saved edit — never overwritten silently. */
  revision: number
  params: ScenarioParams
}

export interface AppState {
  scenarios: Scenario[]
  activeScenarioId: string | null
  /** 2-4 scenario ids selected for the comparison view. */
  compareIds: string[]
}

/** Inclusive numeric range for a param field. */
export const PARAM_LIMITS = {
  demand: [1, 400],
  loopLen: [60, 3000],
  stations: [2, 16],
  speed: [0.2, 4],
  minGap: [1, 20],
  loadS: [2, 600],
  unloadS: [2, 600],
  spreadPct: [0, 80],
  runtimeH: [0.5, 24],
  chargeH: [0.1, 8],
  thresholdPct: [5, 60],
  targetPct: [50, 100],
  chargeBays: [1, 4],
  availabilityPct: [50, 100],
  maxUtilPct: [50, 100],
  seed: [1, 999999],
  fleet: [1, 14],
} as const satisfies Record<string, readonly [number, number]>
