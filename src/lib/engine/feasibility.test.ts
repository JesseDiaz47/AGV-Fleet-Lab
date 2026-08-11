import { describe, expect, it } from 'vitest'
import { fleetFeasibility, isFleetFeasible, maxFeasibleFleet } from './feasibility.ts'

describe('maxFeasibleFleet', () => {
  it('is the largest fleet that leaves every vehicle more than minGap of loop', () => {
    expect(maxFeasibleFleet(400, 3)).toBe(133) // 133 * 3 = 399 < 400
    expect(maxFeasibleFleet(400, 20)).toBe(19) // 20 * 20 = 400 is exactly full
    expect(maxFeasibleFleet(60, 20)).toBe(2) // 3 * 20 = 60 is exactly full
    expect(maxFeasibleFleet(100, 10)).toBe(9)
  })

  it('agrees with isFleetFeasible at its own boundary, including exact division', () => {
    for (const [loopLen, minGap] of [
      [400, 3],
      [400, 20],
      [60, 20],
      [100, 10],
      [1000, 7],
      [61, 20],
      [3000, 1],
    ]) {
      const max = maxFeasibleFleet(loopLen, minGap)
      expect(isFleetFeasible(loopLen, minGap, max), `${loopLen}/${minGap}: max ${max} should fit`).toBe(true)
      expect(isFleetFeasible(loopLen, minGap, max + 1), `${loopLen}/${minGap}: ${max + 1} should not fit`).toBe(false)
    }
  })

  it('never returns a negative fleet for degenerate geometry', () => {
    expect(maxFeasibleFleet(10, 20)).toBe(0)
    expect(maxFeasibleFleet(0, 3)).toBe(0)
    expect(maxFeasibleFleet(400, 0)).toBe(0)
    expect(maxFeasibleFleet(NaN, 3)).toBe(0)
  })
})

describe('isFleetFeasible', () => {
  it('accepts the default scenario', () => {
    expect(isFleetFeasible(400, 3, 5)).toBe(true)
    expect(isFleetFeasible(400, 3, 14)).toBe(true)
  })

  it('rejects the reported impossible configuration', () => {
    // 14 vehicles * 20 m of required clearance = 280 m of loop on a 60 m loop.
    expect(isFleetFeasible(60, 20, 14)).toBe(false)
  })

  it('treats an exactly-full loop as infeasible', () => {
    // fleet * minGap === loopLen packs the ring solid: every gap is exactly
    // minGap, so `move = max(0, gap - minGap)` is zero for every vehicle
    // forever. It is a valid static packing and an unrunnable one.
    expect(isFleetFeasible(60, 20, 3)).toBe(false)
    expect(isFleetFeasible(60, 20, 2)).toBe(true)
  })

  it('rejects a fleet of zero or less as meaningless', () => {
    expect(isFleetFeasible(400, 3, 0)).toBe(false)
    expect(isFleetFeasible(400, 3, -1)).toBe(false)
  })
})

describe('fleetFeasibility', () => {
  it('reports a feasible scenario with no reason', () => {
    const f = fleetFeasibility({ loopLen: 400, minGap: 3, fleet: 5 })
    expect(f.feasible).toBe(true)
    expect(f.maxFleet).toBe(133)
    expect(f.reason).toBeNull()
  })

  it('explains an infeasible scenario in the reader’s terms', () => {
    const f = fleetFeasibility({ loopLen: 60, minGap: 20, fleet: 14 })
    expect(f.feasible).toBe(false)
    expect(f.maxFleet).toBe(2)
    expect(f.reason).toMatch(/14/)
    expect(f.reason).toMatch(/20/)
    expect(f.reason).toMatch(/60/)
    expect(f.reason).toMatch(/\b2\b/)
  })
})
