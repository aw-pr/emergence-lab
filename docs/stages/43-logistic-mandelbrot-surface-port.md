# Stage card 43-logistic-mandelbrot-surface-port: wire the hybrid surface into the GPU-sampler renderer

## Metadata

- **Authored:** 2026-08-19
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Sol carries its own surface work (stages 26 to 28,
  40, 41) onto the current renderer; a cross-family Claude verifier re-runs
  the frozen edge harness targets and judges the ported hybrid mode visually
  in the browser against the source-branch behaviour.

## Objective

The hybrid glass-sheet renderer for the logistic Mandelbrot was built and
honed on the parked branch `feat/logistic-mandelbrot-hybrid-surface`
(stages 26 to 28 built it; stage 40 diagnosed the edge sawtooth; stage 41
fixed it against frozen numeric targets). Meanwhile `dev` gained the GPU
orbit sampler and boundary-detail path (stages 34 to 39c), which rewrote the
same `orbit3d` internals, so the branch cannot be merged or rebased cleanly.

This stage completes the port. The orchestrator has already carried the
portable pieces onto this branch in the preparation commit: the pure builder
`src/app/orbitSurface.ts` (stage-41 state), the edge harness
`scripts/analyze-sheet-edges.cjs`, the stage docs and findings, and a
reference copy of the source branch's wired files under
`docs/ports/surface-branch-reference/`. Your job is the wiring: integrate
hybrid mode into the current GPU-sampler-era `orbit3d.ts` / `webglRenderer.ts`
so that everything the source branch could do works here, without regressing
anything the GPU sampler added.

## Inputs (read these in your own context)

- `docs/ports/surface-branch-reference/SOURCE.md` (what was copied, from which commit, and what is reference-only)
- `docs/ports/surface-branch-reference/orbit3d.ts` (the source branch's wired renderer, reference only)
- `docs/ports/surface-branch-reference/webglRenderer.ts` (reference only)
- `docs/ports/surface-branch-reference/renderer.ts` (reference only)
- `docs/ports/surface-branch-reference/simView.ts` (reference only)
- `src/app/orbitSurface.ts` (already ported, do not rewrite)
- `scripts/analyze-sheet-edges.cjs` (already ported)
- `docs/plans/2026-08-19-edge-analysis-findings.md`
- `src/app/orbit3d.ts` (current dev state, the integration target)
- `src/app/webglRenderer.ts`
- `src/app/renderer.ts`
- `src/app/simView.ts`
- `src/sims/logistic-mandelbrot/kernel.ts`
- `src/sims/logistic-mandelbrot/kernel.test.cjs`
- `docs/verification.md`

Do not read unrelated simulations unless a shared API makes that necessary.

## Deliverables

1. `src/sims/logistic-mandelbrot/kernel.ts` - the `geometryMode`
   (`cloud`/`hybrid`, default `cloud`) and `surfaceOpacity` (default 0.4,
   min 0.1, max 1, step 0.05) descriptors, as on the source branch.
2. `src/app/orbit3d.ts` - hybrid build path: the time-sliced surface build
   with stage-41 error-driven boundary refinement (the four exported budget
   constants), feeding `buildOrbitSurface`; coexisting with the GPU orbit
   sampler so cloud mode is untouched and hybrid mode degrades to cloud on
   any surface allocation or compile failure. Stage-40 diagnostic modes
   (`?surfaceDiagnostic=flat|normals`, canvas attribute, default off) come
   along.
3. `src/app/webglRenderer.ts` / `src/app/renderer.ts` / `src/app/simView.ts` -
   draw path for glass (additive, Fresnel rim, no depth writes) and opaque
   (depth-writing) sheets, the stage-41 dissolve band, opacity redraw
   without rebuild, and the canvas data attributes the source branch
   published (`orbit3dGeometry`, `orbit3dTriangles`, `orbit3dRefinedCells`,
   `orbit3dSurface`, and the diagnostic attribute).
4. `src/sims/logistic-mandelbrot/kernel.test.cjs` - the pure surface
   fixtures ported from `docs/ports/surface-branch-reference/kernel.test.cjs`
   (stage-41 state) into the current test file, passing alongside the
   existing GPU-sampler-era tests. Do not overwrite the current file with
   the reference copy.

## Constraints

- `Cloud` remains the exact factory default, running the current dev GPU
  sampler path byte-for-byte: budgets, boundary detail, controls popups,
  presets, and every stage 34 to 39c behaviour unchanged.
- `src/app/orbitSurface.ts` is already at stage-41 state: adapt call sites,
  not the pure module. If a genuine defect in it blocks you, surface a
  blocker rather than patching silently.
- Nothing under `docs/ports/surface-branch-reference/` is imported or
  compiled: it is reference documentation only.
- No new dependency. Do not commit anything under `.cache/`.
- Keep the 8 ms time-sliced build; report refined-cell share, median and
  maximum slice time, and finalisation time in the handoff.
- Worker must not run `git add`, `git commit`, or any git mutation. The
  dirty worktree plus final handoff envelope is the deliverable.
- If the full stage cannot be completed inside the worker budget, stop
  cleanly, preserve the best coherent partial result, and report every
  unfinished item in the handoff envelope rather than waiting for input.
- Use relative paths in committed files. UK English, no em dash.

## Acceptance criteria

The verifier will check every criterion. Any unmet criterion is a stage failure.

1. `npm run verify` is green, including the ported pure fixtures.
2. `node scripts/analyze-sheet-edges.cjs` meets the frozen stage-41 targets
   on this branch: chord error at or below 0.75 px at the fixed verifier
   camera, alternation rate at or below 0.15, byte-identical across two runs.
3. Verifier-side browser check: hybrid mode builds and draws sheets with the
   stage-41 edge quality (flat-colour close-up shows no notch above 1 px)
   and the dissolve band into the point cloud; glass and opaque modes both
   work; no console or WebGL errors.
4. Verifier-side browser check: cloud mode is indistinguishable from current
   dev (GPU sampler active, boundary detail working, controls unchanged);
   switching geometry and opacity behaves as on the source branch, and
   opacity-only changes do not rebuild.
5. Hybrid degrades to cloud (renderer stays alive) on surface allocation or
   shader failure, and real-slice-only draws its point curtain with zero
   surface triangles.
6. The published canvas data attributes match the source branch's contract.
7. Build health: 8 ms slicing holds and the triangle cap is respected; the
   handoff reports the figures.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Changing `buildOrbitSurface` internals; re-tuning stage-41 constants.
- Merging to `dev`/`main`; presets, thumbnails, `docs/INTERFACE.md`, the
  native viewer, other simulations.
- Deleting or modifying the parked source branch.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 60 minutes

## Verifier handoff

The worker's handoff envelope must state: the harness numbers achieved on
this branch, how the hybrid build coexists with the GPU sampler (what is
shared, what is separate), the degradation path taken on failure, slice-time
and finalisation figures, and the list of files touched. The verifier re-runs
the harness and performs the browser checks in criteria 3 to 5.

## Family-specific notes

- **Codex (worker):** the sandbox cannot reach the window server; do not
  attempt to launch a browser. Use `npm run verify`, the pure fixtures, and
  the harness as your feedback loop. Browser checks are verifier-side only.
