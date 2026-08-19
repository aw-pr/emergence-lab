# Stage card 40-logistic-mandelbrot-edge-analysis: classify the sheet-edge sawtooth and measure refinement payoff

## Metadata

- **Authored:** 2026-08-19
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Sol continues the hybrid-surface line it built in
  stages 26 to 28 and does the pure-Node measurement work its sandbox is suited
  to; a cross-family frontier Claude verifier independently re-runs the
  harness, drives the browser for the diagnostic captures the sandboxed worker
  cannot take, and audits whether the evidence actually supports the
  classification.

## Objective

Stage 28 landed contour-following sheet edges and verified 9/9, but operator
visual review judged the result not yet publishable: a regular sawtooth of
small triangular nicks runs along bulb silhouettes, and the sheet stops dead
at chaos onset instead of dissolving into the point cloud. Before any further
implementation stage, characterise the residual error so the fix is chosen on
evidence rather than guessed. This stage answers three questions from
`docs/plans/2026-07-20-logistic-mandelbrot-edge-transition-next-steps.md`:

1. **Classify the sawtooth.** Is it geometric (silhouette vertex positions
   alternating around the true contour) or shading (normals and edge fades at
   trimmed vertices disagreeing with the interior)? Measure it numerically and
   make it visible with diagnostic render modes.
2. **Measure boundary complexity against refinement depth.** Find where extra
   refinement depth stops paying, as the empirical basis for an error-driven
   adaptive raster versus a deeper fixed depth.
3. **Specify stage 41.** Turn the findings into one concrete implementation
   scope, including the sheet-to-cloud dissolve-band design.

This is an analysis stage. Its deliverable is evidence and a decision, plus
the minimal instrumentation needed to gather that evidence. It must not
attempt the fix itself.

## Inputs (read these in your own context)

- `docs/plans/2026-07-20-logistic-mandelbrot-edge-transition-next-steps.md` (the operator verdict and analysis brief this card executes)
- `docs/stages/28-logistic-mandelbrot-contour-edges.md` (the state this builds on)
- `src/app/orbitSurface.ts`
- `src/app/orbit3d.ts`
- `src/app/webglRenderer.ts`
- `src/sims/logistic-mandelbrot/model.ts`
- `src/sims/logistic-mandelbrot/kernel.test.cjs`
- `docs/verification.md`

Do not read unrelated simulations unless a shared API makes that necessary.

## Deliverables

1. `scripts/analyze-sheet-edges.cjs` - a deterministic Node harness, no
   browser, importing the pure builder from the compiled test build. For a
   fixed set of at least two c-plane windows (the full default window and one
   named bulb close-up covering a period-2 or period-4 silhouette), it builds
   the surface at boundary refinement depths 1 to 4, extracts the contour
   silhouette vertices, compares each against a dense fixed-step bisected
   reference contour, and reports per depth and window: boundary segment
   count, refined-cell count, mean and maximum deviation from the reference
   contour expressed as a fraction of a coarse cell, and an alternation
   metric (sign-flip rate of consecutive silhouette-vertex residuals along
   the contour - the geometric signature of the sawtooth). Output is a
   human-readable table plus a JSON block, byte-identical across two runs.
   If `buildOrbitSurface` needs an optional refinement-depth override
   parameter to make this possible, add it defaulting to the current exported
   constant so existing callers are untouched.
2. Diagnostic render modes in `src/app/orbit3d.ts` / `src/app/webglRenderer.ts`:
   flat-colour (uniform albedo, no lighting, no edge fade) and
   normals-as-colour shading for the sheet only, reachable through existing
   debug or URL-flag plumbing, default off, published in a canvas data
   attribute so the verifier can assert the active mode. With the toggle off,
   built hybrid geometry and shading are unchanged.
3. `docs/plans/2026-08-19-edge-analysis-findings.md` - the findings:
   - the sawtooth classification (geometric, shading, or both), with every
     claim traceable to a harness number or a named verifier capture;
   - the depth-payoff table and a stated depth beyond which deviation gain
     per added cell collapses;
   - a recommendation among error-driven pixel-budget refinement, deeper
     fixed depth, and trimmed-polygon tessellation regularisation with
     boundary-vertex height smoothing - or a stated combination;
   - a sheet-to-cloud dissolve-band design driven by distance-to-contour
     data the build already produces, covering interaction with the existing
     edge-fade rings and with opaque mode depth writes;
   - a concrete stage-41 scope: named criterion, exported budget constants,
     and the files to touch.

## Constraints

- `Cloud` remains the exact factory default with unchanged budgets, ordering,
  shader path, and visible behaviour.
- With the diagnostic toggle off, hybrid output is byte-identical: assert in
  the pure tests that the builder produces identical geometry to the
  pre-stage output for an unchanged input grid.
- The harness and any builder extension are deterministic pure functions of
  their inputs; no wall-clock, no randomness.
- Keep the 8 ms time-sliced build untouched.
- No new dependency. Do not commit anything under `.cache/`.
- Do not fix the sawtooth or implement the dissolve band in this stage.
- Worker must not run `git add`, `git commit`, or any git mutation. The dirty
  worktree plus final handoff envelope is the deliverable.
- If the full stage cannot be completed inside the worker budget, stop
  cleanly, preserve the best coherent partial result, and report every
  unfinished item in the handoff envelope rather than waiting for input.
- Use relative paths in committed files. UK English, no em dash.

## Acceptance criteria

The verifier will check every criterion. Any unmet criterion is a stage failure.

1. `node scripts/analyze-sheet-edges.cjs` completes on the verifier's machine
   and prints the per-depth, per-window table; a second run is byte-identical.
2. The findings doc commits to exactly one classification of the sawtooth and
   cites the alternation metric plus at least one flat-colour and one
   normals-as-colour capture in support; no claim in the doc lacks a number
   or named capture behind it.
3. Verifier-side Playwright captures a bulb silhouette close-up in normal,
   flat-colour, and normals-as-colour modes; the captures visibly support the
   committed classification (nicks present in flat colour implies geometric;
   nicks only under lighting implies shading).
4. With the diagnostic toggle off, pure tests prove built hybrid geometry is
   identical to the pre-stage builder output, and the canvas data attribute
   reports the diagnostic mode off by default.
5. The depth-payoff table covers depths 1 to 4 for both windows, and the
   findings doc states where extra depth stops paying with reference to it.
6. The stage-41 recommendation is concrete enough to card without further
   analysis: named approach, criterion, budget constants, files to touch, and
   the dissolve-band design addresses edge-fade and opaque-depth interaction.
7. `npm run verify` is green.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Fixing the sawtooth; implementing the dissolve band or any transition
  geometry.
- Merging or rebasing against `dev`; touching presets, thumbnails, or
  `docs/INTERFACE.md`.
- Any change to `Cloud` mode or to hybrid visuals with the diagnostic
  toggle off.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 45 minutes

## Verifier handoff

The worker's handoff envelope must state: the harness output summary (the
per-depth table for both windows), the committed classification and the
numbers behind it, the refined-cell share observed, how to activate each
diagnostic mode, and the list of files touched. The verifier re-runs the
harness, takes the three captures, and audits the findings doc against the
evidence rather than re-deriving the analysis.

## Family-specific notes

- **Codex (worker):** the sandbox cannot reach the window server; do not
  attempt to launch a browser, Playwright included. All worker-side evidence
  comes from the Node harness and pure tests. Browser captures are
  verifier-side only.
