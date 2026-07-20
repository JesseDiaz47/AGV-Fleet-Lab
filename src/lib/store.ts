/**
 * Wires the generic persistence/backup primitives to this app's domain:
 * one localStorage key, one validator, one backup signature. This is the
 * only place `sanitizeState` gets consumed — storage load and JSON restore
 * both funnel through it, so neither can inject data the other would reject.
 */
import { createPersistedStore } from './persistence.ts'
import { makeBackup, parseBackup, serializeBackup } from './backup.ts'
import { sanitizeState } from './sanitize.ts'
import { defaultState } from './defaults.ts'
import { APP_SIGNATURE, SCHEMA_VERSION, type AppState } from '../types/domain.ts'
import type { Validated } from './validate.ts'

const BACKUP_META = { app: APP_SIGNATURE, version: SCHEMA_VERSION }

export const store = createPersistedStore<AppState>({
  key: APP_SIGNATURE,
  version: SCHEMA_VERSION,
  validate: sanitizeState,
  makeDefault: defaultState,
})

export function exportBackup(state: AppState) {
  return makeBackup(BACKUP_META, state)
}

export function serializeStateBackup(state: AppState): string {
  return serializeBackup(BACKUP_META, state)
}

export function importBackup(json: string): Validated<AppState> {
  return parseBackup({ ...BACKUP_META, validate: sanitizeState }, json)
}
