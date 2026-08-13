/**
 * Structured (weighted) station demand and shift/time-of-day demand
 * profiles. When weights/profile are `null`, every function below takes the
 * EXACT code path the v1 engine used for uniform random O-D and flat-rate
 * arrivals — same rng() call count, same arithmetic — so a scenario with
 * neither set reproduces the v1 regression numbers exactly.
 */
import { expSample } from '../prng.ts'

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

/** A demand multiplier applying from `startHour` (0-24) until the next block's start. */
export interface ShiftBlock {
  startHour: number
  multiplier: number
}

/** The multiplier in effect at the given sim-time, per a 24h-wrapping profile. */
function multiplierAt(profile: ShiftBlock[], simTimeSec: number): number {
  const hourOfDay = (simTimeSec / 3600) % 24
  let mult = profile[0].multiplier
  for (const b of profile) {
    if (b.startHour <= hourOfDay) mult = b.multiplier
    else break
  }
  return mult
}

/** Seconds from the given sim-time to the next block boundary (wraps past 24h). */
function secondsToNextBoundary(profile: ShiftBlock[], simTimeSec: number): number {
  const hourOfDay = (simTimeSec / 3600) % 24
  let nextHour = profile[0].startHour + 24
  for (const b of profile) {
    if (b.startHour > hourOfDay) {
      nextHour = b.startHour
      break
    }
  }
  return (nextHour - hourOfDay) * 3600
}

/**
 * Next arrival time for a Poisson process whose rate may vary over a
 * repeating 24h shift profile. With `shiftProfile` null/empty this is
 * arithmetically identical to the v1 flat-rate scheduler: one expSample()
 * draw, same mean.
 *
 * Exact for piecewise-constant intensity via the standard composition
 * method: draw a candidate gap at the CURRENT segment's rate; if it would
 * land past the segment boundary, jump to the boundary and redraw with the
 * new segment's rate. (This is exact, not an approximation or a per-tick
 * thinning heuristic — memorylessness holds within each constant-rate
 * segment, and restarting at the boundary is valid because a Poisson
 * process with no arrival yet is memoryless there too.)
 */
export function nextArrivalTime(
  rng: () => number,
  demand: number,
  shiftProfile: ShiftBlock[] | null | undefined,
  from: number,
): number {
  if (!shiftProfile || shiftProfile.length === 0) {
    return from + expSample(rng, 3600 / demand)
  }
  if (shiftProfile.length === 1) {
    // A single block spans the whole 24h cycle — the rate never changes, so
    // there's no meaningful boundary to restart at. Treat it as flat (at
    // that block's multiplier) rather than segmenting against a boundary
    // that doesn't represent any real change in rate.
    const rate = demand * shiftProfile[0].multiplier
    return rate > 0 ? from + expSample(rng, 3600 / rate) : from + 24 * 3600
  }
  let t = from
  // Guard against a pathological all-zero-multiplier profile spinning
  // forever. sanitize.ts does NOT rule this out — it only requires each
  // multiplier to be >= 0, so an all-zero profile is a valid import — and a
  // hand-built profile from any other caller is unconstrained. Hitting the
  // guard means "this profile never generates an arrival", so returning the
  // walked-to time is the right answer: demand is simply zero.
  for (let guard = 0; guard < 10000; guard++) {
    const mult = multiplierAt(shiftProfile, t)
    const segRemain = secondsToNextBoundary(shiftProfile, t)
    const rateJobsPerHr = demand * mult
    if (rateJobsPerHr <= 0) {
      t += segRemain
      continue
    }
    const gap = expSample(rng, 3600 / rateJobsPerHr)
    if (gap <= segRemain) return t + gap
    t += segRemain
  }
  return t
}
