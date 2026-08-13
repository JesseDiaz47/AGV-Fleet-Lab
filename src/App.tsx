import { useEffect, useMemo } from 'react'
import { useScenarios } from './hooks/useScenarios.ts'
import { useValidate } from './hooks/useValidate.ts'
import { useSweep } from './hooks/useSweep.ts'
import { ScenarioManager } from './components/scenario/ScenarioManager.tsx'
import { ScenarioForm } from './components/inputs/ScenarioForm.tsx'
import { SimView } from './components/simview/SimView.tsx'
import { AnalyticCard } from './components/results/AnalyticCard.tsx'
import { ValidateCard } from './components/results/ValidateCard.tsx'
import { SweepSection } from './components/results/SweepSection.tsx'
import { CompareView } from './components/compare/CompareView.tsx'
import { ExportPanel } from './components/export/ExportPanel.tsx'
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

  const validate = useValidate()
  const sweep = useSweep()

  // Any change to WHAT IS BEING MODELLED invalidates the last validation/sweep
  // results — lifted here (rather than inside each card) so the combined PDF
  // export can see both at once.
  //
  // Both deps are load-bearing:
  //   - `params` catches every field edit. `analytic` above recomputes from
  //     the same object, so keying off anything narrower (an id, a feasibility
  //     flag) leaves stale sim KPIs sitting beside a freshly recomputed
  //     estimate — the cards disagree, the verdict compares this scenario's
  //     analytic against the previous one's sweep, and the PDF exports the
  //     contradiction as if it were one coherent run.
  //   - `id` catches switching to a scenario that SHARES this params object:
  //     duplicateScenario spreads the source record, so a duplicate and its
  //     original hold the same reference until one of them is edited.
  // Feasibility needs no dep of its own: it is derived from params, so every
  // crossing of that boundary is already a params change.
  useEffect(() => {
    validate.reset()
    sweep.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScenario.id, activeScenario.params])

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
            <ValidateCard
              params={activeScenario.params}
              status={validate.status}
              result={validate.result}
              onRun={() => validate.run(activeScenario.params)}
            />
          </div>
          <SweepSection
            params={activeScenario.params}
            scenarioName={activeScenario.name}
            analyticNReq={analytic.nReq}
            status={sweep.status}
            results={sweep.results}
            progress={sweep.progress}
            onRun={() => sweep.run(activeScenario.params)}
          />
          <ExportPanel
            scenario={activeScenario}
            analytic={analytic}
            validateResult={validate.result}
            sweepResults={sweep.results}
          />
          <CompareView scenarios={scenarios} compareIds={compareIds} />
        </div>
      </main>
    </div>
  )
}

export default App
