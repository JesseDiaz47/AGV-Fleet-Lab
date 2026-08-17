# Contributing to AGV Fleet Lab

Everything needed to work on this project is in this repository. There is no
private dependency, no service to sign up for, and no backend.

## Setup

```bash
npm install
npm run dev          # Vite dev server
```

## Before you open a pull request

```bash
npm run check:all
```

That is the gate: `npm audit`, then typecheck → lint → test → build, then the
headless-Chromium workflow verification against a real production build. CI
runs the same thing. A change is not done until it passes locally.

`npm run check:all` needs Chromium for the last step:

```bash
npx playwright install --with-deps chromium
```

Individual gates are `npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`, `npm run verify`.

## TDD for domain behavior

Anything under `src/lib/` — the engine, the sanitizer, the verdict text, the
export surfaces — goes failing test first, then the smallest change that makes
it pass, then the whole suite. Presentation-only changes under `src/components/`
do not need this.

Two rules that exist because they were learned the hard way:

- **Assert on values, not on presence.** A chart path that exists but is drawn
  off-canvas still counts as a path. Pin the number or the coordinate.
- **Don't restate a formula in its own test.** Compare against an
  independently computed reference. A test that recomputes the thing it is
  checking drifts in lockstep with the bug — see `repSeed` in
  `src/lib/engine/sim.ts` for what that cost last time.

`docs/ARCHITECTURE.md` has the full list of invariants a change must preserve,
including the v1 regression pins. Read it before touching `src/lib/engine/`.

## The one-way loop is a model boundary, not a backlog item

Every supported result assumes a single one-way guide path: vehicles follow the
leader and nobody passes. That is what makes the model tractable and
deadlock-free. Changes that quietly introduce opposing traffic, passing, or
multi-node routing are out of scope for this codebase as it stands — real
bidirectional operation needs zone reservation, sidings and deadlock detection,
which is a route-network phase rather than a flag.

Reverse-direction empty pickup stays experimental and off by default. With it
off, results must remain byte-identical to the one-way baseline, and that
equivalence is a pinned test.

## Data and claims

- **All example data is fictional.** Default parameters are illustrative
  numbers, not measurements from any real facility. Do not contribute real
  site data, vendor performance figures, customer names, or anything else
  identifying a real installation.
- **No machine-control claims.** This is a planning tool. It does not command,
  interface with, or validate real vehicles, and nothing in it should be worded
  as if it does.
- **No vendor-validation claims.** Results are educational/early-planning
  estimates, not a substitute for a full DES study (Plant Simulation, FlexSim,
  AnyLogic) or vendor sign-off. Documentation and UI copy must keep saying so.
- Cite what you implement. If a change follows a published method, say which
  one and be honest about the distance between "in the style of" and
  "validated against" — see the References section of the README.

## Commits and pull requests

Conventional commit subjects (`fix:`, `feat:`, `docs:`, `test:`, `chore:`),
one logical change each. Say in the pull request what you verified and paste
the result — "`npm run check:all` passes, 210 tests" beats "should be fine".

If a change moves a published number (anything in the README, the screenshots
in `docs/media/`, or the default scenario's result), say so explicitly and
update every artifact that shows it. Regenerating the media is documented in
the README under "Regenerating the README media".
