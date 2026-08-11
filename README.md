# AGV Fleet Lab

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

## Model boundary: the loop is one-way

Every supported result assumes a **single one-way loop**. That assumption is
what makes the model tractable: vehicles follow the leader, nobody passes, and
because all traffic flows the same direction there are no head-on conflicts to
arbitrate — the layout is deadlock-free by construction. The analytic first
pass (Egbelu) assumes the same thing.

**Reverse-direction empty pickup is therefore experimental and off by
default.** Letting an empty vehicle back up to a nearer pickup is outside that
model, so it is admitted only under a narrow give-way rule: a vehicle may
reverse only into a stretch of loop it can see is clear, and it yields to
forward traffic unconditionally, finishing the trip forward if anyone catches
up (`REVERSE_CLEARANCE` in `src/lib/engine/sim.ts`). With the option on,
expect a modest gain at small fleet sizes — where the loop is empty enough for
the maneuver to be legal — converging on the one-way baseline as the fleet
fills the loop. Turning it off reproduces the one-way baseline exactly, and
that equivalence is a pinned test.

Reverse travel that genuinely pays off needs real bidirectional traffic
control — zone reservation, sidings, deadlock detection — which is a route-
network phase, not a flag.

## References

Standard AGV-systems engineering: Egbelu (1987) fleet-sizing estimate,
Kingman/Little queueing relations, Factory Physics variability arguments.
