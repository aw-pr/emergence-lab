# Stage card 56-surface-analytic-curve-integration: tessellate against the true curves

## Metadata

- **Authored:** 2026-08-22
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Verifier panel:** false
- **Pairing rationale:** the operator is conserving Claude quota this
  window, so Sol (who built the stage-53 tracer) takes the worker seat;
  Opus verifies cross-family with a headless browser pass. No Requires
  GUI declaration: the Claude verifier is unsandboxed by nature and the
  Codex worker needs no browser.

## Objective

Stage 53 built and validated the analytic edge-curve tracer
(`src/app/orbitSurfaceCurves.ts`: closed-form period-1 cardioid and
period-2 circle, predictor-corrector continuation for higher periods,
traced chord error 0.038 px full window against the current mesh's
0.315 px) but stopped cleanly at integration: the finite sampler emitted
period-labelled contours outside the exact components. Stage 54 then
landed exactly the missing prerequisite, the exact component classifier
and catalogue through period 8 (`src/app/orbitSurfaceComponents.ts`),
deliberately left unconsumed. This stage joins the two: sheet boundaries
follow the analytic curves instead of the sampled contour.

1. **Trim tessellation against traced curves.** Where a sheet's component
   boundary is covered by a traced curve (period 1 and 2 closed forms,
   continuation-traced components from the catalogue), the mesh boundary
   follows the curve: boundary vertices land on it and the silhouette
   chord error against the analytic curve is at or below 0.25 px in the
   default and close review framings.
2. **Curve-distance dissolve.** The sheet-edge dissolve and the cloud-side
   band grade by true distance to the analytic curve rather than by cell
   distance to the sampled contour, removing the residual geometric
   stepping at silhouettes.
3. **Honest fallback.** Components the tracer cannot cover (beyond its
   period range or failing continuation) keep the stage-55 sampled
   behaviour unchanged; the harness reports which components are
   curve-trimmed and which fall back.

## Inputs (read these in your own context)

- `state/verifiers/55-surface-cloud-parity-and-seam-refinement.json`
- `docs/plans/2026-08-22-analytic-edge-curves.md`
- `docs/plans/2026-08-22-surface-coverage-and-edge-saturation.md`
- `docs/plans/2026-08-22-surface-cloud-parity-and-seam-refinement.md`
- `src/app/orbitSurfaceCurves.ts`
- `src/app/orbitSurfaceComponents.ts`
- `src/app/orbitSurface.ts`
- `src/app/orbit3d.ts`
- `src/app/webglRenderer.ts`
- `scripts/analyze-sheet-edges.cjs`
- `src/sims/logistic-mandelbrot/kernel.test.cjs`
- `docs/verification.md`

## Deliverables

1. Curve-trimmed tessellation for analytically covered components, wired
   through the hybrid build path.
2. Curve-distance dissolve and band grading for those components.
3. `scripts/analyze-sheet-edges.cjs` extended with silhouette chord error
   against the analytic curves and the curve-trimmed versus fallback
   component split.
4. A findings note under `docs/plans/` recording the integration design,
   the per-window chord figures, and the fallback set.
5. Updated pure fixtures in `src/sims/logistic-mandelbrot/kernel.test.cjs`
   where the trimming and grading are testable purely.

## Constraints

- Cloud mode (the factory default) stays byte-identical; every change is
  gated behind hybrid mode.
- `buildOrbitSurface`'s public contract is unchanged; extend rather than
  rewrite.
- Stage-55 cloud parity, stage-54 coverage and band figures, and the
  frozen chord (0.75 px) and alternation (0.15) floors hold everywhere;
  the 0.25 px analytic target applies where curves cover.
- The 8 ms median slice discipline holds (timer-quantum readings adjacent
  to 8.0 acceptable); the 1,199,999 triangle cap holds; report peak
  geometry.
- No new dependency; no git mutations by the worker; stop cleanly on
  budget exhaustion; relative paths; UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green.
2. `node scripts/analyze-sheet-edges.cjs` shows silhouette chord error
   against the analytic curves at or below 0.25 px for curve-trimmed
   components in the default and close windows, holds every stage-54 and
   stage-55 figure, and is byte-identical across two runs.
3. Verifier-side headless browser check: sheet silhouettes on the primary
   cardioid and period-2 circle read as smooth curves with no stepping at
   review zoom (captures against the stage-55 evidence); fallback
   components are visually unchanged from stage 55; no new sparkle or
   shimmer during rotation.
4. Median slice time within the 8 ms discipline; maximum slice,
   finalisation, peak geometry and triangle count reported with
   before-and-after figures.
5. Cloud mode indistinguishable from the stage-55 state; no console or
   WebGL errors.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Extending the tracer's period range or continuation robustness beyond
  what integration needs; merging to dev or main; presets, thumbnails,
  other simulations.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 60 minutes

## Verifier handoff

The envelope states: which components are curve-trimmed and which fall
back and why, the analytic chord figures per window, how the
curve-distance dissolve replaces cell distance, the harness numbers, the
slice and memory figures, and the files touched.

## Family-specific notes

- **Codex (worker):** the sandbox cannot reach the window server; do not
  launch a browser. The harness and pure fixtures are your feedback loop.
- **Claude (verifier):** run the browser pass fully headless; never
  attach to the operator's Chrome or open a headed window.

## Re-brief (2026-08-22, attempt 2)

Attempt 1 (committed for reference as `wip/56-attempt-1`, 02fd130) was
verified FAIL on the browser and performance clauses. The harness was
green while the live hybrid rendered no sheets at all; close the gap
between the two before anything else.

- **Defect 1, fatal:** in the live build the exception "Orbit surface
  sample was not prepared at 414,610.5" is thrown from the prepared-sample
  path and swallowed by the catch at the surface build call site
  (attempt 1's `src/app/orbit3d.ts:2723-2726`), dropping hybrid to the
  surface-allocation fallback: `orbit3dSurface` reads "fallback" and
  `orbit3dTriangles` is 0 against stage 55's 445,686. Fix the invariant,
  do not widen the catch. Every cell the analytic relabelling marks as
  sheet must have its sample prepared before tessellation consumes it.
- **Defect 2:** `prepareAnalyticIntegration` traces 49 component curves
  and relabels the whole grid in one unsliced call at the end of the
  coarse phase, a 1.9 to 5.5 second blocking slice, 48x to 137x the
  stage-55 maximum. Move the analytic work inside the sliced loop or
  chunk it under the slice budget; maximum slice must land in the
  stage-55 range.
- **Defect 3:** refined cells hit the 32,768 `ORBIT_SURFACE_REFINEMENT_
  CELL_BUDGET` ceiling (stage 55 used about 6,250). Curve-trimmed
  boundaries must not blow the refinement budget; if trimming reduces the
  need for refinement, spend less, not more.
- **Harness gap, required deliverable:** the harness passed while the
  live path threw. Extend `scripts/analyze-sheet-edges.cjs` (or a pure
  fixture) to execute the same prepared-sample invariant the live
  tessellation relies on, so a regression of defect 1 fails in the
  worker's own loop. The findings note must carry measured after columns
  for slice, finalisation, peak geometry and triangle count.
- Start from the WIP commit; the curve tracing and the 0.25 px analytic
  chord figures stand. All original criteria and the stage-54/55
  baselines stand unchanged.

## Re-brief (2026-08-22, attempt 3)

Attempt 2 (committed as `wip/56-attempt-2`, 67ef4e7) fixed the slicing
(defect 2 confirmed gone: max slice 36.3 ms) but re-briefed defect 1
persists identically and the worker seat moves to Terra for fresh eyes.

- **The persisting fatal defect:** the live hybrid still throws "Orbit
  surface sample was not prepared at 414,610.5" and drops to the
  sheetless surface-allocation fallback (0 triangles against stage 55's
  445,023). The verified call path: `preparedSample`
  (`src/app/orbit3d.ts:2050`) via `locateOrbitSurfaceTransition`
  (`src/app/orbitSurface.ts:188`), `vertexAtTransition` (:671),
  `appendTriangle` (:562), `appendBaseTriangle` (:531), `appendBaseQuad`
  (:511), from `buildOrbitSurface`. Note the half coordinate: the
  transition locator queries samples at positions between cell corners.
  Preparation must cover every lookup the transition locator can perform
  along analytic boundaries, not only the corner lattice.
- **Reproduce before fixing, in your own loop.** `buildOrbitSurface` is
  pure, so this throw is reachable without a browser. First deliverable
  of the attempt: a pure fixture or harness case that calls the surface
  build through the same configuration the live default framing uses
  (analytic integration on, live grid resolution and window) and throws
  exactly this error against the `wip/56-attempt-2` tree. Only then fix
  it and show the same case passing. Attempt 2 added a "strict
  lookup-only" check that passes while the live path throws; that check
  is not covering the transition-locator lookups, which is the gap.
- **Refinement spend:** refined cells rose 6,214 to 8,814 against the
  re-brief's "spend less, not more". Land at or below the stage-55
  figure.
- **Findings honesty:** "verifier to measure" placeholders are a
  deliverable failure. Everything pure-computable must carry measured
  numbers in the note: triangle count, refined leaves and geometry bytes
  from the pure build at the live configuration. Only the browser timing
  columns (slice, finalisation) may be marked for verifier measurement.
- Start from `wip/56-attempt-2`; the slicing work and the analytic chord
  figures stand. All original criteria and baselines stand unchanged.
