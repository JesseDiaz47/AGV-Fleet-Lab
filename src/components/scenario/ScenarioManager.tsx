import { useRef, useState } from 'react'
import type { UseScenarios } from '../../hooks/useScenarios.ts'

interface ScenarioManagerProps {
  scenarios: UseScenarios['scenarios']
  activeScenarioId: string
  compareIds: UseScenarios['compareIds']
  selectScenario: UseScenarios['selectScenario']
  createScenario: UseScenarios['createScenario']
  duplicateScenario: UseScenarios['duplicateScenario']
  deleteScenario: UseScenarios['deleteScenario']
  toggleCompare: UseScenarios['toggleCompare']
  exportJson: UseScenarios['exportJson']
  importJson: UseScenarios['importJson']
}

export function ScenarioManager({
  scenarios,
  activeScenarioId,
  compareIds,
  selectScenario,
  createScenario,
  duplicateScenario,
  deleteScenario,
  toggleCompare,
  exportJson,
  importJson,
}: ScenarioManagerProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function onRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = importJson(String(reader.result))
      setRestoreMsg(
        result.ok
          ? { ok: true, text: `Restored ${result.value.scenarios.length} scenario(s).` }
          : { ok: false, text: result.error },
      )
    }
    reader.onerror = () => setRestoreMsg({ ok: false, text: 'Could not read the file.' })
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <section className="card">
      <div className="card-title-row">
        <div className="card-title">Scenarios</div>
        <button type="button" className="btn btn-sm btn-primary" onClick={createScenario}>
          + New
        </button>
      </div>
      <ul className="scenario-list">
        {scenarios.map((sc) => (
          <li key={sc.id} className={`scenario-list__row${sc.id === activeScenarioId ? ' scenario-list__row--active' : ''}`}>
            <button type="button" className="scenario-list__select" onClick={() => selectScenario(sc.id)}>
              <span className="scenario-list__name">{sc.name}</span>
              <span className="scenario-list__meta">
                {sc.params.fleet} vehicles · {sc.params.demand}/hr · rev {sc.revision}
              </span>
            </button>
            <div className="scenario-list__actions">
              <label className="scenario-list__compare" title="Add to compare (up to 4)">
                <input
                  type="checkbox"
                  checked={compareIds.includes(sc.id)}
                  disabled={!compareIds.includes(sc.id) && compareIds.length >= 4}
                  onChange={() => toggleCompare(sc.id)}
                />
                Compare
              </label>
              <button type="button" className="btn btn-sm" onClick={() => duplicateScenario(sc.id)} title="Duplicate">
                Duplicate
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => deleteScenario(sc.id)}
                disabled={scenarios.length <= 1}
                title={scenarios.length <= 1 ? "Can't delete the only scenario" : 'Delete'}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="card-hint">Check up to 4 scenarios to compare side by side below.</p>
      <div className="scenario-manager__data">
        <button type="button" className="btn btn-sm" onClick={exportJson}>
          Export JSON backup
        </button>
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
          Restore from JSON…
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={onRestoreFile} />
      </div>
      {restoreMsg && (
        <p className={restoreMsg.ok ? 'card-hint' : 'form-error'} role="status">
          {restoreMsg.text}
        </p>
      )}
    </section>
  )
}
