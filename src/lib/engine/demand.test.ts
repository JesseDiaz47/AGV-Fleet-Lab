import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../prng.ts'
import { sampleDestination, sampleOrigin, weightedIndex, weightedIndexExcluding } from './demand.ts'

describe('weightedIndex', () => {
  it('reconciles to the given proportions over a large sample', () => {
    const rng = mulberry32(1)
    const weights = [1, 3, 6] // expect ~10%, ~30%, ~60%
    const counts = [0, 0, 0]
    const N = 60000
    for (let i = 0; i < N; i++) counts[weightedIndex(rng, weights)]++
    expect(counts[0] / N).toBeCloseTo(0.1, 1)
    expect(counts[1] / N).toBeCloseTo(0.3, 1)
    expect(counts[2] / N).toBeCloseTo(0.6, 1)
  })

  it('never returns an out-of-range index', () => {
    const rng = mulberry32(2)
    for (let i = 0; i < 10000; i++) {
      const idx = weightedIndex(rng, [5, 0, 5])
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(3)
    }
  })
})

describe('weightedIndexExcluding', () => {
  it('never returns the excluded index', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 10000; i++) {
      expect(weightedIndexExcluding(rng, [1, 2, 3, 4], 1)).not.toBe(1)
    }
  })

  it('falls back to uniform-among-remaining when the excluded station holds all the weight', () => {
    const rng = mulberry32(4)
    const counts = new Map<number, number>()
    for (let i = 0; i < 6000; i++) {
      const idx = weightedIndexExcluding(rng, [0, 0, 10, 0], 2)
      counts.set(idx, (counts.get(idx) ?? 0) + 1)
    }
    // remaining stations 0,1,3 should each get roughly a third
    for (const idx of [0, 1, 3]) {
      expect((counts.get(idx) ?? 0) / 6000).toBeCloseTo(1 / 3, 1)
    }
  })
})

describe('sampleOrigin / sampleDestination — uniform-path regression pin', () => {
  it('with weights null, consumes rng() identically to the v1 uniform logic', () => {
    const stations = 6
    const rngA = mulberry32(123)
    const rngB = mulberry32(123)

    // v1's original inline logic (kept here verbatim as the reference)
    const legacyOrigin = () => Math.floor(rngA() * stations)
    const legacyDest = (o: number) => {
      let d = Math.floor(rngA() * (stations - 1))
      if (d >= o) d++
      return d
    }

    for (let i = 0; i < 5000; i++) {
      const o1 = legacyOrigin()
      const d1 = legacyDest(o1)
      const o2 = sampleOrigin(rngB, stations, null)
      const d2 = sampleDestination(rngB, stations, o2, null)
      expect(o2).toBe(o1)
      expect(d2).toBe(d1)
    }
  })
})
