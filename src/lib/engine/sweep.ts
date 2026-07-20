/**
 * Pure math for the fleet-size sweep: which sizes to try, scale/tick
 * computation for the chart, and knee/rollover picking. No SVG or DOM here —
 * SweepChart.tsx renders these numbers as real JSX.
 */
import type { AnalyticResult } from './analytic.ts'

export interface SweepPoint {
  n: number
  tph: number
  offered: number
  blocked: number
  busy: number
  p95: number
  met: boolean
}

/** Fleet sizes to try: covers the analytic estimate plus headroom, capped at 14. */
export function sweepSizes(a: Pick<AnalyticResult, 'nReq' | 'nRaw' | 'derate'>): number[] {
  const hi = Math.min(14, Math.max(a.nReq + 3, Math.ceil(a.nRaw / a.derate) + 3, 8))
  const sizes: number[] = []
  for (let n = 1; n <= hi; n++) sizes.push(n)
  return sizes
}

/** "Nice" round number >= x, for axis maxima (1/2/2.5/5/10 * 10^k). */
export function niceMax(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(x)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x) return m * p
  return 10 * p
}

/** Smallest fleet that meets demand; falls back to best-throughput if none does. */
export function pickKnee(results: SweepPoint[]): number | null {
  const met = results.find((r) => r.met)
  if (met) return met.n
  if (results.length === 0) return null
  let best = results[0]
  for (const r of results) if (r.tph > best.tph) best = r
  return best.n
}

/** First fleet size where throughput drops vs. the previous size (over-fleeted congestion), or null. */
export function findRollover(results: SweepPoint[]): number | null {
  for (let i = 1; i < results.length; i++) {
    if (results[i].tph < results[i - 1].tph * 0.99) return results[i].n
  }
  return null
}

export interface SweepScales {
  width: number
  height: number
  padLeft: number
  padRight: number
  throughputTop: number
  throughputBottom: number
  blockedTop: number
  blockedBottom: number
  x: (n: number) => number
  yThroughput: (v: number) => number
  yBlocked: (v: number) => number
  throughputMax: number
  blockedMax: number
}

/** Layout + scale functions for the two-panel (throughput / blocked) sweep chart. */
export function buildSweepScales(results: SweepPoint[], demand: number): SweepScales {
  const width = 720
  const height = 330
  const padLeft = 46
  const padRight = 16
  const throughputTop = 26
  const throughputBottom = 178
  const blockedTop = 216
  const blockedBottom = 296

  const ns = results.map((r) => r.n)
  const nMin = ns[0] ?? 1
  const nMax = ns[ns.length - 1] ?? 1
  const x = (n: number) => padLeft + ((n - nMin) / Math.max(1, nMax - nMin)) * (width - padLeft - padRight)

  const throughputMax = niceMax(Math.max(demand, ...results.map((r) => r.tph), 1) * 1.15)
  const yThroughput = (v: number) => throughputBottom - (v / throughputMax) * (throughputBottom - throughputTop)

  const blockedMax = niceMax(Math.max(0.05, ...results.map((r) => r.blocked)) * 1.15)
  const yBlocked = (v: number) => blockedBottom - (v / blockedMax) * (blockedBottom - blockedTop)

  return {
    width,
    height,
    padLeft,
    padRight,
    throughputTop,
    throughputBottom,
    blockedTop,
    blockedBottom,
    x,
    yThroughput,
    yBlocked,
    throughputMax,
    blockedMax,
  }
}
