/**
 * Seeded randomness + sampling kit for reproducible simulations and demos.
 * Source: agv-fleet-lab. Generic as-is.
 *
 * Why seeded: Math.random() can't reproduce a run. A seeded stream means
 * "same seed, same result" — users can share a scenario by its seed, tests
 * can assert exact outcomes, and A/B comparisons aren't drowned in noise.
 *
 * Stream discipline (the hard-won part): give each stochastic process its
 * OWN stream (arrivals vs service times, etc.). Then changing how one
 * process is consumed never perturbs the others — the "common random
 * numbers" variance-reduction technique. Derive extra seeds like:
 *   const svc = mulberry32((seed ^ 0x9e3779b9) >>> 0)
 */

/** Deterministic PRNG, uniform on [0,1). Fast, tiny, good-enough spread. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Exponential inter-arrival sample (Poisson process) with the given mean. */
export function expSample(rng: () => number, mean: number): number {
  return -Math.log(1 - rng()) * mean
}

/**
 * Symmetric triangular sample on [mode(1-spread), mode(1+spread)] —
 * the honest "time varies ±X%" distribution for service/handling times.
 */
export function triSample(rng: () => number, mode: number, spreadFrac: number): number {
  if (spreadFrac <= 0) return mode
  const a = mode * (1 - spreadFrac)
  const b = mode * (1 + spreadFrac)
  const u = rng()
  return u < 0.5
    ? a + Math.sqrt(u * (b - a) * (mode - a))
    : b - Math.sqrt((1 - u) * (b - a) * (b - mode))
}

/** Interpolated percentile (p in [0,1]) of an ASCENDING-sorted array. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/* -------------------------------------------------------------------------- */
/* sfc32 + substream factory                                                  */
/* -------------------------------------------------------------------------- */

/** Object returned by {@link createRng}. A stream with a name and a fork() helper. */
export interface Rng {
  /** Deterministic 32-bit seed this stream was opened from (after normalization). */
  readonly seed: number
  /** Stream label, useful for logs / tests ("arrivals", "service", ...). */
  readonly label: string
  /** Draw a uniform sample in [0, 1). */
  next(): number
  /** Draw an integer in [0, n). */
  nextInt(n: number): number
  /**
   * Derive a statistically independent substream. Calling fork() on the same
   * parent with the same label returns streams that produce identical draws;
   * with different labels, the streams are uncorrelated. This is what makes
   * Common Random Numbers (CRN) variance reduction work: holding one
   * substream's draws fixed while a sibling changes no longer perturbs the
   * other, so two scenario variants stay synchronized on the random inputs
   * they share.
   */
  fork(label: string): Rng
}

const DEFAULT_SEED = 0x9e3779b9 >>> 0
const UINT32 = 0x100000000

/** FNV-1a hash for string seeds — deterministic, no Math.random. */
function hashStringToInt(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Coerce any acceptable seed input into a non-zero uint32. */
function normalizeSeed(seed: number | string | undefined): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return ((seed >>> 0) || DEFAULT_SEED)
  }
  if (seed === undefined || seed === null || seed === '') return DEFAULT_SEED
  return (hashStringToInt(String(seed)) || DEFAULT_SEED)
}

/**
 * splitmix32 mixer — used to expand a single seed into the four 32-bit words
 * that sfc32 needs. Better equidistribution than seeding sfc32 directly from
 * a small integer.
 */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x9e3779b9) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0
    return ((t ^ (t >>> 15)) >>> 0)
  }
}

/**
 * sfc32 (Small Fast Counting, 32-bit). Passes PractRand-class smoke tests,
 * has a 2^128 period, and is faster than Mulberry32 on modern engines.
 * Reference: https://pracrand.sourceforge.net/ and Chris Doty-Humphrey's
 * public-domain sfc implementation.
 */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  let aa = a >>> 0, bb = b >>> 0, cc = c >>> 0, dd = d >>> 0
  return function next(): number {
    aa >>>= 0; bb >>>= 0; cc >>>= 0; dd >>>= 0
    const t = (aa + bb) >>> 0
    aa = bb ^ (bb >>> 9)
    bb = (cc + (cc << 3)) >>> 0
    cc = ((cc << 21) | (cc >>> 11)) >>> 0
    dd = (dd + 1) >>> 0
    const sum = (t + dd) >>> 0
    cc = (cc + sum) >>> 0
    return sum / UINT32
  }
}

/**
 * Open a deterministic {@link Rng} stream. The default seed (undefined /
 * empty / non-finite) is a constant so two opens with no seed are still
 * reproducible across machines and CI runs.
 *
 * Use one root stream per scenario and fork() labelled substreams for each
 * stochastic source (arrivals, service, dispatch, battery drain). That's the
 * CRN discipline described at the top of this file — finally implemented.
 */
export function createRng(seed?: number | string, label: string = 'root'): Rng {
  const root = normalizeSeed(seed)
  // Each make() does its own splitmix32 → sfc32 init from its childSeed;
  // the root just delegates straight through with parentSeed === root so
  // fork() can derive grandchildren from the original root deterministically.
  function make(childSeed: number, childLabel: string, parentSeed: number): Rng {
    const childMix = splitmix32(childSeed)
    let childNext = sfc32(childMix(), childMix(), childMix(), childMix())
    return {
      seed: childSeed,
      label: childLabel,
      next() { return childNext() },
      nextInt(n: number) { return Math.floor(childNext() * n) },
      fork(grandLabel: string): Rng {
        // Derive the grandchild's seed from the parent's ROOT seed + the new
        // label — NOT from a fresh draw off the parent. This is what makes
        // the CRN discipline hold: holding one substream's draws fixed while
        // a sibling changes no longer perturbs the other, regardless of how
        // many draws the parent has consumed before the fork.
        const mixed = (Math.imul(parentSeed ^ hashStringToInt(grandLabel), 0x9e3779b9)) >>> 0
        return make(mixed || DEFAULT_SEED, grandLabel, childSeed)
      },
    }
  }

  return make(root, label, root)
}
