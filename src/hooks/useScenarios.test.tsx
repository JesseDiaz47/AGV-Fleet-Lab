import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScenarios } from './useScenarios.ts'

describe('useScenarios — CRUD', () => {
  it('starts with exactly one scenario, active', () => {
    const { result } = renderHook(() => useScenarios())
    expect(result.current.scenarios.length).toBe(1)
    expect(result.current.activeScenario.id).toBe(result.current.scenarios[0].id)
  })

  it('createScenario adds a new scenario and makes it active', () => {
    const { result } = renderHook(() => useScenarios())
    act(() => result.current.createScenario())
    expect(result.current.scenarios.length).toBe(2)
    expect(result.current.activeScenario.id).toBe(result.current.scenarios[1].id)
  })

  it('duplicateScenario copies params under a new id, revision reset to 1', () => {
    const { result } = renderHook(() => useScenarios())
    const original = result.current.scenarios[0]
    act(() => result.current.updateParams({ demand: 77 }))
    act(() => result.current.duplicateScenario(result.current.scenarios[0].id))
    expect(result.current.scenarios.length).toBe(2)
    const copy = result.current.scenarios[1]
    expect(copy.id).not.toBe(original.id)
    expect(copy.params.demand).toBe(77)
    expect(copy.revision).toBe(1)
    expect(result.current.activeScenario.id).toBe(copy.id)
  })

  it('deleteScenario removes it and re-selects another when it was active', () => {
    const { result } = renderHook(() => useScenarios())
    act(() => result.current.createScenario())
    const [first, second] = result.current.scenarios
    expect(result.current.activeScenario.id).toBe(second.id)
    act(() => result.current.deleteScenario(second.id))
    expect(result.current.scenarios.length).toBe(1)
    expect(result.current.activeScenario.id).toBe(first.id)
  })

  it('refuses to delete the last remaining scenario', () => {
    const { result } = renderHook(() => useScenarios())
    const onlyId = result.current.scenarios[0].id
    act(() => result.current.deleteScenario(onlyId))
    expect(result.current.scenarios.length).toBe(1)
    expect(result.current.scenarios[0].id).toBe(onlyId)
  })

  it('selectScenario switches the active scenario', () => {
    const { result } = renderHook(() => useScenarios())
    act(() => result.current.createScenario())
    const [first, second] = result.current.scenarios
    expect(result.current.activeScenario.id).toBe(second.id)
    act(() => result.current.selectScenario(first.id))
    expect(result.current.activeScenario.id).toBe(first.id)
  })

  it('renameScenario bumps revision and updatedAt', () => {
    const { result } = renderHook(() => useScenarios())
    const before = result.current.scenarios[0]
    act(() => result.current.renameScenario(before.id, 'My scenario'))
    const after = result.current.scenarios[0]
    expect(after.name).toBe('My scenario')
    expect(after.revision).toBe(before.revision + 1)
  })

  it('exportJson then importJson round-trips scenarios', () => {
    const { result } = renderHook(() => useScenarios())
    act(() => result.current.updateParams({ demand: 123 }))
    act(() => result.current.createScenario())
    const stateBefore = result.current.state

    // Simulate what exportJson/downloadJson would serialize, without touching the DOM.
    const backup = JSON.stringify({
      app: 'agv-fleet-lab',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      state: stateBefore,
    })

    act(() => result.current.createScenario()) // mutate state further before restoring
    expect(result.current.scenarios.length).toBe(3)

    let restoreResult: ReturnType<typeof result.current.importJson> | undefined
    act(() => {
      restoreResult = result.current.importJson(backup)
    })
    expect(restoreResult?.ok).toBe(true)
    expect(result.current.scenarios.length).toBe(2)
    expect(result.current.scenarios.some((s) => s.params.demand === 123)).toBe(true)
  })

  it('importJson rejects a tampered/invalid backup without changing state', () => {
    const { result } = renderHook(() => useScenarios())
    const before = result.current.scenarios.length
    let restoreResult: ReturnType<typeof result.current.importJson> | undefined
    act(() => {
      restoreResult = result.current.importJson('not json at all')
    })
    expect(restoreResult?.ok).toBe(false)
    expect(result.current.scenarios.length).toBe(before)
  })
})
