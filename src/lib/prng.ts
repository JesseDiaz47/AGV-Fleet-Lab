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
