/**
 * Presentation helpers. Golden rule: never fabricate data — a missing value
 * renders as an em-dash, never as a fake 0.
 * Source: vfd-command-center (generalized: dropped the lb/amps-specific ones,
 * added a `unit()` factory so any project can mint its own).
 */

export const DASH = '—'

type Num = number | null | undefined

function isReal(v: Num): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

/** Locale-grouped number: fmtNum(12345) -> "12,345"; fmtNum(3.14159, 2) -> "3.14" */
export function fmtNum(value: Num, digits = 0): string {
  if (!isReal(value)) return DASH
  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

/** fmtPercent(87.5) -> "87.5%" */
export function fmtPercent(value: Num, digits = 1): string {
  if (!isReal(value)) return DASH
  return `${fmtNum(value, digits)}%`
}

/** Minutes -> "1h 05m" / "45m" */
export function fmtDuration(minutes: Num): string {
  if (!isReal(minutes)) return DASH
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`
}

/**
 * Mint a unit formatter. This is how vfd-command-center's fmtWeight/fmtRate/
 * fmtAmps were built — keep the domain units in your app, not in the arsenal.
 *   const fmtWeight = unit('lb')            // 1200 -> "1,200 lb"
 *   const fmtRate   = unit('lb/hr')
 *   const fmtAmps   = unit('A', 1)          // 12.3 -> "12.3 A"
 */
export function unit(suffix: string, digits = 0) {
  return (value: Num): string => (isReal(value) ? `${fmtNum(value, digits)} ${suffix}` : DASH)
}
