/**
 * Safe CSV generation. Source: vfd-command-center's importExport.ts.
 *
 * The non-obvious part worth keeping: csvField() neutralizes CSV *formula
 * injection*. A cell that starts with = + - or @ is treated as a formula by
 * Excel/Sheets, so a value like "=HYPERLINK(...)" pasted from user input can
 * execute when the file is opened. Prefixing with a single quote defuses it.
 * RFC 4180 quoting is also handled (embedded quotes, commas, newlines).
 */

/** Escape one field: formula-injection guard + RFC 4180 quoting. */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(s)) {
    s = `'${s}`
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Build a CSV string from a header row and typed data rows. Trailing newline. */
export function toCsv(
  header: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const lines = rows.map((row) => row.map(csvField).join(','))
  return [header.join(','), ...lines].join('\n') + '\n'
}

/** Round a nullable number to a CSV cell string ('' for null). */
export function csvRound(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  const factor = 10 ** digits
  return String(Math.round(value * factor) / factor)
}
