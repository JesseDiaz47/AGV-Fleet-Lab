import { describe, expect, it } from 'vitest'
import { mulberry32, expSample } from '../prng.ts'
import { nextArrivalTime, type ShiftBlock } from './demand.ts'

describe('nextArrivalTime — flat-profile equivalence pin', () => {
  it('with shiftProfile null, matches expSample(rng, 3600/demand) exactly', () => {
    const rngA = mulberry32(55)
    const rngB = mulberry32(55)
    let tA = 0
    let tB = 0
    for (let i = 0; i < 5000; i++) {
      tA += expSample(rngA, 3600 / 40)
      tB = nextArrivalTime(rngB, 40, null, tB)
    }
    expect(tB).toBeCloseTo(tA, 6)
  })
})

describe('nextArrivalTime — shift profile', () => {
  it('integrates to nominal demand across a full 24h cycle', () => {
    const profile: ShiftBlock[] = [
      { startHour: 0, multiplier: 0.5 },
      { startHour: 8, multiplier: 1.5 },
      { startHour: 16, multiplier: 1.0 },
    ]
    const demand = 40 // nominal jobs/hr; profile averages to (8*0.5+8*1.5+8*1.0)/24 = 1.0x
    const rng = mulberry32(7)
    let t = 0
    let count = 0
    const horizon = 24 * 3600 * 50 // 50 days, for a stable average
    while (t < horizon) {
      t = nextArrivalTime(rng, demand, profile, t)
      count++
    }
    const achievedRate = count / (horizon / 3600) // jobs/hr
    expect(achievedRate).toBeCloseTo(demand, 0) // profile averages to 1.0x nominal
  })

  it('a flat single-block profile matches the null-profile rate', () => {
    const flatProfile: ShiftBlock[] = [{ startHour: 0, multiplier: 1 }]
    const rngFlat = mulberry32(9)
    const rngNull = mulberry32(9)
    let tFlat = 0
    let tNull = 0
    for (let i = 0; i < 3000; i++) {
      tFlat = nextArrivalTime(rngFlat, 40, flatProfile, tFlat)
      tNull = nextArrivalTime(rngNull, 40, null, tNull)
    }
    // Same rate, same rng stream shape (one draw per arrival in both cases,
    // no segment boundary ever crossed since the block spans the full 24h)
    expect(tFlat).toBeCloseTo(tNull, 6)
  })

  it('respects a low-demand block: fewer arrivals land in the cheap segment', () => {
    const profile: ShiftBlock[] = [
      { startHour: 0, multiplier: 0.1 }, // near-silent overnight
      { startHour: 12, multiplier: 1.9 }, // busy daytime
    ]
    const rng = mulberry32(21)
    let t = 0
    let inQuietBlock = 0
    let inBusyBlock = 0
    const horizon = 24 * 3600 * 30
    while (t < horizon) {
      t = nextArrivalTime(rng, 40, profile, t)
      const hourOfDay = (t / 3600) % 24
      if (hourOfDay < 12) inQuietBlock++
      else inBusyBlock++
    }
    expect(inBusyBlock).toBeGreaterThan(inQuietBlock * 5) // 1.9 vs 0.1 is a ~19x rate gap
  })

  it('terminates for a degenerate all-zero-multiplier profile instead of looping forever', () => {
    const deadProfile: ShiftBlock[] = [{ startHour: 0, multiplier: 0 }]
    const rng = mulberry32(3)
    const result = nextArrivalTime(rng, 40, deadProfile, 0)
    expect(Number.isFinite(result)).toBe(true)
  })
})
