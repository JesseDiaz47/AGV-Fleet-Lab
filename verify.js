// Verification gate for AGV Fleet Lab v2 (non-zero exit on any failure).
// Run after `npm run build`. Drives a real `vite preview` server through the
// full workflow — scenario create → validate → sweep → compare → export —
// in headless Chromium, at both desktop and mobile widths:
//   - zero console/page errors
//   - each step actually produces output (verdict pill, chart, table rows)
//   - CSV and PDF exports produce real files (PDF signature checked)
//   - no horizontal overflow
//   - screenshots saved for visual review
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 4790
const BASE_URL = `http://localhost:${PORT}/`
const VITE_BIN = path.join(__dirname, 'node_modules', '.bin', 'vite')

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - start > timeoutMs) reject(new Error(`Server at ${url} did not start in time`))
          else setTimeout(tryOnce, 300)
        })
    }
    tryOnce()
  })
}

async function verifyAtViewport(browser, name, viewport, problems) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${name}] console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`))

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })

  // --- Scenario workflow: create a second scenario for compare later ---
  await page.click('button:has-text("+ New")')
  const scenarioCount = await page.locator('.scenario-list__row').count()
  if (scenarioCount < 2) problems.push(`[${name}] expected 2 scenarios after create, found ${scenarioCount}`)

  // --- Validate ---
  await page.click('button:has-text("Run validation")')
  await page.waitForSelector('.verdict-pill', { timeout: 20000 })

  // --- Sweep ---
  await page.click('button:has-text("Run sweep")')
  await page.waitForFunction(
    () => document.body.innerText.includes('Run sweep') && !document.body.innerText.includes('Running…'),
    { timeout: 60000 },
  )
  const chartPaths = await page.locator('.sweep-chart path').count()
  if (chartPaths < 1) problems.push(`[${name}] sweep chart did not render`)
  const sweepRows = await page.locator('.data-table tbody tr').count()
  if (sweepRows < 3) problems.push(`[${name}] sweep table rows: ${sweepRows}`)
  const verdictText = (await page.locator('.verdict-line').first().textContent())?.trim() ?? ''
  if (verdictText.length === 0) problems.push(`[${name}] verdict text missing`)

  // --- Compare: select both scenarios and run ---
  const compareChecks = page.locator('.scenario-list__compare input[type=checkbox]')
  await compareChecks.nth(0).check()
  await compareChecks.nth(1).check()
  await page.click('button:has-text("Run comparison")')
  await page.waitForFunction(
    () => document.body.innerText.includes('Run comparison') && !document.body.innerText.includes('Running…'),
    { timeout: 60000 },
  )
  const compareRows = await page.locator('.data-table--compare tbody tr').count()
  if (compareRows < 5) problems.push(`[${name}] compare table rows: ${compareRows}`)

  // --- Export: CSV ---
  const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export CSV")')])
  const csvPath = await csvDownload.path()
  if (!csvPath) {
    problems.push(`[${name}] CSV export produced no file`)
  } else if (!readFileSync(csvPath, 'utf8').startsWith('Fleet,')) {
    problems.push(`[${name}] CSV export content looks wrong`)
  }

  // --- Export: PDF ---
  const [pdfDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Export PDF report")'),
  ])
  const pdfPath = await pdfDownload.path()
  if (!pdfPath) {
    problems.push(`[${name}] PDF export produced no file`)
  } else if (readFileSync(pdfPath).subarray(0, 5).toString('latin1') !== '%PDF-') {
    problems.push(`[${name}] PDF export is not a valid PDF`)
  }

  // --- No horizontal overflow ---
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 2) problems.push(`[${name}] horizontal overflow: ${overflow}px`)

  await page.screenshot({ path: path.join(__dirname, `verify-${name}.png`), fullPage: true })
  await page.close()
}

async function run() {
  const problems = []
  const preview = spawn(VITE_BIN, ['preview', '--port', String(PORT), '--strictPort'], {
    cwd: __dirname,
    stdio: 'pipe',
  })
  preview.stderr.on('data', (d) => process.stderr.write(`[vite preview] ${d}`))

  try {
    await waitForServer(BASE_URL)

    const browser = await chromium.launch({ headless: true })
    try {
      for (const [name, viewport] of [
        ['desktop', { width: 1380, height: 950 }],
        ['mobile', { width: 390, height: 844 }],
      ]) {
        await verifyAtViewport(browser, name, viewport, problems)
      }
    } finally {
      await browser.close()
    }
  } finally {
    preview.kill()
  }

  if (problems.length) {
    console.error('\nVERIFY FAILED:')
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }
  console.log('\nVERIFY PASSED — screenshots: verify-desktop.png, verify-mobile.png')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
