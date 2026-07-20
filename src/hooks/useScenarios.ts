/**
 * Single source of truth for persisted app state: the scenario list, which
 * one is active, and the compare selection. Wraps `lib/store.ts`; every
 * change is saved on the next effect tick.
 *
 * Every edit bumps `revision`/`updatedAt` — nothing here silently overwrites
 * history-free. Deleting the active scenario always leaves another one
 * active; the last remaining scenario can't be deleted (there's always
 * something to show).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { store, exportBackup as buildBackupEnvelope, importBackup } from '../lib/store.ts'
import { downloadJson, timestampSlug } from '../lib/download.ts'
import { makeScenario } from '../lib/defaults.ts'
import { createId } from '../lib/id.ts'
import type { AppState, Scenario, ScenarioParams } from '../types/domain.ts'
import type { Validated } from '../lib/validate.ts'

export interface UseScenarios {
  state: AppState
  activeScenario: Scenario
  scenarios: Scenario[]
  updateParams: (patch: Partial<ScenarioParams>) => void
  renameActive: (name: string) => void
  renameScenario: (id: string, name: string) => void
  selectScenario: (id: string) => void
  createScenario: () => void
  duplicateScenario: (id: string) => void
  deleteScenario: (id: string) => void
  exportJson: () => void
  importJson: (json: string) => Validated<AppState>
}

const now = () => new Date().toISOString()

export function useScenarios(): UseScenarios {
  const [state, setState] = useState<AppState>(() => store.load())

  useEffect(() => {
    store.save(state)
  }, [state])

  const activeScenario = useMemo(() => {
    return state.scenarios.find((s) => s.id === state.activeScenarioId) ?? state.scenarios[0]
  }, [state.scenarios, state.activeScenarioId])

  const updateParams = useCallback((patch: Partial<ScenarioParams>) => {
    setState((s) => ({
      ...s,
      scenarios: s.scenarios.map((sc) =>
        sc.id === s.activeScenarioId
          ? { ...sc, params: { ...sc.params, ...patch }, updatedAt: now(), revision: sc.revision + 1 }
          : sc,
      ),
    }))
  }, [])

  const renameScenario = useCallback((id: string, name: string) => {
    if (!name.trim()) return
    setState((s) => ({
      ...s,
      scenarios: s.scenarios.map((sc) => (sc.id === id ? { ...sc, name, updatedAt: now(), revision: sc.revision + 1 } : sc)),
    }))
  }, [])

  const renameActive = useCallback(
    (name: string) => renameScenario(activeScenario.id, name),
    [renameScenario, activeScenario.id],
  )

  const selectScenario = useCallback((id: string) => {
    setState((s) => (s.scenarios.some((sc) => sc.id === id) ? { ...s, activeScenarioId: id } : s))
  }, [])

  const createScenario = useCallback(() => {
    setState((s) => {
      const scenario = makeScenario(`Scenario ${s.scenarios.length + 1}`)
      return { ...s, scenarios: [...s.scenarios, scenario], activeScenarioId: scenario.id }
    })
  }, [])

  const duplicateScenario = useCallback((id: string) => {
    setState((s) => {
      const source = s.scenarios.find((sc) => sc.id === id)
      if (!source) return s
      const copy: Scenario = {
        ...source,
        id: createId('scenario'),
        name: `${source.name} copy`,
        createdAt: now(),
        updatedAt: now(),
        revision: 1,
      }
      return { ...s, scenarios: [...s.scenarios, copy], activeScenarioId: copy.id }
    })
  }, [])

  const deleteScenario = useCallback((id: string) => {
    setState((s) => {
      if (s.scenarios.length <= 1) return s // always keep at least one
      const scenarios = s.scenarios.filter((sc) => sc.id !== id)
      const activeScenarioId = s.activeScenarioId === id ? scenarios[0].id : s.activeScenarioId
      const compareIds = s.compareIds.filter((cid) => cid !== id)
      return { ...s, scenarios, activeScenarioId, compareIds }
    })
  }, [])

  const exportJson = useCallback(() => {
    downloadJson(`agv-fleet-lab-${timestampSlug()}.json`, buildBackupEnvelope(state))
  }, [state])

  const importJson = useCallback((json: string) => {
    const result = importBackup(json)
    if (result.ok) setState(result.value)
    return result
  }, [])

  return {
    state,
    activeScenario,
    scenarios: state.scenarios,
    updateParams,
    renameActive,
    renameScenario,
    selectScenario,
    createScenario,
    duplicateScenario,
    deleteScenario,
    exportJson,
    importJson,
  }
}
