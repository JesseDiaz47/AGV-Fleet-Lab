import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { makeScenario } from '../../lib/defaults.ts'
import { CompareView } from './CompareView.tsx'

describe('CompareView responsive summary', () => {
  it('renders each selected scenario as a labeled mobile summary card', () => {
    const first = makeScenario('Baseline')
    const second = makeScenario('Lower fleet', { ...first.params, fleet: 4 })

    render(<CompareView scenarios={[first, second]} compareIds={[first.id, second.id]} />)

    const summaries = screen.getByRole('list', { name: 'Scenario comparison summaries' })
    expect(within(summaries).getByRole('listitem', { name: 'Baseline' })).toBeInTheDocument()
    expect(within(summaries).getByRole('listitem', { name: 'Lower fleet' })).toBeInTheDocument()
  })
})
