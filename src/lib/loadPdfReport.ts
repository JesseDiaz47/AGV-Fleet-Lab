import type * as PdfReport from './pdfReport.ts'

/** Keep the PDF renderer out of the initial app bundle; it is needed only after an explicit export. */
export function loadPdfReport(): Promise<typeof PdfReport> {
  return import('./pdfReport.ts')
}
