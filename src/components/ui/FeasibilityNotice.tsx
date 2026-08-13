import { fleetFeasibility } from '../../lib/engine/feasibility.ts'
import type { ScenarioParams } from '../../types/domain.ts'

interface FeasibilityNoticeProps {
  params: ScenarioParams
}

/**
 * Explains why a scenario cannot be simulated: the fleet does not physically
 * fit on the guide path. Renders nothing when the geometry is fine.
 *
 * Shown next to every run affordance rather than only in the scenario form,
 * because that is where the reader is about to expect a number.
 */
export function FeasibilityNotice({ params }: FeasibilityNoticeProps) {
  const fit = fleetFeasibility(params)
  if (fit.feasible) return null
  return (
    <p className="feasibility-notice" role="status">
      <strong>This fleet does not fit the loop.</strong> {fit.reason} Vehicles are modelled as points, so the
      minimum gap is the whole of the clearance each one claims — real vehicle length is outside this model.
    </p>
  )
}
