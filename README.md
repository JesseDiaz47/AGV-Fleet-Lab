# AGV Fleet Lab

[![CI](https://github.com/JesseDiaz47/AGV-Fleet-Lab/actions/workflows/ci.yml/badge.svg)](https://github.com/JesseDiaz47/AGV-Fleet-Lab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Last Commit](https://img.shields.io/github/last-commit/JesseDiaz47/AGV-Fleet-Lab)](https://github.com/JesseDiaz47/AGV-Fleet-Lab/commits/main)

AGV fleet-sizing tool: sizes a one-way-loop AGV fleet analytically, then
**validates the answer with a discrete-event simulation** — congestion,
blocking, station queues, battery/charging, structured demand, dispatch
rules, and shift profiles.

![A simulated AGV fleet running the one-way loop: vehicles picking up, dropping off, charging, and queueing at stations](https://raw.githubusercontent.com/JesseDiaz47/AGV-Fleet-Lab/main/docs/media/live-sim.gif)

Built by Jesse Diaz. Educational/planning-grade tool — not a substitute for a
full DES study (Plant Simulation / FlexSim / AnyLogic) or vendor sign-off. All
default numbers are fictional examples.

This is the **v2 rebuild**: Vite + React + TypeScript, named scenarios,
scenario comparison, and CSV/PDF export. It grew out of an earlier
single-file, zero-setup version of the same tool, which is kept privately as
an offline handout artifact.

## What it does

Everything below is the app running on its default scenario — 40 jobs/hr around
a 400 m loop with 6 stations. The numbers are fictional, the behavior is not.

### 1. Size the fleet, then check the math against a simulation

The analytic pass is a napkin estimate: cycle time, capacity per vehicle, a
derate for availability and charging. It says **6 vehicles**. The seeded
simulation then runs that scenario for an 8-hour batch and reports what
actually happened — here 5 vehicles already hold demand at 69% utilization, so
the analytic derate was conservative.

39.12 jobs/hr against a nominal 40 jobs/hr counts as holding because the
verdict is judged against the load the run actually offered, not against the
nominal rate. [How "meets demand" is decided](#how-meets-demand-is-decided)
sets out the arithmetic and what it does not license.

![Analytic estimate card showing 6 vehicles required, next to a simulation validation card reporting 39.12 jobs/hr at 69% utilization](https://raw.githubusercontent.com/JesseDiaz47/AGV-Fleet-Lab/main/docs/media/01-analytic-validate.png)

### 2. Sweep every fleet size to find the knee

Each fleet size is simulated and plotted against demand. The knee is the
smallest fleet that meets demand; past it, throughput flattens while extra
vehicles just add congestion.

![Fleet-size sweep: throughput curve flattening against the demand line, blocked-share panel below, and a table of per-fleet results with fleet 5 highlighted](https://raw.githubusercontent.com/JesseDiaz47/AGV-Fleet-Lab/main/docs/media/03-sweep.png)

### 3. Compare scenarios side by side

Named scenarios are versioned records, so a comparison is a real diff rather
than a re-typed guess. Dropping from 5 vehicles to 3 costs 8 jobs/hr — and
takes p95 flow time from 615 s to 6,161 s.

![Comparison table of two scenarios: fleet 5 meets demand at 39.1 jobs/hr, fleet 3 fails at 31.2 jobs/hr with a p95 flow time ten times worse](https://raw.githubusercontent.com/JesseDiaz47/AGV-Fleet-Lab/main/docs/media/04-compare.png)

### 4. Export for design review

CSV for the sweep table, and a PDF report carrying the scenario inputs, both
model results, and the plain-English verdict — so a reviewer never has to open
the app.

![Design-review export panel](https://raw.githubusercontent.com/JesseDiaz47/AGV-Fleet-Lab/main/docs/media/05-export.png)

▶ **[Full walkthrough (27s, silent MP4)](docs/media/tour.mp4)** — the whole
flow above, end to end.

<details>
<summary>The full interface in one shot</summary>

![The complete AGV Fleet Lab interface: scenario list and parameter form on the left, live track view and results on the right](https://raw.githubusercontent.com/JesseDiaz47/AGV-Fleet-Lab/main/docs/media/00-overview.png)

</details>

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
npm run audit        # production + development dependency audit
npm run check         # typecheck + lint + test + build, in that order
npm run check:all     # audit + check + browser verification
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module layout and the
invariants a change has to preserve, and [CONTRIBUTING.md](CONTRIBUTING.md) for
how to work on it. Security reporting is covered in [SECURITY.md](SECURITY.md).

### Continuous integration

Every push and pull request runs two jobs:

- **`verify`** — `npm audit`, then `npm run check` (typecheck → lint → test →
  build). This is the gate that has to be green.
- **`browser-smoke`** — gated behind `verify` with `needs:`, so a failing gate
  never pays for a Chromium install. Installs Chromium, builds, and runs
  `npm run verify` against a real `vite preview`.

`browser-smoke` uploads `verify-desktop.png` and `verify-mobile.png` as run
artifacts on **every** run, passing or failing — so a reviewer can see what the
app actually rendered at both widths without checking the branch out.

Regenerating the README media (after a build):

```bash
node capture.js        # drives the app, writes docs/media/*.png + raw/tour.webm
./tools/make-media.sh  # ffmpeg: raw capture -> live-sim.gif + tour.mp4
```

## Scope (v2, current)

- Single-loop guide path (multi-node route networks are a future phase).
- Structured (weighted) station demand, not just uniform random O-D.
- Selectable dispatch rules (nearest-vehicle, first-idle FCFS, longest-idle vehicle).
- Shift / time-of-day demand profiles.
- Named, versioned scenarios with side-by-side comparison.
- CSV export and a design-review PDF report.

## How "meets demand" is decided

The default scenario reports 39.12 jobs/hr against a nominal demand of 40
jobs/hr and still says the fleet holds. That is not a rounding argument, and it
is not a claim that 39.12 satisfies a requirement for 40. Three different rates
are in play, and the verdict compares two of them.

**Nominal demand rate** — the 40 jobs/hr you type in. It is the *mean* of a
Poisson arrival process, not a delivery schedule.

**Realized offered rate** — the jobs that actually arrived during the measured
window, divided by that window. Arrivals are drawn from the process, so a
finite run is a finite sample: an 8-hour window at 40 jobs/hr expects about 320
arrivals with a standard deviation of √320 ≈ 18, which is a standard deviation
of roughly **2.2 jobs/hr** (±5.6%) on the rate. Measured across seeds 1–60 on
the default scenario, the realized rate ran from 35.5 to 46.5 jobs/hr (mean
39.9, sd 2.35) — as predicted. Seeds 42/43 happen to land low, at 39.06. The
validation card shows this as "(offered …)" beside throughput.

**Completed throughput** — post-warm-up completions divided by the measured
window. This is the headline jobs/hr.

Each repetition passes when both of these hold:

```
throughput ≥ 0.98 × that repetition's realized offered rate
end-of-run pending backlog ≤ max(8, backlog at end of warm-up + 5)
```

Throughput is scored against the work the run was *given* because a fleet
cannot complete jobs that never arrived; scoring it against the nominal 40
would penalise it for the arrival sample. The backlog clause is what stops a
fleet from passing while quietly falling behind: the 2% slack in the first test
would otherwise be satisfied indefinitely by a fleet running 2% short, whose
queue grows without bound. Requiring the end-of-run backlog to stay near where
it stood at the end of warm-up catches exactly that case.

A batch is `REPS` repetitions and **every one must pass** — `avgStats` computes
`met` as `list.every(...)`, so one bad repetition fails the batch. The reported
KPIs are the mean across repetitions (counts, such as stranded vehicles, are
summed instead).

### What this supports, and what it does not

It supports: *at this fleet size, on these seeds, the system kept up with the
load it was offered and did not build a backlog, in every repetition.*

It does **not** support: *5 vehicles deliver 40 jobs/hr.* With `REPS = 2` the
sampling error on the mean is still around 1.6 jobs/hr, and 39.12 is a point
estimate from two seeds — not a capacity guarantee, and not evidence about a
deterministic 40-jobs/hr requirement. Defending a hard number means more
repetitions, longer runs, a spread of seeds, and a margin someone is willing to
underwrite. That is a full DES study, which this tool is explicitly not.

Reproducibility: repetition *r* of a batch runs on seed `scenario.seed + r`,
defined once as `repSeed()` in `src/lib/engine/sim.ts` and shared by validation,
the sweep, comparison and the on-screen seed list. One consequence worth
knowing: two scenarios whose seeds differ by less than `REPS` share a
repetition.

## Model boundary: the loop is one-way

Every supported result assumes a **single one-way loop**. That assumption makes
the model tractable: vehicles follow the leader, nobody passes, and ordinary
traffic has no opposing flow to create a head-on deadlock. This is not a
universal safety guarantee. The requested fleet must fit the loop, and vehicles
returning from the charge/park spur must merge into a real gap. Both conditions
are enforced before the engine reports simulated results. The Egbelu-style
analytic first pass assumes the same one-way layout.

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

Split by how much of each source the code actually uses. Bibliographic details
were checked against Crossref (for the DOIs) and the publishers' own pages (for
the books); where a field could not be verified it is omitted rather than
guessed.

### Methods this tool implements

**Egbelu, P. J.** "The use of non-simulation approaches in estimating vehicle
requirements in an automated guided based transport system." *Material Flow*,
vol. 4, 1987, pp. 17–32.
[Indexed record](https://www.semanticscholar.org/paper/f6706a695a8382ab5c6dbddf9a03fba3430d632f)
— no DOI is registered for this article, and the title is reproduced as
indexed. `engine/analytic.ts` follows this style of first pass: expected loaded
plus empty travel around a one-way loop and fixed handling time give a cycle
time and a per-vehicle rate; demand divided by that rate, then by an
availability × charging × utilization derate, gives the vehicle count.
**This is a first pass in that style, not a validated reproduction** — no
numerical comparison against the paper's own results has been carried out, and
none is claimed.

**Law, Averill M.** *Simulation Modeling and Analysis*, 5th ed. McGraw-Hill
Education, 2015. The discrete-event practice in `engine/sim.ts` and
`lib/prng.ts`: warm-up truncation before statistics are collected (`WARMUP`),
several independent replications instead of one long run (`REPS`, `avgStats`),
common random numbers through a separate stream per stochastic process
(`rngArr` / `rngSvc`), and inverse-transform sampling for exponential
inter-arrival and symmetric triangular handling times.

### Background — how results are read, not formulas in the code

Neither relation below appears as an equation anywhere in this repository.

**Kingman, J. F. C.** "The single server queue in heavy traffic." *Mathematical
Proceedings of the Cambridge Philosophical Society*, vol. 57, no. 4, 1961,
pp. 902–904. [doi:10.1017/S0305004100036094](https://doi.org/10.1017/S0305004100036094)
— why waiting time runs away as utilization approaches 1, and why variability
rather than average load drives it. That is the shape of the p95 flow-time
column in the sweep.

**Little, J. D. C.** "A Proof for the Queuing Formula: L = λW." *Operations
Research*, vol. 9, no. 3, 1961, pp. 383–387.
[doi:10.1287/opre.9.3.383](https://doi.org/10.1287/opre.9.3.383) — the
backlog / throughput / flow-time relationship the reported KPIs should be read
against.

**Hopp, Wallace J., and Mark L. Spearman.** *Factory Physics*, 3rd ed. Waveland
Press, 2008. The variability arguments behind the gap between the analytic
first pass and the simulated result.

### Third-party algorithms

**mulberry32** — Tommy Ettinger, released into the public domain
([reference implementation](https://gist.github.com/tommyettinger/46a874533244883189143505d203312c)).
The simulation's PRNG in `lib/prng.ts`.

**sfc32** (Small Fast Counting) — a generator design by Chris Doty-Humphrey,
author of the PractRand test suite. Backs the `createRng` substream factory in
`lib/prng.ts`.
