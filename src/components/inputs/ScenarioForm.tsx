import { useState } from 'react'
import { NumberField } from '../ui/NumberField.tsx'
import { BoolField } from '../ui/BoolField.tsx'
import { sanitizeScenarioParams } from '../../lib/sanitize.ts'
import { DISPATCH_RULES, DISPATCH_RULE_LABEL, PARAM_LIMITS, type Scenario, type ScenarioParams, type ShiftBlock } from '../../types/domain.ts'

interface ScenarioFormProps {
  scenario: Scenario
  updateParams: (patch: Partial<ScenarioParams>) => void
  renameActive: (name: string) => void
}

const [DEMAND_MIN, DEMAND_MAX] = PARAM_LIMITS.demand
const [LOOP_MIN, LOOP_MAX] = PARAM_LIMITS.loopLen
const [STATIONS_MIN, STATIONS_MAX] = PARAM_LIMITS.stations
const [SPEED_MIN, SPEED_MAX] = PARAM_LIMITS.speed
const [GAP_MIN, GAP_MAX] = PARAM_LIMITS.minGap
const [LOAD_MIN, LOAD_MAX] = PARAM_LIMITS.loadS
const [UNLOAD_MIN, UNLOAD_MAX] = PARAM_LIMITS.unloadS
const [SPREAD_MIN, SPREAD_MAX] = PARAM_LIMITS.spreadPct
const [RUNTIME_MIN, RUNTIME_MAX] = PARAM_LIMITS.runtimeH
const [CHARGEH_MIN, CHARGEH_MAX] = PARAM_LIMITS.chargeH
const [THRESH_MIN, THRESH_MAX] = PARAM_LIMITS.thresholdPct
const [TARGET_MIN, TARGET_MAX] = PARAM_LIMITS.targetPct
const [BAYS_MIN, BAYS_MAX] = PARAM_LIMITS.chargeBays
const [AVAIL_MIN, AVAIL_MAX] = PARAM_LIMITS.availabilityPct
const [MAXUTIL_MIN, MAXUTIL_MAX] = PARAM_LIMITS.maxUtilPct
const [FLEET_MIN, FLEET_MAX] = PARAM_LIMITS.fleet
const [SEED_MIN, SEED_MAX] = PARAM_LIMITS.seed

export function ScenarioForm({ scenario, updateParams, renameActive }: ScenarioFormProps) {
  const p = scenario.params
  const weighted = p.originWeights !== null || p.destWeights !== null

  return (
    <section className="card scenario-form">
      <div className="card-title">Scenario</div>
      <label className="field">
        <span className="field__label">Name</span>
        <input
          type="text"
          className="field__input"
          value={scenario.name}
          onChange={(e) => renameActive(e.target.value)}
        />
      </label>

      <h3 className="field-group__title">Demand</h3>
      <div className="field-grid">
        <NumberField label="Demand" suffix="jobs/hr" value={p.demand} min={DEMAND_MIN} max={DEMAND_MAX} onChange={(v) => updateParams({ demand: v })} />
        <label className="field">
          <span className="field__label">Dispatch rule</span>
          <select
            className="field__input"
            value={p.dispatchRule}
            onChange={(e) => updateParams({ dispatchRule: e.target.value as ScenarioParams['dispatchRule'] })}
          >
            {DISPATCH_RULES.map((r) => (
              <option key={r} value={r}>
                {DISPATCH_RULE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <BoolField
        label="Weighted (non-uniform) station demand"
        checked={weighted}
        onChange={(on) =>
          updateParams({
            originWeights: on ? Array(p.stations).fill(1) : null,
            destWeights: on ? Array(p.stations).fill(1) : null,
          })
        }
      />
      {weighted && (
        <WeightsEditor
          stations={p.stations}
          originWeights={p.originWeights ?? Array(p.stations).fill(1)}
          destWeights={p.destWeights ?? Array(p.stations).fill(1)}
          onChange={(originWeights, destWeights) => updateParams({ originWeights, destWeights })}
        />
      )}

      <h3 className="field-group__title">Guide path</h3>
      <div className="field-grid">
        <NumberField label="Loop length" suffix="m" value={p.loopLen} min={LOOP_MIN} max={LOOP_MAX} onChange={(v) => updateParams({ loopLen: v })} />
        <NumberField
          label="Stations"
          value={p.stations}
          min={STATIONS_MIN}
          max={STATIONS_MAX}
          onChange={(v) => updateParams({ stations: v, originWeights: null, destWeights: null })}
        />
        <NumberField label="Speed" suffix="m/s" step={0.1} value={p.speed} min={SPEED_MIN} max={SPEED_MAX} onChange={(v) => updateParams({ speed: v })} />
        <NumberField label="Min gap" suffix="m" value={p.minGap} min={GAP_MIN} max={GAP_MAX} onChange={(v) => updateParams({ minGap: v })} />
        <BoolField label="Park idle vehicles at charge bay" checked={p.parkIdle} onChange={(v) => updateParams({ parkIdle: v })} />
      </div>

      <h3 className="field-group__title">Handling</h3>
      <div className="field-grid">
        <NumberField label="Load time" suffix="s" value={p.loadS} min={LOAD_MIN} max={LOAD_MAX} onChange={(v) => updateParams({ loadS: v })} />
        <NumberField label="Unload time" suffix="s" value={p.unloadS} min={UNLOAD_MIN} max={UNLOAD_MAX} onChange={(v) => updateParams({ unloadS: v })} />
        <NumberField label="Time spread" suffix="%" value={p.spreadPct} min={SPREAD_MIN} max={SPREAD_MAX} onChange={(v) => updateParams({ spreadPct: v })} />
      </div>

      <h3 className="field-group__title">Battery</h3>
      <BoolField label="Battery-constrained fleet" checked={p.battery} onChange={(v) => updateParams({ battery: v })} />
      {p.battery && (
        <div className="field-grid">
          <NumberField label="Runtime" suffix="h" step={0.1} value={p.runtimeH} min={RUNTIME_MIN} max={RUNTIME_MAX} onChange={(v) => updateParams({ runtimeH: v })} />
          <NumberField label="Charge time" suffix="h" step={0.1} value={p.chargeH} min={CHARGEH_MIN} max={CHARGEH_MAX} onChange={(v) => updateParams({ chargeH: v })} />
          <NumberField label="Charge threshold" suffix="%" value={p.thresholdPct} min={THRESH_MIN} max={THRESH_MAX} onChange={(v) => updateParams({ thresholdPct: v })} />
          <NumberField label="Charge target" suffix="%" value={p.targetPct} min={TARGET_MIN} max={TARGET_MAX} onChange={(v) => updateParams({ targetPct: v })} />
          <NumberField label="Charge bays" value={p.chargeBays} min={BAYS_MIN} max={BAYS_MAX} onChange={(v) => updateParams({ chargeBays: v })} />
        </div>
      )}

      <h3 className="field-group__title">Shift / time-of-day profile</h3>
      <BoolField
        label="Demand varies over a 24h cycle"
        checked={p.shiftProfile !== null}
        onChange={(on) => updateParams({ shiftProfile: on ? [{ startHour: 0, multiplier: 1 }] : null })}
      />
      {p.shiftProfile !== null && (
        <ShiftProfileEditor blocks={p.shiftProfile} onChange={(blocks) => updateParams({ shiftProfile: blocks })} />
      )}

      <h3 className="field-group__title">Planning factors (analytic)</h3>
      <div className="field-grid">
        <NumberField label="Availability" suffix="%" value={p.availabilityPct} min={AVAIL_MIN} max={AVAIL_MAX} onChange={(v) => updateParams({ availabilityPct: v })} />
        <NumberField label="Max utilization" suffix="%" value={p.maxUtilPct} min={MAXUTIL_MIN} max={MAXUTIL_MAX} onChange={(v) => updateParams({ maxUtilPct: v })} />
      </div>

      <h3 className="field-group__title">Fleet &amp; reproducibility</h3>
      <div className="field-grid">
        <NumberField label="Fleet size" value={p.fleet} min={FLEET_MIN} max={FLEET_MAX} onChange={(v) => updateParams({ fleet: v })} />
        <NumberField label="Seed" value={p.seed} min={SEED_MIN} max={SEED_MAX} onChange={(v) => updateParams({ seed: Math.round(v) })} />
      </div>
    </section>
  )
}

interface WeightsEditorProps {
  stations: number
  originWeights: number[]
  destWeights: number[]
  onChange: (originWeights: number[], destWeights: number[]) => void
}

function WeightsEditor({ stations, originWeights, destWeights, onChange }: WeightsEditorProps) {
  return (
    <div className="weights-editor">
      <div className="weights-editor__row">
        <span className="weights-editor__label">Origin weight</span>
        {Array.from({ length: stations }, (_, i) => (
          <input
            key={i}
            type="number"
            className="field__input field__input--sm"
            min={0}
            step={0.1}
            value={originWeights[i] ?? 1}
            onChange={(e) => {
              const n = e.target.valueAsNumber
              if (!Number.isFinite(n) || n < 0) return
              const next = originWeights.slice()
              next[i] = n
              onChange(next, destWeights)
            }}
          />
        ))}
      </div>
      <div className="weights-editor__row">
        <span className="weights-editor__label">Dest. weight</span>
        {Array.from({ length: stations }, (_, i) => (
          <input
            key={i}
            type="number"
            className="field__input field__input--sm"
            min={0}
            step={0.1}
            value={destWeights[i] ?? 1}
            onChange={(e) => {
              const n = e.target.valueAsNumber
              if (!Number.isFinite(n) || n < 0) return
              const next = destWeights.slice()
              next[i] = n
              onChange(originWeights, next)
            }}
          />
        ))}
      </div>
    </div>
  )
}

interface ShiftProfileEditorProps {
  blocks: ShiftBlock[]
  onChange: (blocks: ShiftBlock[]) => void
}

/** Edits a shift profile as a draft, only committing when the result re-validates via the app's own sanitizer. */
function ShiftProfileEditor({ blocks, onChange }: ShiftProfileEditorProps) {
  const [draft, setDraft] = useState(blocks)

  const commitIfValid = (next: ShiftBlock[]) => {
    setDraft(next)
    const sanitized = sanitizeScenarioParams({ stations: 2, shiftProfile: next }).shiftProfile
    if (sanitized) onChange(sanitized)
  }

  return (
    <div className="shift-editor">
      {draft.map((b, i) => (
        <div key={i} className="shift-editor__row">
          <label className="field field--inline">
            <span className="field__label">Start hour</span>
            <input
              type="number"
              className="field__input field__input--sm"
              min={0}
              max={23.9}
              step={0.5}
              value={b.startHour}
              disabled={i === 0}
              onChange={(e) => {
                const n = e.target.valueAsNumber
                if (!Number.isFinite(n)) return
                const next = draft.slice()
                next[i] = { ...b, startHour: n }
                commitIfValid(next)
              }}
            />
          </label>
          <label className="field field--inline">
            <span className="field__label">Multiplier</span>
            <input
              type="number"
              className="field__input field__input--sm"
              min={0}
              step={0.1}
              value={b.multiplier}
              onChange={(e) => {
                const n = e.target.valueAsNumber
                if (!Number.isFinite(n) || n < 0) return
                const next = draft.slice()
                next[i] = { ...b, multiplier: n }
                commitIfValid(next)
              }}
            />
          </label>
          {draft.length > 1 && (
            <button type="button" className="btn btn-sm" onClick={() => commitIfValid(draft.filter((_, j) => j !== i))}>
              Remove
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => commitIfValid([...draft, { startHour: Math.min(23.5, (draft[draft.length - 1]?.startHour ?? 0) + 1), multiplier: 1 }])}
      >
        Add block
      </button>
    </div>
  )
}
