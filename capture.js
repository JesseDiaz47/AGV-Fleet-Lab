// README media capture for AGV Fleet Lab v2. NOT a gate — verify.js owns that
// job, and mixing the two would mean a failing screenshot could block a ship.
//
// Drives the same workflow verify.js does, but paced for a human watching it:
// live sim → analytic + validation → fleet-size sweep → scenario comparison →
// export. Writes framed element screenshots plus one video of the whole tour,
// and prints the timestamps of the live-sim segment so the GIF can be cut from
// the video without guessing where it starts.
//
// Usage: npm run build && node capture.js   (then tools/make-media.sh)
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 4791
const BASE_URL = `http://localhost:${PORT}/`
const VITE_BIN = path.join(__dirname, 'node_modules', '.bin', 'vite')
const MEDIA = path.join(__dirname, 'docs', 'media')
const RAW = path.join(MEDIA, 'raw')

// The tour is recorded at 1x so the video matches what a visitor would see;
// screenshots are taken at 2x separately, since a README image is inspected
// closely and a video is not.
const VIEWPORT = { width: 1380, height: 950 }

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

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

/** A card located by its visible title, so the shot survives class renames. */
function card(page, title) {
  return page.locator('.card').filter({ hasText: title }).first()
}

async function shoot(locator, name) {
  await locator.screenshot({ path: path.join(MEDIA, `${name}.png`) })
  console.log(`  shot  docs/media/${name}.png`)
}

async function tour(page, marks) {
  const t0 = Date.now()
  const mark = (label) => {
    const at = ((Date.now() - t0) / 1000).toFixed(1)
    marks.push([label, at])
    console.log(`  mark  ${label} @ ${at}s`)
  }

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await pause(1200)
  mark('load')

  // --- Live sim: the one screen that only makes sense in motion ---
  await page.click('button:has-text("Play")')
  await page.click('.simview__speeds button:has-text("5x")')
  mark('live-sim-start')
  await pause(11000) // the GIF is cut from this window
  mark('live-sim-end')
  // No still of this card: the GIF is the whole point of it, and a committed
  // screenshot nothing references is just a file that goes stale.
  await page.click('button:has-text("Pause")')
  await pause(600)

  // --- Analytic estimate + simulated validation ---
  await page.click('button:has-text("Run validation")')
  await page.waitForSelector('.verdict-pill', { timeout: 30000 })
  await pause(1500)
  await shoot(page.locator('.card-row'), '01-analytic-validate')
  mark('validated')

  // --- Fleet-size sweep ---
  await page.click('button:has-text("Run sweep")')
  await page.waitForFunction(
    () => document.body.innerText.includes('Run sweep') && !document.body.innerText.includes('Running…'),
    { timeout: 90000 },
  )
  await pause(1500)
  await card(page, 'Fleet-size sweep').scrollIntoViewIfNeeded()
  await pause(800)
  await shoot(card(page, 'Fleet-size sweep'), '03-sweep')
  mark('swept')

  // --- Compare: a second scenario at a different fleet size ---
  // Comparing a scenario against a copy of itself produces two identical rows
  // and shows a reader nothing, so the duplicate gets a smaller fleet.
  await page.click('button:has-text("+ New")')
  await pause(600)
  const fleet = page.locator('label.field', { hasText: 'Fleet size' }).locator('input')
  await fleet.fill('3')
  await fleet.blur()
  await pause(600)

  const compareChecks = page.locator('.scenario-list__compare input[type=checkbox]')
  await compareChecks.nth(0).check()
  await compareChecks.nth(1).check()
  await page.click('button:has-text("Run comparison")')
  await page.waitForFunction(
    () => document.body.innerText.includes('Run comparison') && !document.body.innerText.includes('Running…'),
    { timeout: 90000 },
  )
  await pause(1500)
  await card(page, 'Compare scenarios').scrollIntoViewIfNeeded()
  await pause(800)
  await shoot(card(page, 'Compare scenarios'), '04-compare')
  mark('compared')

  // --- Export panel ---
  await card(page, 'Design-review export').scrollIntoViewIfNeeded()
  await pause(800)
  await shoot(card(page, 'Design-review export'), '05-export')
  mark('exported')

  // --- Full-app shot, for the README header ---
  await page.evaluate(() => window.scrollTo(0, 0))
  await pause(800)
  await page.screenshot({ path: path.join(MEDIA, '00-overview.png'), fullPage: true })
  console.log('  shot  docs/media/00-overview.png')
  await pause(1200)
}

async function run() {
  rmSync(RAW, { recursive: true, force: true })
  mkdirSync(RAW, { recursive: true })

  const preview = spawn(VITE_BIN, ['preview', '--port', String(PORT), '--strictPort'], {
    cwd: __dirname,
    stdio: 'pipe',
  })
  preview.stderr.on('data', (d) => process.stderr.write(`[vite preview] ${d}`))

  const marks = []
  const problems = []
  try {
    await waitForServer(BASE_URL)
    const browser = await chromium.launch({ headless: true })
    try {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        recordVideo: { dir: RAW, size: VIEWPORT },
      })
      const page = await context.newPage()
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`console.error: ${m.text()}`)
      })
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

      await tour(page, marks)

      const video = page.video()
      await page.close()
      await context.close() // video is only finalized once the context closes
      if (video) {
        const src = await video.path()
        renameSync(src, path.join(RAW, 'tour.webm'))
      }
    } finally {
      await browser.close()
    }
  } finally {
    preview.kill()
  }

  const stray = readdirSync(RAW).filter((f) => f.endsWith('.webm') && f !== 'tour.webm')
  for (const f of stray) rmSync(path.join(RAW, f))

  console.log('\nmarks:')
  for (const [label, at] of marks) console.log(`  ${label.padEnd(16)} ${at}s`)

  if (problems.length) {
    console.error('\nCAPTURE: page reported errors during the tour:')
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }
  console.log('\nCAPTURE OK — raw video at docs/media/raw/tour.webm')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
