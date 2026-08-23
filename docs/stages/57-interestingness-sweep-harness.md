# Stage card 57-interestingness-sweep-harness: extend the sweep to the uncovered kernels

## Metadata

- **Authored:** 2026-08-23
- **Base branch:** `dev`
- **Run branch:** `autometta/57-interestingness-sweep-harness`
- **Revised:** 2026-08-23 (rescoped: the harness this card asked for already exists)
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Worker effort:** high
- **Verifier effort:** medium
- **Verifier panel:** false
- **Pairing rationale:** the sweep configs and their metric deltas are
  well-specified TypeScript, which is Terra's strength and bills the Codex pool
  rather than the Claude subscription. The verifier is Sonnet 5 rather than the
  usual Fable: Fable quota is the scarce one this week (~20% remaining against
  ~45% on the general pool), and the gate here is numeric — metric deltas and a
  green `npm run verify` — so it does not need the aesthetic tier. The one
  genuinely aesthetic judgement, whether a promoted preset is *actually* more
  interesting, is escalated to the operator rather than decided by the
  verifier. See "Escalation" below.

## Objective

Extend the existing interestingness sweep to kernels it does not yet cover, and
promote any winning regimes into presets with their metric deltas recorded.

**Read this before planning.** The original form of this card asked for
Playwright to be installed and a sweep harness to be built. Both already exist
and are committed on `dev`; that work landed across stages 31 and the
2026-08-13/16 sweeps. Building a second harness is the main failure mode
available here. What exists:

- `playwright.config.ts` — headless, `baseURL` `localhost:5173`, `webServer`
  starts `npm run dev`, 180s per-test timeout.
- `e2e/harness/driver.ts` — page-side kernel driver, imports the real registry.
- `e2e/harness/metrics.ts` — entropy, variance, spatial autocorrelation,
  coverage, temporal flux, and the composite `interestingness`.
- `e2e/harness/sims.ts` — `SWEEP_CONFIGS`, the per-sim `SimSweepConfig` data.
- `e2e/harness/report.ts` — PNG encoder and markdown table writer.
- `e2e/sweep.spec.ts` — one opt-in `sweepTest` per config, gated on `SWEEP=1`.

Six configs exist: `gray-scott`, `boids`, `lorenz-attractor`, and the three
`clifford-dejong-*` variants. Their artefacts are under `e2e/artifacts/<slug>/`
and their write-ups under `docs/sweeps/`. Nineteen kernel directories have no
sweep config at all. That gap is this stage.

## Inputs (read these in your own context)

- `e2e/harness/sims.ts`
- `e2e/harness/metrics.ts`
- `e2e/harness/driver.ts`
- `e2e/harness/report.ts`
- `e2e/sweep.spec.ts`
- `playwright.config.ts`
- `docs/sweeps/gray-scott-interestingness.md`
- `docs/sweeps/clifford-dejong-interestingness.md`
- `src/app/presets.ts`
- `src/app/registry.ts`
- `state/verifiers/15-boids-density-motion-tuning.json`
- `src/sims/lenia/kernel.ts`
- `src/sims/belousov-zhabotinsky/kernel.ts`
- `src/sims/physarum/kernel.ts`
- `src/sims/swarmalators/kernel.ts`

## Deliverables

1. Four new `SimSweepConfig` entries in `e2e/harness/sims.ts` — `lenia`,
   `belousov-zhabotinsky`, `physarum`, `swarmalators` — each with its
   `primaryChannel`, grid, warmup, `fluxGap`, `coverageThreshold`, swept axes,
   and a `references` list mirroring that sim's shipped presets so a re-run
   reproduces their scores. Follow the `GRAY_SCOTT` entry as the pattern.
2. One `sweepTest` per new config in `e2e/sweep.spec.ts`, matching the existing
   form and staying behind the `SWEEP` env gate.
3. Sweep artefacts under `e2e/artifacts/<slug>/` for each new sim: the frame
   PNGs and a `report.md` in the existing table format.
4. A write-up per new sim under `docs/sweeps/<slug>-interestingness.md`,
   recording the axes searched, sets evaluated, sets skipped, and the ranked
   candidates against the shipped references.
5. Promotions into `src/app/presets.ts` for any candidate that beats its
   incumbent, each carrying the established delta comment form
   (`// Promoted by the 2026-08-23 interestingness sweep (0.481 → 0.740):`).
   Where the win is a judgement call, promote nothing and follow Escalation.
6. The owed live-browser smoke recorded in the stage notes: DLA fill ~0.25,
   sandpile on Ultra, boids 5k–12k flocking feel.

## Constraints

- **Do not re-scaffold the harness.** Playwright is installed
  (`@playwright/test ^1.60.0`) and `e2e/` exists. Extend `SWEEP_CONFIGS`; do not
  add a second driver, a second metrics module, or a competing spec file. If a
  metric genuinely needs to change, say so in the write-up and leave the
  existing metric alone — changing it silently invalidates every recorded score.
- **Headless only.** Per `templates/` policy (autometta `7c7f22b`, verifier
  browser checks must run headless), the suite must not require a visible
  browser. This card runs unattended inside the overnight window with the lid
  closed; anything needing a display will produce nothing.
- **Unattended.** No step may wait on operator input. Where a judgement is
  needed, record it and continue — see Escalation.
- **Reproducibility is the harness contract.** Kernels are pure deterministic
  numerics: same params plus same step count gives an identical field. Any
  metric that does not reproduce across two runs of the same parameter set is a
  harness bug, not a property of the sim.
- **Cap the search.** Use a documented number of parameter sets per sim rather
  than an open grid, and log how many were evaluated and how many skipped. A
  silent truncation that reads as full coverage is worse than a smaller sweep
  that says so.

## Acceptance criteria

1. `npm run verify` green: 347 kernel tests, types, production build.
2. `SWEEP=1 npx playwright test` runs headless start to finish with no display,
   including the four new configs.
3. Re-running one parameter set reproduces its four metric scores exactly.
4. Every new sim has a `docs/sweeps/` write-up stating sets evaluated and
   skipped.
5. Either at least one promoted preset with its metric delta written down, or a
   recorded escalation explaining why no candidate beat its incumbent outright.
6. The owed live-browser smoke is recorded.

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the existing `metrics harness rewards structure over
  washout` test must still pass unmodified — it is the guard that a metrics
  change has not inverted the scoring.

## Out of scope

- The static-render kernels — `mandelbrot`, `julia-set`, `burning-ship`,
  `fractal`, `markus-lyapunov`, `logistic-mandelbrot`,
  `elementary-cellular-automata`. They converge to a fixed image, so temporal
  flux is meaningless and the composite metric does not rank them meaningfully.
  Scoring them needs a different metric set, which is its own stage.
- The remaining dynamic kernels not named in Deliverables
  (`abelian-sandpile`, `brians-brain`, `cyclic-ca`, `game-of-life`,
  `ising-model`, `diffusion-limited-aggregation`, `kuramoto-oscillators`,
  `particle-life`). They are the natural next stage; leave them uncovered here
  rather than exceeding the budget.
- Changing the composite metric or its weights.
- Merging to `dev` or `main`; deploys; thumbnails.

## Budget

- **Worker wall-clock:** 180 minutes
- **Verifier wall-clock:** 60 minutes

## Escalation

The verifier decides the numeric gate only. Where the sweep's top-scoring
regime is a judgement call — the metrics rank it highest but it may not
actually look better — the worker writes both the incumbent and the candidate
into the promotion notes with their metric deltas and leaves the incumbent in
place. The operator picks. Do not let a metric silently replace a preset that
a human chose.

## Verifier handoff

Re-run `npm run verify` and `SWEEP=1 npx playwright test`, confirm the recorded
scores reproduce for one parameter set per new sim, and check each write-up
states its evaluated and skipped counts. Judge the numbers only; leave the
aesthetic call to the operator per Escalation.

## Family-specific notes

- All 23 kernels live under `src/sims/<name>/kernel.ts`; each exposes a
  `paramSchema` that the renderer turns into controls automatically.
- The compute grid is decoupled from the display canvas (quality presets set
  cell counts); resizing the window does not reseed a sim.
- Netlify deploys from `origin/main`, so nothing here is live until merged.
  Work on the run worktree as usual; do not push to `main`.
- Stages 15 (`boids-density-motion-tuning`) and 16 (`sandpile-larger-slower`)
  are recorded `verifier_failed` and `stalled` and touch boids and sandpile
  parameters. Stage 15's artefact is at
  `state/verifiers/15-boids-density-motion-tuning.json`; stage 16 has no
  artefact on disk. Read 15 before touching boids so this sweep does not
  re-promote a regime that already failed a browser check.
- Originally sourced from `token-maxing/kickoffs/emergence-interestingness-sweep.md`.
