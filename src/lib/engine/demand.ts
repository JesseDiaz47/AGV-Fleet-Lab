/**
 * Structured (weighted) station demand. When weights are `null`, both
 * functions below take the EXACT code path the v1 engine used for uniform
 * random origin/destination — same rng() call count, same arithmetic — so a
 * scenario with no weights set reproduces the v1 regression numbers exactly.
 */

/** Uniform index in [0, n), one rng() draw — v1's original origin sampler. */
function uniformIndex(rng: () => number, n: number): number {
  return Math.floor(rng() * n)
}

/** Uniform index in [0, n) excluding `exclude`, one rng() draw — v1's original destination sampler. */
function uniformIndexExcluding(rng: () => number, n: number, exclude: number): number {
  let d = Math.floor(rng() * (n - 1))
  if (d >= exclude) d++
  return d
}

/** Weighted index, one rng() draw. Weights need not sum to 1. */
export function weightedIndex(rng: () => number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0)
  const u = rng() * total
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]
    if (u < acc) return i
  }
  return weights.length - 1 // floating-point safety net
}

/** Weighted index excluding one station; falls back to uniform if the remaining weight is all zero. */
export function weightedIndexExcluding(rng: () => number, weights: number[], exclude: number): number {
  let total = 0
  for (let i = 0; i < weights.length; i++) if (i !== exclude) total += weights[i]
  if (total <= 0) return uniformIndexExcluding(rng, weights.length, exclude)
  const u = rng() * total
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    if (i === exclude) continue
    acc += weights[i]
    if (u < acc) return i
  }
  return exclude === weights.length - 1 ? weights.length - 2 : weights.length - 1
}

export function sampleOrigin(rng: () => number, stations: number, weights: number[] | null | undefined): number {
  return weights ? weightedIndex(rng, weights) : uniformIndex(rng, stations)
}

export function sampleDestination(
  rng: () => number,
  stations: number,
  origin: number,
  weights: number[] | null | undefined,
): number {
  return weights ? weightedIndexExcluding(rng, weights, origin) : uniformIndexExcluding(rng, stations, origin)
}
