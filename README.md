# AGV Fleet Lab

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

AGV fleet-sizing tool: sizes a one-way-loop AGV fleet analytically, then
**validates the answer with a discrete-event simulation** — congestion,
blocking, station queues, battery/charging, structured demand, dispatch
rules, and shift profiles.

Built by Jesse Diaz. Educational/planning-grade tool — not a substitute for a
full DES study (Plant Simulation / FlexSim / AnyLogic) or vendor sign-off. All
default numbers are fictional examples.

This is the **v2 rebuild**: Vite + React + TypeScript, named scenarios,
scenario comparison, and CSV/PDF export. The original single-file, zero-setup
version lives at `post-apps/agv-fleet-lab` and still works standalone — it's
kept as the offline handout artifact while this version grows.

## Development

```bash
npm install
npm run dev         # Vite dev server
npm test            # Vitest (run once)
npm run test:watch  # Vitest watch
npm run lint        # oxlint
npm run typecheck   # tsc -b
npm run build       # tsc -b && vite build
npm run preview     # serve dist/
npm run verify       # headless-Chromium workflow gate (after a build)
npm run check         # typecheck + lint + test + build, in that order
```

## Scope (v2, current)

- Single-loop guide path (multi-node route networks are a future phase).
- Structured (weighted) station demand, not just uniform random O-D.
- Selectable dispatch rules (nearest-vehicle, FCFS, longest-waiting priority).
- Shift / time-of-day demand profiles.
- Named, versioned scenarios with side-by-side comparison.
- CSV export and a design-review PDF report.

## References

Standard AGV-systems engineering: Egbelu (1987) fleet-sizing estimate,
Kingman/Little queueing relations, Factory Physics variability arguments.
