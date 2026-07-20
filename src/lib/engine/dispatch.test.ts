import { describe, expect, it } from 'vitest'
import { fcfsAnyIdle, longestIdleVehicle, nearestVehicle, type DispatchContext, type DispatchVehicle } from './dispatch.ts'

function ctx(vehicles: DispatchVehicle[], overrides: Partial<DispatchContext> = {}): DispatchContext {
  return {
    vehicles,
    pending: [{ origin: 0 }],
    stations: [{ s: 100 }],
    battery: false,
    thresholdPct: 20,
    idleState: 'idle',
    fwd: (from, to) => Math.abs(to - from),
    ...overrides,
  }
}

const v = (id: number, extra: Partial<DispatchVehicle> = {}): DispatchVehicle => ({
  id,
  state: 'idle',
  soc: 100,
  pos: 0,
  idleSince: 0,
  ...extra,
})

describe('nearestVehicle', () => {
  it('picks the eligible idle vehicle with the shortest forward distance', () => {
    const vehicles = [v(0, { pos: 50 }), v(1, { pos: 90 }), v(2, { pos: 20 })]
    const result = nearestVehicle(ctx(vehicles))
    expect(result?.vehicleId).toBe(1) // |100-90| = 10, closest
  })

  it('skips vehicles that are not idle or below the battery threshold', () => {
    const vehicles = [v(0, { pos: 99, state: 'toDrop' }), v(1, { pos: 95, soc: 5 }), v(2, { pos: 50 })]
    const result = nearestVehicle(ctx(vehicles, { battery: true }))
    expect(result?.vehicleId).toBe(2)
  })

  it('returns null when the queue is empty', () => {
    expect(nearestVehicle(ctx([v(0)], { pending: [] }))).toBeNull()
  })

  it('returns null when no vehicle is eligible', () => {
    expect(nearestVehicle(ctx([v(0, { state: 'toDrop' })]))).toBeNull()
  })
})

describe('fcfsAnyIdle', () => {
  it('picks the first eligible idle vehicle in fleet order, ignoring distance', () => {
    const vehicles = [v(0, { pos: 99 }), v(1, { pos: 1 })]
    const result = fcfsAnyIdle(ctx(vehicles))
    expect(result?.vehicleId).toBe(0) // first in order, despite being farther
  })
})

describe('longestIdleVehicle', () => {
  it('picks the vehicle that has been idle longest, ignoring distance and fleet order', () => {
    const vehicles = [v(0, { pos: 1, idleSince: 500 }), v(1, { pos: 99, idleSince: 10 }), v(2, { pos: 50, idleSince: 200 })]
    const result = longestIdleVehicle(ctx(vehicles))
    expect(result?.vehicleId).toBe(1) // smallest idleSince = idle the longest
  })
})
