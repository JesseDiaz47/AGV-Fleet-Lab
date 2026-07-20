import { useState } from 'react'
import { buildDesignReviewPdf, openOrSharePdf, pdfFilename } from '../../lib/pdfReport.ts'
import { buildVerdictLines } from '../../lib/verdict.ts'
import type { AnalyticResult } from '../../lib/engine/analytic.ts'
import type { SimStats } from '../../lib/engine/sim.ts'
import type { SweepPoint } from '../../lib/engine/sweep.ts'
import type { Scenario } from '../../types/domain.ts'

interface ExportPanelProps {
  scenario: Scenario
  analytic: AnalyticResult
  validateResult: SimStats | null
  sweepResults: SweepPoint[]
}

/** Combined design-review PDF: scenario inputs, analytic estimate, the last validation run and sweep (if any), and the verdict — everything in one shareable document. */
export function ExportPanel({ scenario, analytic, validateResult, sweepResults }: ExportPanelProps) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function exportPdf() {
    setBusy(true)
    setMsg(null)
    try {
      const verdictLines = buildVerdictLines(analytic.nReq, scenario.params.fleet, sweepResults)
      const blob = buildDesignReviewPdf({ scenario, analytic, validate: validateResult, sweep: sweepResults, verdictLines })
      const delivery = await openOrSharePdf(blob, pdfFilename(scenario))
      setMsg({
        ok: true,
        text: delivery === 'shared' ? 'PDF shared.' : 'PDF opened. Use your browser to save it.',
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setMsg({ ok: true, text: 'PDF sharing canceled.' })
      } else {
        setMsg({ ok: false, text: 'Could not create the PDF. Try again.' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="card-title">Design-review export</div>
      <p className="card-hint">
        One PDF with the scenario's inputs, the analytic estimate, the last validation run and sweep (if
        you've run them), and the verdict.
      </p>
      <button type="button" className="btn btn-sm btn-primary" onClick={exportPdf} disabled={busy}>
        {busy ? 'Creating PDF…' : 'Export PDF report'}
      </button>
      {msg && (
        <p className={msg.ok ? 'card-hint' : 'form-error'} role="status">
          {msg.text}
        </p>
      )}
    </section>
  )
}
