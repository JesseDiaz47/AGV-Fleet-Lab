/**
 * Untrusted-input validation primitives. Source: vfd-command-center's
 * sanitize.ts (extracted the generic helpers; the domain sanitizer stays in
 * the app). Use these to build a `Validator<T>` for persistence.ts / backup.ts.
 *
 * Philosophy: coerce/repair where safe, reject where not, and keep blanks as
 * null — never turn a missing value into a fabricated 0.
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string }
export type Validator<T> = (raw: unknown) => Validated<T>

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * Optional non-negative numeric field in a bounded range.
 * Returns null for blank, 'invalid' for present-but-bad, or the number.
 * (The 'invalid' sentinel lets the caller decide: reject the record, or repair.)
 */
export function optionalNumber(
  v: unknown,
  max: number,
  min = 0,
): number | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null
  if (!isFiniteNumber(v)) return 'invalid'
  if (v < min || v > max) return 'invalid'
  return v
}

/** A string, or the fallback when absent/empty/non-string. */
export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v ? v : fallback
}

/** One of an allowed set, else the fallback. */
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

/** Give every item a unique id without dropping records (stable de-dupe). */
export function uniqueIds<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.map((item, i) => {
    if (item.id && !seen.has(item.id)) {
      seen.add(item.id)
      return item
    }
    const base = item.id || 'item'
    let suffix = i + 1
    let id = `${base}-${suffix}`
    while (seen.has(id)) id = `${base}-${++suffix}`
    seen.add(id)
    return { ...item, id }
  })
}
