import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyze } from './engine/analytic.ts'
import { batchRun, REPS, SIM_HOURS } from './engine/sim.ts'
import { sweepSizes, type SweepPoint } from './engine/sweep.ts'
import { toAnalyticParams, toSimParams } from './simParams.ts'
import { buildVerdictLines } from './verdict.ts'
import { defaultParams, makeScenario } from './defaults.ts'
import { buildDesignReviewPdf, openOrSharePdf, pdfFilename } from './pdfReport.ts'

function pdfSignature(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.slice(0, 5))
}

describe('buildDesignReviewPdf', () => {
  afterEach(() => vi.restoreAllMocks())

  it('builds a real PDF with just scenario inputs + analytic estimate (nothing run yet)', async () => {
    const scenario = makeScenario('Baseline')
    const analytic = analyze(toAnalyticParams(scenario.params))
    const blob = buildDesignReviewPdf({ scenario, analytic, validate: null, sweep: [], verdictLines: [] })
    const bytes = new Uint8Array(await blob.arrayBuffer())

    expect(blob.type).toBe('application/pdf')
    expect(pdfSignature(bytes)).toBe('%PDF-')
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('builds a real PDF with validation, sweep, and verdict data included', async () => {
    const scenario = makeScenario('Fully run', { ...defaultParams(), fleet: 5, seed: 42 })
    const analytic = analyze(toAnalyticParams(scenario.params))
    const simParams = toSimParams(scenario.params)
    const validate = batchRun(simParams, scenario.params.seed, SIM_HOURS)
    const sweep: SweepPoint[] = sweepSizes(analytic, scenario.params)
      .slice(0, 3)
      .map((n) => {
        const s = batchRun({ ...simParams, fleet: n }, scenario.params.seed, SIM_HOURS)
        return { n, tph: s.tph, offered: s.offeredRate, busy: s.busy, blocked: s.blocked, p95: s.p95, met: s.met }
      })
    const verdictLines = buildVerdictLines(analytic.nReq, scenario.params.fleet, sweep)

    const blob = buildDesignReviewPdf({ scenario, analytic, validate, sweep, verdictLines })
    const bytes = new Uint8Array(await blob.arrayBuffer())

    expect(pdfSignature(bytes)).toBe('%PDF-')
    expect(blob.size).toBeGreaterThan(2000)
  })

  it('names the file from the scenario and today\'s date', () => {
    const scenario = makeScenario('My Test Scenario!')
    const name = pdfFilename(scenario)
    expect(name).toMatch(/^agv-fleet-lab-my-test-scenario-\d{4}-\d{2}-\d{2}\.pdf$/)
  })

  it('REPS batch reps stay reproducible for a given scenario seed (sanity check for report data)', () => {
    const scenario = makeScenario('Repeatable')
    const simParams = toSimParams(scenario.params)
    const a = batchRun(simParams, scenario.params.seed, SIM_HOURS)
    const b = batchRun(simParams, scenario.params.seed, SIM_HOURS)
    expect(a.tph).toBe(b.tph)
    expect(REPS).toBeGreaterThan(0)
  })

  it('returns shared after successful native file sharing', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })

    const result = await openOrSharePdf(new Blob(['pdf'], { type: 'application/pdf' }), 'design-review.pdf')

    expect(result).toBe('shared')
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.any(File)] }))
  })

  it('preserves native-share cancellation instead of downloading', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new DOMException('Canceled', 'AbortError')),
      configurable: true,
    })

    await expect(openOrSharePdf(new Blob(['pdf'], { type: 'application/pdf' }), 'design-review.pdf')).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('falls back to a PDF download when native sharing loses user activation', async () => {
    const opened: { href?: string; download?: string } = {}
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:share-fallback')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      opened.href = this.href
      opened.download = this.download
    })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new DOMException('User activation is required', 'NotAllowedError')),
      configurable: true,
    })

    const result = await openOrSharePdf(new Blob(['pdf'], { type: 'application/pdf' }), 'design-review.pdf')

    expect(result).toBe('opened')
    expect(opened.href).toBe('blob:share-fallback')
    expect(opened.download).toBe('design-review.pdf')
  })

  it('opens a PDF preview when native file sharing is unavailable', async () => {
    const opened: { href?: string; download?: string; target?: string } = {}
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:design-review-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      opened.href = this.href
      opened.download = this.download
      opened.target = this.target
    })
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })

    const result = await openOrSharePdf(new Blob(['pdf'], { type: 'application/pdf' }), 'design-review.pdf')

    expect(result).toBe('opened')
    expect(opened.href).toBe('blob:design-review-preview')
    expect(opened.download).toBe('design-review.pdf')
    expect(opened.target).toBe('_blank')
  })
})
