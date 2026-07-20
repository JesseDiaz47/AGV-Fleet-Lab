/**
 * Reasonably-unique ids without pulling in a uuid dependency.
 * Source: vfd-command-center. Generic as-is.
 *
 * Good enough for client-side records (localStorage rows, list keys). Not a
 * cryptographic identifier — if you need collision-proof ids across machines,
 * use crypto.randomUUID().
 */

/** e.g. createId('run') -> "run-lx9k2p-8f3a1c" */
export function createId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${rand}`
}
