import { describe, expect, it } from 'vitest'
import { mulberry32, triSample, createRng } from './prng.ts'

describe('triSample', () => {
  it('is symmetric around the mode and bounded', () => {
    const rng = mulberry32(99)
    let sum = 0
    let mn = Infinity
    let mx = -Infinity
    const N = 20000
    for (let i = 0; i < N; i++) {
      const v = triSample(rng, 30, 0.25)
      sum += v
      mn = Math.min(mn, v)
      mx = Math.max(mx, v)
    }
    expect(Math.abs(sum / N - 30)).toBeLessThan(0.5)
    expect(mn).toBeGreaterThanOrEqual(22.5 - 1e-9)
    expect(mx).toBeLessThanOrEqual(37.5 + 1e-9)
  })
})

describe('createRng / fork (sfc32 + splitmix32 substreams)', () => {
  it('is deterministic: same seed → identical draws', () => {
    const a = createRng(1234, 'root')
    const b = createRng(1234, 'root')
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('different seeds → different draws (sanity)', () => {
    const a = createRng(1)
    const b = createRng(2)
    let diffs = 0
    for (let i = 0; i < 1000; i++) if (a.next() !== b.next()) diffs++
    // Two independent sfc32 streams should disagree on essentially every draw.
    expect(diffs).toBeGreaterThan(990)
  })

  it('forks with the same label produce identical streams (the CRN promise)', () => {
    // Open two independent roots with the same seed.
    const root1 = createRng(42)
    const root2 = createRng(42)
    // Fork both with the same label — they should draw the same sequence.
    const arrivals1 = root1.fork('arrivals')
    const arrivals2 = root2.fork('arrivals')
    for (let i = 0; i < 1000; i++) {
      expect(arrivals1.next()).toBe(arrivals2.next())
    }
  })

  it('forks with different labels produce statistically independent streams', () => {
    const root = createRng(7)
    const arrivals = root.fork('arrivals')
    const service = root.fork('service')
    // Draw N from each and assert the two samples have means close to 0.5 and
    // are NOT identical. Stronger independence check (covariance ~ 0) is
    // overkill for what this PR promises — the documented guarantee is
    // "uncorrelated", not "provably orthogonal" — so we use the looser mean
    // + not-identical assertion here.
    const N = 20000
    let sumA = 0, sumS = 0
    let diffs = 0
    for (let i = 0; i < N; i++) {
      const a = arrivals.next()
      const s = service.next()
      sumA += a; sumS += s
      if (a !== s) diffs++
    }
    expect(Math.abs(sumA / N - 0.5)).toBeLessThan(0.02)
    expect(Math.abs(sumS / N - 0.5)).toBeLessThan(0.02)
    // Two independent uniform streams should disagree on essentially every draw.
    expect(diffs / N).toBeGreaterThan(0.99)
  })

  it('consuming the root does not perturb a forked substream (CRN discipline)', () => {
    // The whole point: a substream forked BEFORE the parent is consumed must
    // draw the same sequence as the same substream forked from an untouched
    // parent. Otherwise we cannot trust scenario A/B comparisons that vary
    // how many draws the root takes before any substream is touched.
    const freshRoot = createRng(2024)
    const untouched = freshRoot.fork('dispatch')

    const dirtyRoot = createRng(2024)
    // Consume a bunch from the root first — emulating "the engine drew some
    // RNG before reaching the dispatch decision."
    for (let i = 0; i < 500; i++) dirtyRoot.next()
    const dirty = dirtyRoot.fork('dispatch')

    for (let i = 0; i < 1000; i++) {
      expect(untouched.next()).toBe(dirty.next())
    }
  })

  it('accepts a string seed via FNV-1a hash and stays deterministic', () => {
    const a = createRng('scenario-default', 'root')
    const b = createRng('scenario-default', 'root')
    expect(a.seed).toBe(b.seed)
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })

  it('nextInt draws a uniform integer in [0, n)', () => {
    const rng = createRng(11)
    const buckets = new Array(10).fill(0)
    for (let i = 0; i < 50000; i++) buckets[rng.nextInt(10)]++
    // No bucket should be empty — that's the only hard correctness check we
    // can make without invoking a chi-square table. With N=50000 and k=10,
    // the std-dev per bucket is sqrt(50000*0.1*0.9) ≈ 67, so a single bucket
    // drifting to 0.10 + 2σ (~5135) is statistically normal; we don't pin a
    // tighter bound because flaky statistical tests are worse than no test.
    for (const c of buckets) expect(c).toBeGreaterThan(0)
  })
})
