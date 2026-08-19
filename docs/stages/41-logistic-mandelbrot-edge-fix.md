# Stage card 41-logistic-mandelbrot-edge-fix: sub-pixel regular silhouettes and the sheet-to-cloud dissolve band

## Metadata

- **Authored:** 2026-08-19
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Sol implements its own stage-40 recommendation with
  the harness it built as the feedback loop; a cross-family Claude verifier
  re-runs the harness, checks the frozen numeric targets, and judges the
  silhouettes and dissolve visually in the browser, which the sandboxed
  worker cannot do.

## Objective

Implement the stage-40 recommendation recorded in
`docs/plans/2026-08-19-edge-analysis-findings.md` (commit `0c08e51`). The
sawtooth was classified geometric: silhouette vertices alternate sides of the
true contour at a rate that deeper fixed refinement does not reduce. Fix it
with the combination the findings specify, and add the sheet-to-cloud
dissolve band designed there:

1. **Error-driven refinement.** Split a boundary cell only while its
   projected bisected contour differs from the emitted polygon edge by more
   than the pixel budget, up to the depth and cell caps.
2. **Tessellation regularisation.** Join the two transition points in each
   trimmed half-quad with a consistent diagonal, and smooth equal-period,
   equal-rank boundary heights along each contour chain.
3. **Dissolve band.** On the chaotic side of the contour, feather sheet
   opacity to zero over distance-to-contour while the point cloud carries
   the region, per the findings' design, interacting correctly with the
   existing edge-fade rings and with opaque-mode depth writes.

## Inputs (read these in your own context)

- `docs/plans/2026-08-19-edge-analysis-findings.md` (the specification this card implements)
- `docs/stages/40-logistic-mandelbrot-edge-analysis.md`
- `src/app/orbitSurface.ts`
- `src/app/orbit3d.ts`
- `src/app/webglRenderer.ts`
- `scripts/analyze-sheet-edges.cjs`
- `src/sims/logistic-mandelbrot/kernel.test.cjs`
- `docs/verification.md`

Do not read unrelated simulations unless a shared API makes that necessary.

## Deliverables

1. `src/app/orbit3d.ts` - export the four budget constants exactly as the
   findings specify: `ORBIT_SURFACE_EDGE_ERROR_PX = 0.75`,
   `ORBIT_SURFACE_MAX_REFINEMENT_DEPTH = 4`,
   `ORBIT_SURFACE_REFINEMENT_CELL_BUDGET = 32768`,
   `ORBIT_SURFACE_DISSOLVE_BAND_CELLS = 2.5`; drive the adaptive boundary
   refinement from the screen-space error criterion inside the existing 8 ms
   time-sliced build; feed distance-to-contour data to the dissolve band.
2. `src/app/orbitSurface.ts` (pure builder) - consistent-diagonal trimmed
   half-quad tessellation and contour-chain boundary-height smoothing
   restricted to equal-period, equal-rank vertices; deterministic; interior
   geometry away from the contour band unchanged.
3. `src/app/webglRenderer.ts` / shader - the dissolve band: sheet opacity
   feathers to zero across `ORBIT_SURFACE_DISSOLVE_BAND_CELLS` on the
   chaotic side, in both glass and opaque modes; in opaque mode the
   feathered region must not write depth in a way that reintroduces sorting
   artefacts; existing edge-fade rings compose rather than double-fade.
4. `src/sims/logistic-mandelbrot/kernel.test.cjs` - extended pure fixtures:
   the stage-28 synthetic boundaries now assert the regularised
   tessellation (no alternating diagonal pattern, smoothed chain heights),
   determinism across a double build, no cracks, finite unit-length
   normals, in-range indices, and unchanged geometry for a uniform
   all-period-1 grid.
5. `scripts/analyze-sheet-edges.cjs` - extend to report the alternation rate
   of the new builder at the fixed verifier camera so criterion 2 is
   checkable from the command line; keep byte-identical determinism.

## Constraints

- `Cloud` remains the exact factory default with unchanged budgets, ordering,
  shader path, and visible behaviour.
- Interior sheet geometry away from the contour band is unchanged; sheet
  selection semantics are unchanged.
- The triangle cap is unchanged; the refinement cell budget is the exported
  32,768 constant; keep the 8 ms time-sliced build and report refined-cell
  share, median and maximum slice time, and finalisation time in the handoff.
- Changing only opacity must still redraw without rebuilding;
  `orbit3dBuildKey` still excludes `surfaceOpacity`.
- All builder logic is deterministic. No new dependency. Do not commit
  anything under `.cache/`.
- The stage-40 diagnostic modes must still work and default off.
- Worker must not run `git add`, `git commit`, or any git mutation. The
  dirty worktree plus final handoff envelope is the deliverable.
- If the full stage cannot be completed inside the worker budget, stop
  cleanly, preserve the best coherent partial result, and report every
  unfinished item in the handoff envelope rather than waiting for input.
- Use relative paths in committed files. UK English, no em dash.

## Acceptance criteria

The verifier will check every criterion. Any unmet criterion is a stage failure.

1. `npm run verify` is green and the extended pure fixtures pass.
2. **Sub-pixel regular silhouette (the frozen stage-40 targets):**
   `node scripts/analyze-sheet-edges.cjs` reports, at the fixed verifier
   camera and viewport, every accepted contour segment with screen-space
   chord error at or below 0.75 px and an alternation rate at or below
   0.15; a second run is byte-identical.
3. Verifier-side flat-colour capture of the stage-40 bulb close-up shows no
   alternating triangular notch above 1 px; compared against the stage-40
   captures `40-bulb-flat-colour.png`, the sawtooth is visibly gone.
4. The dissolve band: sheets feather into the point cloud over the band
   width on the chaotic side in glass mode, and in opaque mode without new
   sorting artefacts; the hard sheet-stops-dead edge visible in the stage-40
   baseline is gone; captures cited.
5. Refinement is error-driven: the handoff reports refined-cell counts at
   the default view well below the depth-4 fixed-grid counts measured in
   stage 40 (13,824 full window) while meeting criterion 2, and never
   exceeds the 32,768 cell budget.
6. Uniform all-period-1 grid geometry is unchanged; `Cloud` is unchanged;
   opacity-only changes do not rebuild; diagnostics still default off.
7. Build health: 8 ms slicing holds (median at or below 8 ms, maximum
   reported), and the triangle cap is respected.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Merging or rebasing against `dev`; porting to a fresh branch (that is its
  own later stage).
- Presets, thumbnails, `docs/INTERFACE.md`, other simulations, the native
  viewer.
- Any change to `Cloud` mode.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 60 minutes

## Verifier handoff

The worker's handoff envelope must state: the harness numbers achieved
(chord-error maximum and alternation rate per window), refined-cell counts
and share at the default view, slice-time and finalisation figures, how the
dissolve band composes with the edge fades and opaque depth, and the list of
files touched. The verifier re-runs the harness, checks the frozen targets,
and takes the comparison captures against the stage-40 evidence set.

## Family-specific notes

- **Codex (worker):** the sandbox cannot reach the window server; do not
  attempt to launch a browser. Use the harness and pure tests as your
  feedback loop. Browser captures are verifier-side only.
