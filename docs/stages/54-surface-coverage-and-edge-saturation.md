# Stage card 54-surface-coverage-and-edge-saturation: more sheet, far more edge

## Metadata

- **Authored:** 2026-08-22
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Claude Fable 5 <claude-fable-5@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier panel:** false
- **Requires GUI:** true
- **Pairing rationale:** the operator wants Claude-side quota carrying more
  of the worker load this window; Sol knows the surface line (stages 26 to
  28, 40, 41, 43, 52, 53) and flips to the verifier seat for the
  cross-family check. The verifier browser pass runs headless Chromium via
  Playwright, which needs the unsandboxed dispatch this card declares.

## Objective

Operator review of the stage-52 state (screenshot in the session log,
2026-08-22): the hybrid is "certainly getting there", but large regions
that should read as solid surface still render as sparse dust, and the
edge bands want far more points. Budget is no longer the constraint;
coverage and edge saturation are.

1. **Sheets over more of the domain.** Regions the classifier currently
   leaves to the cloud but which are genuinely periodic should carry
   sheets. Extend the shared period classification so higher-period
   components (through period 8 where classification is confident) build
   surface, not dust. Stage 53's findings
   (`docs/plans/2026-08-22-analytic-edge-curves.md`) name the blocker for
   analytic trimming as component discovery beyond the primary
   period-1/period-2 pair; numerical classification confidence is the
   coverage lever here, and any component-discovery machinery you build
   should be shaped so stage 53's tracer can consume it later.
2. **Saturate the edge bands.** Multiply the stage-52 band spend: wider
   band, more sub-cell sites per band cell, and a higher point budget, so
   silhouette edges read as a dense mist rather than speckle at review
   zoom. Live peak geometry at stage 52 was 53.4 MB against far larger
   headroom; spend it, and report where the next real ceiling is.
3. **Cost discipline, relaxed but measured.** The 8 ms median slice
   discipline holds. Maximum slice time and finalisation time may grow;
   report before-and-after figures and justify the landing point.

## Inputs (read these in your own context)

- `state/verifiers/52-surface-edge-cloud-densification.json`
- `state/verifiers/53-surface-analytic-edge-curves.json`
- `docs/plans/2026-08-21-surface-edge-cloud-densification-findings.md`
- `docs/plans/2026-08-22-analytic-edge-curves.md`
- `src/app/orbitSurface.ts`
- `src/app/orbitSurfaceCurves.ts`
- `src/app/orbit3d.ts`
- `src/app/webglRenderer.ts`
- `scripts/analyze-sheet-edges.cjs`
- `src/sims/logistic-mandelbrot/kernel.ts`
- `src/sims/logistic-mandelbrot/kernel.test.cjs`
- `docs/verification.md`

## Deliverables

1. Sheet coverage extended to confidently periodic higher-period regions
   (through period 8), driven by the shared classification, with the
   coverage gain measured (share of the window carrying surface, before
   and after, in the harness).
2. Edge-band saturation: re-tuned band width, sub-cell site count and
   point budget, with the measurement table that justifies the values in
   a findings note under `docs/plans/`.
3. `scripts/analyze-sheet-edges.cjs` extended to report surface coverage
   share alongside the existing chord, alternation and band density
   metrics.
4. Updated pure fixtures in `src/sims/logistic-mandelbrot/kernel.test.cjs`
   where the new coverage and band behaviour is testable purely.

## Constraints

- Cloud mode (the factory default) stays byte-identical; every change is
  gated behind hybrid mode.
- `buildOrbitSurface`'s public contract is unchanged; extend rather than
  rewrite.
- Chord error at or below 0.75 px and alternation at or below 0.15 remain
  the floor; do not regress either while extending coverage.
- Coverage must not overreach: a region classified with low confidence
  stays cloud. False sheet over chaotic parameter space is a worse defect
  than missing sheet, and the verifier judges this visually.
- No new dependency; no git mutations by the worker; stop cleanly on
  budget exhaustion; relative paths; UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green.
2. `node scripts/analyze-sheet-edges.cjs` meets the frozen chord and
   alternation targets, shows the surface coverage share increase and the
   band density uplift over the stage-52 figures, byte-identical across
   two runs.
3. Verifier-side headless browser check: regions that rendered as sparse
   dust at stage 52 now carry visible sheet where periodic; edge bands
   read as dense mist at review zoom (captures against the stage-52
   verifier evidence); no sheet appears over visibly chaotic regions; no
   new sparkle or shimmer during rotation.
4. Median slice time within 8 ms; maximum slice, finalisation time and
   peak geometry reported with before-and-after figures.
5. Cloud mode indistinguishable from the stage-52 state; no console or
   WebGL errors.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Wiring the stage-53 analytic tracer into tessellation (its own stage,
  after this one lands component discovery it can consume); changing the
  interior cloud outside the band; merging to dev or main; presets,
  thumbnails, other simulations.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 60 minutes

## Verifier handoff

The envelope states: how component confidence is computed and the period
range covered, the coverage share before and after, the new band
constants with their measurement table, the harness numbers, the slice
and memory figures, and the files touched.

## Family-specific notes

- **Claude (worker):** run fully headless if you open a browser at all;
  the harness and pure fixtures are the primary feedback loop. Do not
  attach to the operator's Chrome.
- **Codex (verifier):** this card declares Requires GUI so your dispatch
  is unsandboxed; use headless Chromium via Playwright against a dev
  server you start yourself, never a headed window.
