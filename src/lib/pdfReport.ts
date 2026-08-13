/**
 * Design-review PDF export: scenario identity/inputs, the analytic estimate,
 * the last simulation-validation result, the last fleet-size sweep, and the
 * plain-English verdict — everything a reviewer needs without opening the
 * app. Pattern follows vfd-command-center's pdfReport.ts (jspdf +
 * jspdf-autotable); the layout here is plainer since this is a design-review
 * document, not a photo-doc replica.
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { pickKnee, type SweepPoint } from './engine/sweep.ts'
import { fleetFeasibility } from './engine/feasibility.ts'
import type { AnalyticResult } from './engine/analytic.ts'
import type { SimStats } from './engine/sim.ts'
import type { Scenario } from '../types/domain.ts'
import { fmtNum, fmtPercent, unit } from './format.ts'

const INK = '#0d0d0d'
const MUTED = '#666666'
const ACCENT = '#3987e5'
const RULE = '#d9d9d9'

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 40
const HEADER_H = 74
const FOOTER_H = 34
const FOOTER_TOP = PAGE_H - FOOTER_H

const fmtTph = unit('/hr', 2)
const fmtSec = unit('s', 1)

export interface DesignReviewData {
  scenario: Scenario
  analytic: AnalyticResult
  validate: SimStats | null
  sweep: SweepPoint[]
  verdictLines: string[]
}

function lastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? MARGIN + HEADER_H
}

function sectionTitle(doc: jsPDF, y: number, text: string): void {
  doc.setFillColor(ACCENT)
  doc.rect(MARGIN, y - 9, 3, 11, 'F')
  doc.setTextColor(INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.text(text, MARGIN + 9, y)
}

function keyValueTable(doc: jsPDF, startY: number, rows: [string, string][]): void {
  autoTable(doc, {
    startY,
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_H + 12 },
    body: rows,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 3, textColor: INK },
    columnStyles: {
      0: { cellWidth: 180, textColor: MUTED },
      1: { fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.row.index % 2 === 1) data.cell.styles.fillColor = '#f7f7f7'
    },
  })
}

function weightedDemandSummary(scenario: Scenario): string {
  return scenario.params.originWeights || scenario.params.destWeights ? 'Weighted (non-uniform)' : 'Uniform'
}

function shiftProfileSummary(scenario: Scenario): string {
  const profile = scenario.params.shiftProfile
  if (!profile) return 'Flat (no shift variation)'
  return profile.map((b) => `${b.startHour}h×${b.multiplier}`).join(', ')
}

function drawHeader(doc: jsPDF, scenario: Scenario): void {
  doc.setFillColor(INK)
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F')
  doc.setFillColor(ACCENT)
  doc.rect(0, 0, 5, HEADER_H, 'F')

  doc.setTextColor(ACCENT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('AGV FLEET LAB — DESIGN REVIEW', MARGIN, 24, { charSpace: 0.6 })

  doc.setTextColor('#ffffff')
  doc.setFontSize(16)
  doc.text(scenario.name, MARGIN, 44)

  doc.setTextColor('#b7c4d6')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(
    `Seed ${scenario.params.seed} · Revision ${scenario.revision} · Generated ${new Date().toLocaleDateString('en-US')}`,
    MARGIN,
    58,
  )
}

function drawFooters(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(RULE)
    doc.setLineWidth(0.5)
    doc.line(MARGIN, FOOTER_TOP, PAGE_W - MARGIN, FOOTER_TOP)
    doc.setTextColor(MUTED)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text(
      'Educational/early-planning tool — not a substitute for a full discrete-event simulation study or vendor sign-off.',
      MARGIN,
      FOOTER_TOP + 14,
    )
    doc.text(`AGV Fleet Lab v2 · Page ${page} of ${pageCount}`, PAGE_W - MARGIN, FOOTER_TOP + 14, { align: 'right' })
  }
}

export function buildDesignReviewPdf(data: DesignReviewData): Blob {
  const { scenario, analytic, validate, sweep, verdictLines } = data
  const p = scenario.params
  const fit = fleetFeasibility(p)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true })

  drawHeader(doc, scenario)

  let y = MARGIN + HEADER_H + 16
  sectionTitle(doc, y, 'SCENARIO INPUTS')
  keyValueTable(doc, y + 8, [
    ['Demand', fmtTph(p.demand)],
    ['Dispatch rule', p.dispatchRule],
    ['Station demand', weightedDemandSummary(scenario)],
    ['Shift profile', shiftProfileSummary(scenario)],
    ['Loop length', `${fmtNum(p.loopLen)} m`],
    ['Stations', fmtNum(p.stations)],
    ['Speed', `${fmtNum(p.speed, 2)} m/s`],
    ['Min gap', `${fmtNum(p.minGap)} m`],
    ['Load / unload time', `${fmtNum(p.loadS)} s / ${fmtNum(p.unloadS)} s`],
    ['Time spread', fmtPercent(p.spreadPct)],
    ['Battery-constrained', p.battery ? 'Yes' : 'No'],
    ...(p.battery
      ? ([
          ['Runtime / charge time', `${fmtNum(p.runtimeH, 2)} h / ${fmtNum(p.chargeH, 2)} h`],
          ['Charge threshold / target', `${fmtPercent(p.thresholdPct)} / ${fmtPercent(p.targetPct)}`],
          ['Charge bays', fmtNum(p.chargeBays)],
        ] as [string, string][])
      : []),
    ['Availability / max utilization', `${fmtPercent(p.availabilityPct)} / ${fmtPercent(p.maxUtilPct)}`],
    ['Fleet size (chosen)', fmtNum(p.fleet)],
    // A reviewer reading this offline has no feasibility notice to look at, so
    // the geometry verdict has to travel with the inputs. Vehicles are points
    // here: the min gap is the whole clearance each one claims.
    [
      'Fleet fits the guide path',
      fit.feasible
        ? 'Yes'
        : `NO — this loop holds at most ${fmtNum(fit.maxFleet)} at a ${fmtNum(p.minGap)} m gap; the chosen fleet was not simulated`,
    ],
    ['Seed', fmtNum(p.seed)],
  ])
  y = lastTableY(doc) + 22

  sectionTitle(doc, y, 'ANALYTIC ESTIMATE')
  keyValueTable(doc, y + 8, [
    ['Cycle time', fmtSec(analytic.cycle)],
    ['Capacity per vehicle', fmtTph(analytic.perVehicle)],
    ['Charge overhead', fmtPercent(analytic.chargeOverhead * 100)],
    ['Derate factor', fmtNum(analytic.derate, 4)],
    ['Raw fleet (undirated)', fmtNum(analytic.nRaw, 2)],
    ['Vehicles required', fmtNum(analytic.nReq)],
  ])
  y = lastTableY(doc) + 22

  sectionTitle(doc, y, 'SIMULATION VALIDATION')
  if (validate) {
    keyValueTable(doc, y + 8, [
      ['Simulated throughput', `${fmtTph(validate.tph)} (offered ${fmtTph(validate.offeredRate)})`],
      ['Utilization', fmtPercent(validate.busy * 100)],
      ['Blocked (congestion)', fmtPercent(validate.blocked * 100)],
      ['Flow time p50 / p95', `${fmtSec(validate.p50)} / ${fmtSec(validate.p95)}`],
      ['End-of-run backlog', fmtNum(validate.backlog)],
      ['Stranded (dead battery)', fmtNum(validate.stranded)],
      ['Avg state of charge', fmtPercent(validate.avgSoc)],
      ['Reverse pickup share', `${fmtPercent(validate.reversePickupShare * 100)} (${validate.reversePickups} / ${validate.pickupsObserved})`],
      ['Meets demand', validate.met ? 'Yes' : 'No'],
    ])
    y = lastTableY(doc) + 22
  } else {
    doc.setTextColor(MUTED)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.text('Not run in this session — open the app and run validation to include it here.', MARGIN, y + 14)
    y += 30
  }

  sectionTitle(doc, y, 'FLEET-SIZE SWEEP')
  if (sweep.length > 0) {
    const knee = pickKnee(sweep)
    autoTable(doc, {
      startY: y + 8,
      margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_H + 12 },
      head: [['Fleet', 'Throughput', 'Utilization', 'Blocked', 'p95 flow time', 'Meets demand']],
      body: sweep.map((r) => [
        String(r.n),
        fmtTph(r.tph),
        fmtPercent(r.busy * 100),
        fmtPercent(r.blocked * 100),
        fmtSec(r.p95),
        r.met ? 'Yes' : 'No',
      ]),
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 3, textColor: INK },
      headStyles: { fontStyle: 'bold', textColor: MUTED, fontSize: 7.5 },
      didParseCell: (cellData) => {
        if (sweep[cellData.row.index]?.n === knee) cellData.cell.styles.fillColor = '#eaf1fc'
      },
    })
    y = lastTableY(doc) + 22
  } else {
    doc.setTextColor(MUTED)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.text('Not run in this session — open the app and run the sweep to include it here.', MARGIN, y + 14)
    y += 30
  }

  if (y > FOOTER_TOP - 80) {
    doc.addPage()
    y = MARGIN + 20
  }
  sectionTitle(doc, y, 'VERDICT')
  doc.setTextColor(INK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let lineY = y + 18
  for (const line of verdictLines.length > 0 ? verdictLines : ['Run the fleet-size sweep in the app to get a verdict.']) {
    const wrapped: string[] = doc.splitTextToSize(line, PAGE_W - MARGIN * 2)
    for (const wline of wrapped) {
      doc.text(wline, MARGIN, lineY)
      lineY += 12
    }
    lineY += 4
  }

  drawFooters(doc)
  return doc.output('blob')
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'scenario'
}

export function pdfFilename(scenario: Scenario): string {
  return `agv-fleet-lab-${slugify(scenario.name)}-${new Date().toISOString().slice(0, 10)}.pdf`
}

export type PdfDelivery = 'shared' | 'opened'

/** Share the PDF natively where supported; otherwise open/download a preview. */
export async function openOrSharePdf(blob: Blob, filename: string): Promise<PdfDelivery> {
  const file = new File([blob], filename, { type: 'application/pdf' })
  const shareData = { title: 'AGV Fleet Lab design review', files: [file] }
  if (typeof navigator.share === 'function' && navigator.canShare?.(shareData)) {
    await navigator.share(shareData)
    return 'shared'
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.target = '_blank'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'opened'
}
