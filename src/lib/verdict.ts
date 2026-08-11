/**
 * Plain-English synthesis of the analytic estimate against the simulated
 * sweep. Pure/framework-free so both the on-screen Verdict card and the PDF
 * export produce identical text from one source.
 */
import { findRollover, smallestMeetingFleet, type SweepPoint } from './engine/sweep.ts'

export function buildVerdictLines(analyticNReq: number, chosenFleet: number, results: SweepPoint[]): string[] {
  if (results.length === 0) return []

  // Deliberately NOT pickKnee: its best-throughput fallback is for
  // highlighting a chart row, and reading it as a knee produced a verdict that
  // contradicted itself ("no fleet size met demand … consider raising it to at
  // least 1"). `knee` here is null exactly when nothing met demand.
  const knee = smallestMeetingFleet(results)
  const rollover = findRollover(results)
  const chosenPoint = results.find((r) => r.n === chosenFleet)
  const lines: string[] = []

  if (knee !== null) {
    if (knee === analyticNReq) {
      lines.push(`The simulation confirms the analytic estimate: ${knee} vehicles is the smallest fleet that meets demand.`)
    } else if (knee > analyticNReq) {
      lines.push(
        `The analytic pass estimated ${analyticNReq} vehicles, but congestion pushes the simulated requirement up to ${knee} — the single-loop layout is the likely bottleneck, not raw capacity.`,
      )
    } else {
      lines.push(
        `The simulation meets demand with fewer vehicles (${knee}) than the analytic pass estimated (${analyticNReq}) — the analytic derate factors are conservative for this scenario.`,
      )
    }
  } else {
    lines.push(`No fleet size in the sweep range met demand — even the largest simulated fleet falls short.`)
  }

  if (chosenPoint) {
    if (chosenPoint.met) {
      lines.push(`The scenario's chosen fleet size (${chosenFleet}) holds up in simulation.`)
    } else if (knee !== null && chosenFleet < knee) {
      lines.push(`The scenario's chosen fleet size (${chosenFleet}) does NOT meet demand in simulation — consider raising it to at least ${knee}.`)
    } else if (knee !== null) {
      // The chosen fleet is bigger than a fleet that DID meet demand, so it is
      // not short of vehicles — it is over-fleeted, and the extra vehicles are
      // congesting the loop. "Raise it to at least <smaller number>" would be
      // a contradiction. State what the sweep showed and let the reader draw
      // the engineering conclusion.
      lines.push(
        `The scenario's chosen fleet size (${chosenFleet}) does NOT meet demand in simulation, but ${knee} vehicles did — this is over-fleeting, not a shortage: past a point the extra vehicles congest the single loop instead of adding capacity.`,
      )
    } else {
      // Nothing met demand, so there is no fleet size to recommend. Adding
      // vehicles is not the answer — on a single loop it eventually makes
      // things worse.
      lines.push(`The scenario's chosen fleet size (${chosenFleet}) does NOT meet demand in simulation, and no larger fleet in range fixes it.`)
      lines.push(
        `Adding vehicles is not the lever here — reconsider the guide-path layout (a single loop caps how much traffic can flow), the modelling assumptions, the operating policy, or the demand target itself.`,
      )
    }
  }

  if (rollover !== null) {
    lines.push(`Throughput drops past ${rollover} vehicles — over-fleeting this loop creates its own congestion, so more vehicles isn't always better.`)
  }

  return lines
}
