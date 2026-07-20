/**
 * Versioned localStorage store with a hard validation gate.
 * Source: generalized from vfd-command-center's storage.ts.
 *
 * All app data lives under ONE key as a versioned envelope. On load, anything
 * corrupt, wrong-version, or that fails your validator falls back to a clean
 * default state instead of crashing or silently loading garbage. The exact
 * same validator you pass here should also guard JSON restore (see backup.ts),
 * so tampered storage and tampered import files can't inject invalid data.
 *
 * Usage:
 *   const store = createPersistedStore<AppState>({
 *     key: 'my-app',
 *     version: 3,
 *     validate: sanitizeState,      // (raw) => Validated<AppState>
 *     makeDefault: defaultState,
 *   })
 *   const state = store.load()
 *   store.save(state)
 */
import type { Validated } from './validate'

export interface PersistedStore<T> {
  readonly key: string
  load(): T
  save(state: T): void
  clear(): void
}

export interface StoreConfig<T> {
  /** localStorage key. Unique per app. */
  key: string
  /** Bump when the persisted shape changes; old versions load as default. */
  version: number
  /** Strong validation/repair. Same fn used for JSON restore. */
  validate: (raw: unknown) => Validated<T>
  /** Fresh, valid state when nothing is stored or load fails. */
  makeDefault: () => T
}

type Envelope = { schemaVersion?: unknown } & Record<string, unknown>

export function createPersistedStore<T>(config: StoreConfig<T>): PersistedStore<T> {
  const { key, version, validate, makeDefault } = config

  function load(): T {
    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      return makeDefault() // storage unavailable (private mode, etc.)
    }
    if (!raw) return makeDefault()
    try {
      const parsed = JSON.parse(raw) as Envelope
      if (parsed?.schemaVersion !== version) return makeDefault()
      const result = validate(parsed)
      return result.ok ? result.value : makeDefault()
    } catch {
      return makeDefault()
    }
  }

  function save(state: T): void {
    try {
      const envelope = { ...(state as object), schemaVersion: version }
      window.localStorage.setItem(key, JSON.stringify(envelope))
    } catch {
      /* quota exceeded or storage unavailable — best-effort only */
    }
  }

  function clear(): void {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }

  return { key, load, save, clear }
}
