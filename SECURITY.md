# Security

## What this project is, in security terms

AGV Fleet Lab is a static browser application. It has no backend, no
authentication, and no telemetry, and it contacts no external service at
runtime — the simulation runs entirely in the page, and scenarios are stored in
the browser's own `localStorage`. (The only request the app makes at all is the
same-origin dynamic `import()` that lazy-loads the PDF report chunk.) Nothing
is transmitted anywhere, so there is no server to compromise and no account or
credential to steal.

That leaves a small but real surface:

- **Dependencies.** `npm audit` runs as the first step of `npm run check:all`
  and as its own step in CI, on both production and development dependencies.
- **Untrusted input.** The one place attacker-controlled data enters is a
  restored JSON backup or a hand-edited `localStorage` value. Both are routed
  through `sanitizeScenarioParams` / `sanitizeState` in `src/lib/sanitize.ts`,
  which is the single validator for storage load and file import alike, and
  which caps field lengths so a crafted file cannot stall the UI. A bypass of
  that validator, or a way to get script execution out of an imported file,
  is a genuine vulnerability.
- **Build and CI supply chain.** Workflow actions are pinned by commit SHA in
  `.github/workflows/ci.yml`.

The exports (CSV and PDF) are generated in the browser and handed to the user's
own download; the app never uploads them.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** — the "Report a
vulnerability" button under this repository's *Security* tab. That keeps the
report private until a fix exists.

**If you do not see that button, the feature has not been switched on yet.** In
that case, open a normal issue saying only that you have found a security
problem and would like a private channel — no details, no proof of concept —
and wait to be contacted. This project has no published security contact
address, and this file will not invent one.

There is no formal response-time commitment. This is a single-maintainer
educational project maintained in spare time; treat any timeline as best
effort.

## Scope

In scope: anything that lets a crafted scenario file or storage value execute
script, escape the sanitizer, or corrupt another scenario; dependency
vulnerabilities reachable from the shipped bundle.

Out of scope: the accuracy of the simulation results. Wrong or misleading
numbers are correctness bugs — open a normal issue. The tool is explicitly
educational/early-planning and is not a substitute for a full DES study or
vendor sign-off, so a modelling limitation is not a security issue.
