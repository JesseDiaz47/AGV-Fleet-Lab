# Architecture

How AGV Fleet Lab v2 is put together, and which properties must survive a
change. Written for anyone picking the codebase up — including me, later.

## What this is

A local-only, no-backend React + TypeScript + Vite app that sizes an AGV fleet
for a single-loop guide path: an analytic first pass (Egbelu-style
fleet-sizing) validated by a seeded discrete-event simulation. It is an
educational/early-planning tool, **not** a substitute for a full DES study
(Plant Simulation, FlexSim, AnyLogic) or vendor sign-off — a result from this
tool is never final engineering validation.

## Commands

```bash
npm install
npm run dev         # Vite dev server
npm test            # Vitest (run once)
npm run test:watch  # Vitest watch
npm run lint        # oxlint
npm run typecheck   # tsc -b
npm run build       # tsc -b && vite build
npm run preview     # serve dist/
npm run verify      # headless-Chromium workflow gate (after a build)
npm run audit       # production + development dependency audit
npm run check       # typecheck + lint + test + build
npm run check:all   # audit + check + browser verification
```

Run `npm run check:all` before considering a change done. CI runs the same audit, static/unit/build gates, and production browser workflow on every pull request and push to `main`.

## Layout

- `src/types/domain.ts` — the `Scenario` and `ScenarioParams` shapes,
  `SCHEMA_VERSION`, `PARAM_LIMITS`, and the dispatch-rule enum.
- `src/lib/` — **pure, tested** logic. No React here.
  - `engine/` — the model core, framework-free: plain args in, plain values
    out.
    - `analytic.ts` — the Egbelu-style first pass (`analyze`).
    - `sim.ts` — the discrete-event simulation (`Sim`, `batchRun`, `avgStats`,
      `repSeed`). The `met` criterion and what it does and does not license are
      written up in the README under "How 'meets demand' is decided" — read it
      before changing anything that feeds a verdict.
    - `track.ts`, `demand.ts`, `dispatch.ts` — guide-path geometry, structured
      and shift-profile demand, dispatch strategies.
    - `feasibility.ts` — `fleetFeasibility`, the geometric precondition:
      whether the requested fleet physically fits the loop.
    - `sweep.ts` — the fleet-size sweep, its knee/rollover analysis, and the
      chart scales.
    - `render.ts` — canvas drawing for the live track view.
  - `sanitize.ts` — `sanitizeScenarioParams` and `sanitizeState`, the **one**
    validator, wired into both `persistence.ts` (localStorage load) and
    `backup.ts` (JSON restore).
  - `defaults.ts` — `defaultParams`, `makeScenario`, `defaultState`.
  - `simParams.ts` — glue from the persisted `ScenarioParams` to the narrower
    objects the two engine entry points want.
  - `verdict.ts` — plain-English synthesis of analytic vs. simulated results,
    shared by the on-screen card and the PDF so they cannot disagree.
  - `csvExport.ts`, `pdfReport.ts` — export surfaces.
  - `prng.ts`, `format.ts`, `csv.ts`, `download.ts`, `id.ts`, `validate.ts`,
    `persistence.ts`, `backup.ts` — small general-purpose modules with no AGV
    domain knowledge in them. They began in a personal collection of reusable
    utilities and near-identical copies live in other projects of mine, which
    is worth knowing if you find one elsewhere — but there is no upstream to
    sync with and nothing propagates. **They are maintained here like every
    other file in this repository:** change them in place, with tests, in an
    ordinary pull request.
  - `store.ts` — despite sitting next to those, this one is not generic. It
    wires the persistence and backup primitives to this app's domain (one
    storage key, `sanitizeState`, `defaultState`, `APP_SIGNATURE`) and is the
    only place `sanitizeState` is consumed.
- `src/hooks/` — `useScenarios` (CRUD + persistence), `useLiveSim` (the
  animated loop), `useValidate`, `useSweep`, `useCompare`.
- `src/components/` — presentation only: `scenario/`, `inputs/`, `simview/`,
  `results/`, `compare/`, `export/`, `ui/`.
- `src/styles/` — token-driven dark "control-room" palette (`tokens.css`,
  ported verbatim from the v1 tool) plus `reset.css`, `shell.css` and
  `screens.css`, all pulled together by `index.css`. There are no print
  styles: the design-review deliverable is the generated PDF
  (`lib/pdfReport.ts`), not a printed page.

## Rules to preserve

- **The engine stays framework-free.** Nothing under `src/lib/` (including
  `engine/`) may import React or touch the DOM. Only `hooks/` and
  `components/` do.
- **No `dangerouslySetInnerHTML`.** The sweep chart and any other string-built
  markup carried over from the v1 tool must be real JSX, not template-literal
  HTML/SVG strings.
- **One batched-repetition seed policy.** Repetition `r` of a batch runs on
  `repSeed(scenario.seed, r)` — `engine/sim.ts`, beside `REPS`/`SIM_HOURS`.
  Validation, the sweep, comparison, the seed list printed on the validation
  card, and every regression pin all call it; none of them writes the
  arithmetic out. This is not style. The policy used to be hand-copied into ten
  places, the app drifted to `seed + r` while the tests drifted to
  `seed + r * 7919`, and the suite spent that time pinning 41.6 jobs/hr — a
  number the app never produced. `useValidate.test.ts` and `useSweep.test.ts`
  compare the hooks against an independently computed reference so the two
  cannot separate again.
- **Regression pin.** `lib/engine` carries Vitest tests reproducing the v1
  tool's 15 hand-checked self-tests exactly (cycle 326.667 s, capacity
  11.02/hr, derate 0.6921, analytic N=6/5, determinism, state-time
  conservation). New model features — weighted demand, dispatch rules, shift
  profiles, reverse pickup — must reproduce these same numbers when their new
  inputs are left at "uniform"/"flat"/off. That equivalence is itself a test,
  not an assumption.
- **Scenarios are versioned records, never silently overwritten.** Saving an
  edited scenario creates a new revision; duplicate and rename preserve
  history.
- **Validate on the way in.** Storage load and JSON import both run through
  the sanitizer. Corrupt storage or a tampered import falls back to a clean
  default instead of crashing, and length-capped fields keep a hand-edited
  file from stalling the UI.
- **An infeasible scenario is preserved, not repaired.** If the requested
  fleet cannot fit the loop, the record is stored exactly as authored — but it
  is not simulated, and no KPIs are fabricated for it.
- **Local only.** No backend, cloud, auth, telemetry, or network calls.
- **TDD for `src/lib`:** failing test → minimal implementation → keep the
  suite green.

## Testing

Vitest + Testing Library, jsdom environment. `src/test/setup.ts` clears
`localStorage` before each test. Domain and engine modules get unit tests.

`npm run verify` (`node verify.js`, after a build) is the end-to-end workflow
gate. It spawns its own `vite preview` server and drives scenario create →
validate → sweep → compare → export in headless Chromium at desktop and mobile
widths, checking for zero console errors, real output at each step (verdict
pill, chart paths, table rows, a valid PDF signature), and no horizontal
overflow. Screenshots (`verify-desktop.png`, `verify-mobile.png`) are saved
for the eyeball pass and committed for review. Non-zero exit on any failure.

A gate that only checks *presence* can pass a broken render — a chart path
that exists but is drawn off-canvas still counts as a path. Prefer assertions
on values and coordinates over assertions that an element exists.

### Table scrolling is deliberate — measured, not assumed

At mobile widths the fleet-size sweep table is wider than the column it sits
in. Measured in Chromium at 390 px: `.table-scroll` reports a 525 px scroll
width against a 324 px client width, so `p95 flow time` and `Meets demand` sit
behind about 200 px of horizontal scroll. That is the intent, not an oversight
— `.table-scroll` is `overflow-x: auto` and `.data-table td` is
`white-space: nowrap` exactly so a wide numeric table scrolls inside its own
box rather than squashing its columns or dragging the page sideways. `verify.js`
separately asserts the *page* never scrolls horizontally (≤ 2 px, both widths).

Keyboard access was checked rather than assumed: in headless Chromium the
scroll container is reachable with Tab at mobile width, where it genuinely
scrolls, and is correctly skipped at desktop width, where scroll width equals
client width. That is Chromium's focusable-scrollers behavior, so no `tabindex`
is hard-coded here — a static one would plant a dead tab stop on desktop where
there is nothing to scroll. **Known limitation:** WebKit does not make
scrollers focusable, so keyboard-only access to those two columns is not
guaranteed on Safari. If that becomes a supported requirement the fix is
`tabindex="0"` plus `role="region"` and an accessible name on `.table-scroll`
— not a table redesign.

No conclusion is reachable *only* by scrolling: the chart above the table plots
throughput against the demand line, and the Verdict card below states the
meets-demand answer in words.

Two labels clip by design and are deliberately left alone — scenario names in
the sidebar list (`text-overflow: ellipsis`; the full name is in the Name field
of the selected scenario), and the dispatch-rule `<select>`, a native control
that shows its full option text when opened.

## Media

`capture.js` drives the built app and writes the README screenshots plus a
recording to `docs/media/`; `tools/make-media.sh` turns that recording into
the GIF and MP4 with ffmpeg. It is deliberately **not** part of `npm run
check` — a flaky screenshot must never be able to block a release.
