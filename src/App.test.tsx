import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

/** The pill only exists once a validation run has produced results. */
const VERDICT_PILL = /at this fleet size/
const NOT_RUN_YET = 'Not run yet for this scenario.'

/** Runs the validation and waits for real simulated results to land. */
async function runValidation() {
  fireEvent.click(screen.getByRole('button', { name: 'Run validation' }))
  // Two 8 h batch reps, yielded through setTimeout — slower than the default.
  await waitFor(() => expect(screen.getByText(VERDICT_PILL)).toBeInTheDocument(), { timeout: 20000 })
}

describe('App', () => {
  it('renders the app title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'AGV Fleet Lab' })).toBeInTheDocument()
  })
})

/**
 * Simulated KPIs describe the params they were run against. The analytic card
 * recomputes from `params` on every keystroke, so any edit that leaves the
 * last validation/sweep on screen puts two different scenarios side by side —
 * and `buildVerdictLines` then compares this scenario's analytic estimate
 * against the previous one's sweep. The PDF export reads both from the same
 * place, so the contradiction travels off-screen into a shareable document.
 *
 * The bug these pin against: invalidation keyed on `activeScenario.id`, but
 * editing a scenario keeps its id (updateParams bumps `revision` instead), so
 * nothing cleared and the stale results survived every field edit.
 */
describe('App — stale results are invalidated', () => {
  it('clears validation results when a param changes', async () => {
    render(<App />)
    await runValidation()

    fireEvent.change(screen.getByLabelText('Demand (jobs/hr)'), { target: { value: '400' } })

    expect(screen.queryByText(VERDICT_PILL)).not.toBeInTheDocument()
    // Both result surfaces reset: the validation card and the sweep section
    // share this empty state, and one effect clears the pair.
    expect(screen.getAllByText(NOT_RUN_YET)).toHaveLength(2)
  })

  it('clears them for a geometry change too, not just demand', async () => {
    render(<App />)
    await runValidation()

    fireEvent.change(screen.getByLabelText('Fleet size'), { target: { value: '9' } })

    expect(screen.queryByText(VERDICT_PILL)).not.toBeInTheDocument()
  })

  it('keeps results through a rename — the model did not change', async () => {
    // The precise-enough check: renaming bumps `revision` and `updatedAt` but
    // leaves `params` untouched, so keying invalidation on the revision (or on
    // the scenario object) would throw away a perfectly valid 16 h of
    // simulation because the user fixed a typo in the title.
    render(<App />)
    await runValidation()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed scenario' } })

    expect(screen.getByText(VERDICT_PILL)).toBeInTheDocument()
  })
})
