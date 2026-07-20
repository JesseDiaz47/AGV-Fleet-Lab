/**
 * Plain-English synthesis of the analytic estimate against the simulated
 * sweep. Pure/framework-free so both the on-screen Verdict card and the PDF
 * export produce identical text from one source.
 */
import { findRollover, pickKnee, type SweepPoint } from './engine/sweep.ts'

export function buildVerdictLines(analyticNReq: number, chosenFleet: number, results: SweepPoint[]): string[] {
  if (results.length === 0) return []

  const knee = pickKnee(results)
  const rollover = findRollover(results)
  const chosenPoint = results.find((r) => r.n === chosenFleet)
  const lines: string[] = []
  // pickKnee falls back to the best-throughput point when nothing met
  // demand, so `knee` is never actually null here — check whether it (or
  // anything else in range) really met demand before trusting it as a knee.
  const anyMet = results.some((r) => r.met)

  if (knee !== null && anyMet) {
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
    } else {
      lines.push(`The scenario's chosen fleet size (${chosenFleet}) does NOT meet demand in simulation — consider raising it${knee !== null ? ` to at least ${knee}` : ''}.`)
    }
  }

  if (rollover !== null) {
    lines.push(`Throughput drops past ${rollover} vehicles — over-fleeting this loop creates its own congestion, so more vehicles isn't always better.`)
  }

  return lines
}
