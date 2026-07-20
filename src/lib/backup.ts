/**
 * Portable, versioned JSON backup / restore.
 * Source: generalized from vfd-command-center's importExport.ts.
 *
 * A backup is an envelope: { app, schemaVersion, exportedAt, state }. Restore
 * checks the app signature and version BEFORE trusting the payload, then runs
 * it through the same validator you use for localStorage load (persistence.ts)
 * — so an import file can never inject data the app wouldn't accept itself.
 *
 * Usage:
 *   const backup = makeBackup({ app: 'my-app', version: 3 }, state)
 *   downloadJson(`my-app-${timestampSlug()}.json`, backup)
 *   const result = parseBackup({ app: 'my-app', version: 3, validate: sanitizeState }, fileText)
 *   if (result.ok) load(result.value)
 */
import type { Validated } from './validate'

export interface BackupEnvelope<T> {
  app: string
  schemaVersion: number
  exportedAt: string
  state: T
}

export function makeBackup<T>(
  meta: { app: string; version: number },
  state: T,
): BackupEnvelope<T> {
  return {
    app: meta.app,
    schemaVersion: meta.version,
    exportedAt: new Date().toISOString(),
    state,
  }
}

export function serializeBackup<T>(meta: { app: string; version: number }, state: T): string {
  return JSON.stringify(makeBackup(meta, state), null, 2)
}

export interface RestoreConfig<T> {
  app: string
  version: number
  validate: (raw: unknown) => Validated<T>
}

/** Parse + validate a backup JSON string into trusted state, with clear errors. */
export function parseBackup<T>(config: RestoreConfig<T>, json: string): Validated<T> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Backup is not an object.' }
  }
  const env = parsed as Record<string, unknown>
  if (env.app !== config.app) {
    return { ok: false, error: `This file is not a ${config.app} backup.` }
  }
  if (env.schemaVersion !== config.version) {
    return {
      ok: false,
      error: `Unsupported backup version (${String(env.schemaVersion)}). Expected ${config.version}.`,
    }
  }
  if (typeof env.state !== 'object' || env.state === null) {
    return { ok: false, error: 'Backup is missing its state.' }
  }
  return config.validate(env.state)
}
