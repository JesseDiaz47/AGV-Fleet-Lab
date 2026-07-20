import { describe, expect, it } from 'vitest'
import { store, exportBackup, importBackup, serializeStateBackup } from './store.ts'
import { defaultState } from './defaults.ts'
import { makeScenario } from './defaults.ts'
import { APP_SIGNATURE, SCHEMA_VERSION } from '../types/domain.ts'

describe('store — localStorage persistence', () => {
  it('loads a fresh default state when nothing is stored', () => {
    const state = store.load()
    expect(state.scenarios).toHaveLength(1)
  })

  it('round-trips a saved state', () => {
    const scenario = makeScenario('Round trip')
    const state = { scenarios: [scenario], activeScenarioId: scenario.id, compareIds: [] }
    store.save(state)
    const loaded = store.load()
    expect(loaded.scenarios[0].name).toBe('Round trip')
  })

  it('falls back to default on corrupt JSON in storage', () => {
    window.localStorage.setItem(APP_SIGNATURE, '{not valid json')
    const loaded = store.load()
    expect(loaded.scenarios).toHaveLength(1)
  })

  it('falls back to default on a wrong schema version', () => {
    window.localStorage.setItem(APP_SIGNATURE, JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, scenarios: [] }))
    const loaded = store.load()
    expect(loaded.scenarios).toHaveLength(1)
  })
})

describe('backup export/import', () => {
  it('exports and re-imports the same state', () => {
    const state = defaultState()
    const json = serializeStateBackup(state)
    const result = importBackup(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.scenarios[0].id).toBe(state.scenarios[0].id)
  })

  it('rejects a file that is not valid JSON', () => {
    const result = importBackup('not json')
    expect(result.ok).toBe(false)
  })

  it('rejects a backup from a different app', () => {
    const state = defaultState()
    const backup = { ...exportBackup(state), app: 'some-other-app' }
    const result = importBackup(JSON.stringify(backup))
    expect(result.ok).toBe(false)
  })

  it('rejects a backup with a mismatched schema version', () => {
    const state = defaultState()
    const backup = { ...exportBackup(state), schemaVersion: SCHEMA_VERSION + 1 }
    const result = importBackup(JSON.stringify(backup))
    expect(result.ok).toBe(false)
  })

  it('repairs a tampered payload rather than importing it verbatim', () => {
    const state = defaultState()
    const backup = exportBackup(state)
    // tamper: push a scenario with an out-of-range param
    backup.state.scenarios.push({
      ...makeScenario('Tampered'),
      params: { ...makeScenario('x').params, demand: 999999 },
    })
    const result = importBackup(JSON.stringify(backup))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const tampered = result.value.scenarios.find((s) => s.name === 'Tampered')
    expect(tampered?.params.demand).toBe(40) // clamped back to default, not 999999
  })
})
