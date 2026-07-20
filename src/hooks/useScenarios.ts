/**
 * Single source of truth for persisted app state: the scenario list, which
 * one is active, and (later) the compare selection. Wraps `lib/store.ts`;
 * every change is saved on the next effect tick.
 *
 * Full scenario-manager actions (create/duplicate/rename/delete, compare
 * selection) land in a later step — this hook currently exposes just what
 * the single-scenario workflow needs: read the active scenario, edit its
 * params. Editing always bumps `revision`/`updatedAt` rather than silently
 * overwriting history-free.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { store } from '../lib/store.ts'
import type { AppState, Scenario, ScenarioParams } from '../types/domain.ts'

export interface UseScenarios {
  state: AppState
  activeScenario: Scenario
  updateParams: (patch: Partial<ScenarioParams>) => void
  renameActive: (name: string) => void
}

export function useScenarios(): UseScenarios {
  const [state, setState] = useState<AppState>(() => store.load())

  useEffect(() => {
    store.save(state)
  }, [state])

  const activeScenario = useMemo(() => {
    return state.scenarios.find((s) => s.id === state.activeScenarioId) ?? state.scenarios[0]
  }, [state.scenarios, state.activeScenarioId])

  const updateParams = useCallback((patch: Partial<ScenarioParams>) => {
    setState((s) => {
      const now = new Date().toISOString()
      return {
        ...s,
        scenarios: s.scenarios.map((sc) =>
          sc.id === s.activeScenarioId
            ? { ...sc, params: { ...sc.params, ...patch }, updatedAt: now, revision: sc.revision + 1 }
            : sc,
        ),
      }
    })
  }, [])

  const renameActive = useCallback((name: string) => {
    if (!name.trim()) return
    setState((s) => {
      const now = new Date().toISOString()
      return {
        ...s,
        scenarios: s.scenarios.map((sc) =>
          sc.id === s.activeScenarioId ? { ...sc, name, updatedAt: now, revision: sc.revision + 1 } : sc,
        ),
      }
    })
  }, [])

  return { state, activeScenario, updateParams, renameActive }
}
