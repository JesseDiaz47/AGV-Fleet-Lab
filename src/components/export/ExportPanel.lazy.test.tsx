import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { analyze } from '../../lib/engine/analytic.ts'
import { defaultParams, makeScenario } from '../../lib/defaults.ts'
import { toAnalyticParams } from '../../lib/simParams.ts'

const { loadPdfModule } = vi.hoisted(() => ({ loadPdfModule: vi.fn() }))

vi.mock('../../lib/loadPdfReport.ts', () => ({ loadPdfReport: loadPdfModule }))

const { ExportPanel } = await import('./ExportPanel.tsx')

describe('ExportPanel PDF loading', () => {
  beforeEach(() => loadPdfModule.mockReset())

  it('loads the PDF implementation only after the export button is clicked', async () => {
    const scenario = makeScenario('Lazy PDF', defaultParams())
    const analytic = analyze(toAnalyticParams(scenario.params))
    const buildDesignReviewPdf = vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' }))
    const openOrSharePdf = vi.fn(async () => 'opened' as const)
    const pdfFilename = vi.fn(() => 'lazy-pdf.pdf')
    loadPdfModule.mockResolvedValue({ buildDesignReviewPdf, openOrSharePdf, pdfFilename })

    render(<ExportPanel scenario={scenario} analytic={analytic} validateResult={null} sweepResults={[]} />)

    expect(loadPdfModule).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Export PDF report' }))

    expect(loadPdfModule).toHaveBeenCalledTimes(1)
    expect(buildDesignReviewPdf).toHaveBeenCalledTimes(1)
    expect(openOrSharePdf).toHaveBeenCalledWith(expect.any(Blob), 'lazy-pdf.pdf')
    expect(await screen.findByRole('status')).toHaveTextContent('PDF opened')
  })
})
