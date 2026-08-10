import { createId } from './id.ts'
import type { AppState, Scenario, ScenarioParams } from '../types/domain.ts'

/** The v1 tool's exact defaults — fictional example numbers. */
export function defaultParams(): ScenarioParams {
  return {
    demand: 40,
    loopLen: 400,
    stations: 6,
    speed: 1.5,
    minGap: 3,
    parkIdle: true,
    loadS: 30,
    unloadS: 30,
    spreadPct: 25,
    battery: true,
    runtimeH: 6,
    chargeH: 1,
    thresholdPct: 20,
    targetPct: 90,
    chargeBays: 1,
    availabilityPct: 95,
    maxUtilPct: 85,
    fleet: 5,
    seed: 42,
    dispatchRule: 'nearestVehicle',
    originWeights: null,
    destWeights: null,
    shiftProfile: null,
    allowReversePickup: true,
  }
}

export function makeScenario(name: string, params: ScenarioParams = defaultParams()): Scenario {
  const now = new Date().toISOString()
  return {
    id: createId('scenario'),
    name,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    params,
  }
}

export function defaultState(): AppState {
  const scenario = makeScenario('Default scenario')
  return {
    scenarios: [scenario],
    activeScenarioId: scenario.id,
    compareIds: [],
  }
}
