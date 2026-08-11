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
- Selectable dispatch rules (nearest-vehicle, first-idle FCFS, longest-idle vehicle).
- Shift / time-of-day demand profiles.
- Named, versioned scenarios with side-by-side comparison.
- CSV export and a design-review PDF report.

## Model boundary: the loop is one-way

Every supported result assumes a **single one-way loop**. That assumption makes
the model tractable: vehicles follow the leader, nobody passes, and ordinary
traffic has no opposing flow to create a head-on deadlock. This is not a
universal safety guarantee. The requested fleet must fit the loop, and vehicles
returning from the charge/park spur must merge into a real gap. Both conditions
are enforced before the engine reports simulated results. The analytic first
pass (Egbelu) assumes the same one-way layout.

**Reverse-direction empty pickup is therefore experimental and off by
default.** Letting an empty vehicle back up to a nearer pickup is outside that
model, so it is admitted only under a narrow give-way rule: a vehicle may
reverse only into a stretch of loop it can see is clear, and it yields to
forward traffic unconditionally, finishing the trip forward if anyone catches
up (`REVERSE_CLEARANCE` in `src/lib/engine/sim.ts`). With the option on,
expect a modest gain at small fleet sizes — where the loop is empty enough for
the maneuver to be legal — converging on the one-way baseline as the fleet
fills the loop. Turning it off reproduces the one-way baseline exactly, and
that equivalence is a pinned test. The reverse tests establish this narrow
give-way behavior; they do not turn the model into a validated bidirectional
traffic-control system.

Reverse travel that genuinely pays off needs real bidirectional traffic
control — zone reservation, sidings, deadlock detection — which is a route-
network phase, not a flag.

## Geometric feasibility

Vehicles are represented as points. In this abstraction, a runnable fleet must
satisfy `fleet × minGap < loopLen`. Equality is deliberately infeasible: every
vehicle would sit exactly at its minimum gap and the follow-the-leader rule
would allow no movement. Real vehicle length, braking envelopes, controls and
vendor-specific clearances are outside this early-planning model.

AGV Fleet Lab preserves an infeasible scenario as authored, but it does not
silently simulate or export fabricated KPIs for it. The UI explains the
geometry problem, validation and live simulation remain disabled, comparison
marks it as not simulated, and fleet sweeps stop at the largest size that can
fit.

## References

Standard AGV-systems engineering: Egbelu (1987) fleet-sizing estimate,
Kingman/Little queueing relations, Factory Physics variability arguments.
