# Stage card 28-logistic-mandelbrot-contour-edges: Logistic Mandelbrot contour-following sheet edges

## Metadata

- **Authored:** 2026-07-20
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Sol leads the topology and sampling work, continuing
  from stages 26 and 27; a cross-family frontier Claude verifier independently
  checks the contour mathematics, determinism, crack-freedom, and the visual
  silhouette result against the stage-27 baseline.

## Objective

Replace the axis-aligned staircase where sheets terminate at chaos onset and
bulb boundaries with silhouettes that follow the true period-transition
contour. Operator review of the stage-27 build found the sheet interiors and
shading acceptable but the sheet edges unpublishable: the mesh is quantised to
c-grid cells, so every silhouette is a stack of axis-aligned cell blocks. The
boundary of each bulb is fractal, so raising the uniform grid another tier
cannot fix this; the fix is sub-cell boundary accuracy exactly where the
transitions are:

1. **Contour interpolation.** For a grid edge whose two cells disagree in
   sheet usability or detected period, locate the transition point along the
   edge by deterministic bisection with extra attractor samples, then emit
   trimmed triangles whose silhouette vertices sit at the interpolated
   boundary position instead of the cell corner (marching-squares style
   partial cells in place of today's wholesale quad rejection).
2. **Adaptive boundary refinement.** Subdivide only boundary cells, up to two
   levels, sampling extra c points there during the existing time-sliced
   build, so the contour interpolation works on locally finer cells where the
   fractal detail lives while sheet interiors stay at the current grid.

Interior sheet geometry, sheet selection semantics, and the `Cloud` default
are untouched.

## Investigation context (read first)

`buildOrbitSurface` (`src/app/orbitSurface.ts`) accepts a half-quad triangle
only when all three corners share a detected period and the height span stays
within the jump limit; a quad touching a differing or unusable cell is
rejected wholesale, so silhouettes land on cell boundaries and read as
staircases. The stage-27 edge feather (`surfaceEdgeFades`) only fades the
outer rings; it softens the stairs without reshaping them. The sampler
(`sampleAttractorCell` in `src/sims/logistic-mandelbrot/model.ts`) is cheap
per c point, so a handful of bisection evaluations per boundary edge and a
few per cent of refined cells are affordable inside the 8 ms sliced build.
The point-cloud side of hybrid already covers the chaotic region; the goal is
that sheets end crisply on the true boundary and hand over to the points.

## Inputs (read these in your own context)

- `docs/stages/27-logistic-mandelbrot-surface-quality.md` (the state this builds on)
- `docs/stages/26-logistic-mandelbrot-hybrid-surface.md`
- `src/app/orbitSurface.ts`
- `src/app/orbit3d.ts`
- `src/app/webglRenderer.ts`
- `src/sims/logistic-mandelbrot/model.ts`
- `src/sims/logistic-mandelbrot/kernel.test.cjs`
- `e2e/smoke.spec.ts`
- `docs/verification.md`

Do not read unrelated simulations unless a shared API makes that necessary.

## Deliverables

1. `src/app/orbitSurface.ts` (or a sibling pure module included in
   `tsconfig.test.json`) - contour interpolation over boundary edges. For an
   edge whose two cells disagree in usability or period, bisect with a
   supplied deterministic cell sampler (a fixed, exported maximum number of
   steps) to locate the transition parameter, and emit trimmed triangles
   whose silhouette vertices sit at the interpolated position. Trimmed
   vertices carry the periodic side's period and rank structure; their
   heights come from the deepest bisection sample whose detected period
   matches the periodic side, falling back to the periodic cell's own
   heights. Adjacent trimmed quads share boundary vertices: no cracks, no
   non-finite attributes. Normals and edge fades extend over the new
   vertices.
2. Boundary refinement in the build path (`src/app/orbit3d.ts`): identify
   boundary cells (a usable cell with a differing or unusable neighbour),
   subdivide them up to two levels (exported constants for depth and budget),
   sample the extra c points inside the existing 8 ms time-sliced build, and
   feed the refined cells plus sampler into the contour builder. Interior
   cells keep their stage-27 sampling and geometry.
3. `src/app/orbit3d.ts` / `src/app/webglRenderer.ts` - stats plumbing and a
   new canvas data attribute `data-orbit3d-refined-cells` exposing the count
   of refined boundary cells alongside the existing attributes.
4. `src/sims/logistic-mandelbrot/kernel.test.cjs` - pure fixtures using a
   synthetic analytic sampler: a straight oblique period-1 to period-2 split
   and a period-1 to escaped split. Assert silhouette vertices land within
   one eighth of a coarse cell of the analytic boundary, output is
   deterministic across a double build, normals stay finite and unit-length,
   indices stay in range, and a uniform all-period-1 grid produces geometry
   identical to the pre-stage builder output.
5. `e2e/smoke.spec.ts` - hybrid case additionally asserts
   `data-orbit3d-refined-cells` is positive on the full window and the
   triangle count stays under the cap; re-capture glass and opaque
   screenshots; no console or WebGL errors.

## Constraints

- `Cloud` remains the exact factory default with unchanged budgets, ordering,
  shader path, and visible behaviour.
- Stage-26 sheet-selection semantics for interior cells are unchanged:
  escaped/period-zero/mixed-period/over-sampled/height-jump rejection and
  equal-rank sorting behave identically away from the contour band.
- `SURFACE_GRID_SIZES` stays at the stage-27 tiers. Refinement is local to
  boundary cells; state the measured refined-cell share in the handoff.
- `ORBIT_SURFACE_TRIANGLE_LIMIT` may rise only if the measured worst case
  demands it, to at most 1,499,999, with the measured peak triangle count
  stated in the handoff; in-builder cap enforcement stays.
- Keep the 8 ms time-sliced build; report median and maximum slice time and
  finalisation time in the handoff. Changing only opacity must still redraw
  without rebuilding, and `orbit3dBuildKey` must still exclude
  `surfaceOpacity`.
- All new builder logic is deterministic: pure functions of their inputs, and
  any sampler callback threaded in must be deterministic for a given c.
- Real-slice-only keeps its point curtain with zero surface triangles.
  Surface allocation, compilation, framebuffer, or depth failure still
  degrades to `Cloud` without disabling the orbit renderer.
- Preserve palettes, colour modes, phase, sweep, cascade, camera, ground, and
  tone-map semantics. Do not regenerate presets or thumbnails.
- Do not change `K`/`sampleCount`, period detection, warmup defaults, or the
  reviewed shape or version of `docs/INTERFACE.md`. No new dependency.
- Do not commit anything under `.cache/`.
- Worker must not run `git add`, `git commit`, or any git mutation. The dirty
  worktree plus final handoff envelope is the deliverable.
- If the full stage cannot be completed inside the worker budget, stop
  cleanly, preserve the best coherent partial result, and report every
  unfinished item in the handoff envelope rather than waiting for input.
- Use relative paths in committed files. UK English, no em dash.

## Acceptance criteria

The verifier will check every criterion. Any unmet criterion is a stage failure.

1. Sheet silhouettes at bulb boundaries follow interpolated contour positions
   rather than cell corners: the axis-aligned staircase visible in the
   stage-27 baseline is gone at comparable zoom, confirmed by inspecting the
   new screenshots against the stage-27 captures.
2. Pure tests prove silhouette vertices track the analytic boundary within
   one eighth of a coarse cell for both synthetic fixtures, with
   deterministic double-build output, finite unit-length normals, in-range
   indices, and no cracks (shared boundary vertices between adjacent trimmed
   quads).
3. A uniform all-period-1 grid produces geometry identical to the pre-stage
   builder output: interior behaviour is unchanged.
4. Boundary refinement subdivides only boundary cells, up to the exported
   depth, inside the 8 ms sliced build; the handoff states refined-cell
   share, median and maximum slice time, and finalisation time.
5. `data-orbit3d-refined-cells` is published and positive for the full
   window; the built mesh never exceeds the (possibly raised, at most
   1,499,999) triangle cap, and the handoff states the measured peak.
6. `Cloud` is unchanged; changing only opacity does not rebuild;
   `orbit3dBuildKey` still excludes `surfaceOpacity`; real-slice fallback
   still reports zero triangles and draws its point curtain.
7. Targeted Playwright passes with the new assertions, captures glass and
   opaque screenshots, and shows no console or WebGL errors.
8. `npm run build:test && node --test src/sims/logistic-mandelbrot/kernel.test.cjs`,
   the targeted Playwright case, and `npm run verify` all pass.
9. Only the declared deliverables change. `docs/INTERFACE.md`, presets,
   thumbnails, publishing, and Promo Flow stay untouched, and nothing under
   `.cache/` is staged.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Changing `K`/`sampleCount`, period detection, warmup, or sheet-selection
  rules for interior cells.
- Watertight closure, refraction, alpha sorting, depth peeling, OIT, or mesh
  export.
- Raising `SURFACE_GRID_SIZES` or the point budgets.
- New presets, regenerated thumbnails, release/publish work, or Promo Flow.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 30 minutes

## Verifier handoff

Worker returns the exact files changed, focused test output, targeted
Playwright output and screenshot paths, full `npm run verify` output, the
measured refined-cell share, peak triangle count, slice timings, and a
criterion-by-criterion self-check in
`state/handoffs/28-logistic-mandelbrot-contour-edges.json`. Verifier runs the
gates independently, inspects the new screenshots against the stage-27
baseline for the staircase criterion, and returns one JSON artefact with
`overall: PASS|FAIL` plus evidence for every criterion. Autometta makes one
atomic worker-authored commit only after a verifier PASS.

## Family-specific notes

- Codex/GPT worker: run headlessly through `codex exec`, never wait on stdin,
  and write `state/handoffs/28-logistic-mandelbrot-contour-edges.json` as the
  final action. Predictable log:
  `state/logs/28-logistic-mandelbrot-contour-edges-worker.log`.
- Claude Fable 5 verifier: inspect the actual diff against stage-start HEAD,
  run the focused and full gates independently, inspect both screenshots, and
  write the machine-readable verifier artefact. Do not approve a partial
  implementation. Browser acceptance is verifier-side: the worker sandbox
  cannot bind Vite or register Chromium's macOS Mach port, so use
  `npx playwright test e2e/smoke.spec.ts --config .cache/surface-playwright.config.ts --grep "Logistic Mandelbrot hybrid surface"`.
  Predictable log:
  `state/logs/28-logistic-mandelbrot-contour-edges-verifier.log`.
