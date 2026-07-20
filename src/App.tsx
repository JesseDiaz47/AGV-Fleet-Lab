import { useMemo } from 'react'
import { useScenarios } from './hooks/useScenarios.ts'
import { ScenarioManager } from './components/scenario/ScenarioManager.tsx'
import { ScenarioForm } from './components/inputs/ScenarioForm.tsx'
import { SimView } from './components/simview/SimView.tsx'
import { AnalyticCard } from './components/results/AnalyticCard.tsx'
import { ValidateCard } from './components/results/ValidateCard.tsx'
import { SweepSection } from './components/results/SweepSection.tsx'
import { CompareView } from './components/compare/CompareView.tsx'
import { analyze } from './lib/engine/analytic.ts'
import { toAnalyticParams } from './lib/simParams.ts'

function App() {
  const {
    activeScenario,
    scenarios,
    compareIds,
    updateParams,
    renameActive,
    selectScenario,
    createScenario,
    duplicateScenario,
    deleteScenario,
    toggleCompare,
    exportJson,
    importJson,
  } = useScenarios()
  const analytic = useMemo(() => analyze(toAnalyticParams(activeScenario.params)), [activeScenario.params])

  return (
    <div className="wrap">
      <header>
        <p className="kicker">AGV Fleet Lab v2</p>
        <h1>AGV Fleet Lab</h1>
        <p className="tagline">
          Size the fleet analytically. Then watch a simulated fleet run the
          loop — and see whether the math survives congestion.
        </p>
      </header>
      <main className="main-grid">
        <div className="main-grid__col">
          <ScenarioManager
            scenarios={scenarios}
            activeScenarioId={activeScenario.id}
            compareIds={compareIds}
            selectScenario={selectScenario}
            createScenario={createScenario}
            duplicateScenario={duplicateScenario}
            deleteScenario={deleteScenario}
            toggleCompare={toggleCompare}
            exportJson={exportJson}
            importJson={importJson}
          />
          <ScenarioForm scenario={activeScenario} updateParams={updateParams} renameActive={renameActive} />
        </div>
        <div className="main-grid__col">
          <SimView scenario={activeScenario} />
          <div className="card-row">
            <AnalyticCard params={activeScenario.params} />
            <ValidateCard params={activeScenario.params} scenarioId={activeScenario.id} />
          </div>
          <SweepSection params={activeScenario.params} scenarioId={activeScenario.id} analyticNReq={analytic.nReq} />
          <CompareView scenarios={scenarios} compareIds={compareIds} />
        </div>
      </main>
    </div>
  )
}

export default App
