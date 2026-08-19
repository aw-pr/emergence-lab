# Stage card 27-logistic-mandelbrot-surface-quality: Logistic Mandelbrot surface quality — smooth normals and higher sheet resolution

## Metadata

- **Authored:** 2026-07-20
- **Orchestrator:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Sol leads implementation of the material and topology
  changes; a cross-family frontier Claude verifier independently checks the
  shading maths, the triangle-cap headroom, build responsiveness, and the visual
  result. Fable 5 verifies for the higher bar on the shading maths. The gating
  investigation (below) was carried out by a Claude Fable 5 session before
  dispatch.

## Objective

Raise the `Hybrid surface` mode from its current polygonal look toward
publishable quality by attacking the two dominant causes identified in
investigation, without touching the `Cloud` default or the sheet-selection
semantics landed in stage 26:

1. **Faceted shading.** The surface fragment shader currently derives its
   normal from screen-space derivatives (`cross(dFdx(v_world), dFdy(v_world))`,
   `src/app/orbit3d.ts:257-259`), which is a flat per-facet normal and maximally
   exposes every triangle edge. Replace it with smooth per-vertex normals
   computed deterministically in the pure builder and interpolated across each
   sheet, keeping the existing two-sided view-facing flip and Fresnel rim.
2. **Lateral sheet resolution.** The sheet mesh is built on a separate, much
   coarser c-grid than the point cloud (`SURFACE_GRID_SIZES` 128/192/256/384/512
   vs the cloud's ~1000-1200 effective samples per axis at extreme). Raise the
   surface grid one tier and raise `ORBIT_SURFACE_TRIANGLE_LIMIT` in step, after
   proving the new worst-case triangle count and the 8 ms time-sliced build both
   stay within budget.

A small warmup-iteration lift is in scope only as sheet-noise cleanup; `K`
(`sampleCount`) is explicitly out of scope for this stage.

## Investigation context (read first)

The blocky look is dominated by lateral c-grid resolution of the surface mesh
and by flat `dFdx/dFdy` shading, not by `K` or iteration count. `K` (default 48,
range 8-96) only governs period detection and sheet separation and adds zero
lateral resolution; warmup (default 200) only settles orbit heights. At extreme,
512 squared already yields ~524k period-1 triangles, so the surface sits near
the current 599,999 cap — any resolution rise must co-raise the cap and re-check
build cost and GPU memory. One vertex is emitted per c-cell per detected sheet
rank in `buildOrbitSurface` (`src/app/orbitSurface.ts:51-101`).

## Inputs (read these in your own context)

- `docs/stages/26-logistic-mandelbrot-hybrid-surface.md` (the mode this builds on)
- `docs/plans/2026-07-19-logistic-mandelbrot-hybrid-surface.md`
- `src/app/orbitSurface.ts`
- `src/app/orbit3d.ts`
- `src/app/webglRenderer.ts`
- `src/sims/logistic-mandelbrot/kernel.test.cjs`
- `src/sims/logistic-mandelbrot/model.ts`
- `e2e/smoke.spec.ts`
- `docs/verification.md`

Do not read unrelated simulations unless a shared API makes that necessary.

## Deliverables

1. `src/app/orbitSurface.ts` — emit a deterministic per-vertex `normals`
   attribute: accumulate incident half-quad face normals per sheet-vertex (using
   grid x, grid y, and orbit height), then normalise. A degenerate/isolated
   vertex falls back to an up-facing normal. Extend `OrbitSurfaceMesh`.
2. `src/app/orbit3d.ts` — new float3 normal vertex attribute and buffer wired
   into the surface VAO; surface vertex shader forwards the interpolated normal;
   surface fragment shader uses it in place of the `dFdx/dFdy` cross product,
   keeping the view-facing flip, key/fill/Fresnel rim, and both material passes
   unchanged. Raise `SURFACE_GRID_SIZES` one tier and
   `ORBIT_SURFACE_TRIANGLE_LIMIT` to cover the new worst case.
3. `src/app/orbitSurface.ts` — raise `ORBIT_SURFACE_TRIANGLE_LIMIT` to the agreed
   ceiling; keep the in-builder cap enforcement so the mesh never exceeds it.
4. `src/sims/logistic-mandelbrot/kernel.test.cjs` — fixtures asserting the new
   normals are finite, unit-length, deterministic across a double build, and
   point away from the sheet plane for a flat period-1 sheet.
5. `e2e/smoke.spec.ts` — re-captured glass and opaque screenshots at the new
   resolution; assert the triangle count stays under the raised cap and no
   console/WebGL errors appear.
6. Optional, if it measurably reduces sheet-height noise without regressing
   build time: raise the default `warmupIterations`. Justify with before/after
   in the handoff or omit.

## Constraints

- `Cloud` remains the exact factory default and keeps its point budgets,
  reservoir compaction, ordering, shader path, and draw behaviour. The point
  path is untouched apart from unavoidable shared-resource plumbing.
- Do not change stage-26 sheet selection: escaped/period-zero/mixed-period/
  over-sampled/height-jump rejection and equal-rank sorting stay byte-identical
  in behaviour.
- Do not change the reviewed shape or version of `docs/INTERFACE.md`.
- No new dependency, simulation, gallery card, or renderer framework.
- Keep the 8 ms time-sliced build. Changing geometry mode or resolution may
  rebuild; changing only opacity must still redraw without rebuilding, and
  `orbit3dBuildKey` must still exclude `surfaceOpacity`.
- The raised triangle cap must be justified against the worst-case count at the
  new grid tier and must not exceed GPU buffer limits on the dev machine; state
  the measured peak triangle count and per-frame cost in the handoff.
- Surface allocation, compilation, framebuffer, or depth failure still degrades
  to `Cloud` without disabling the orbit renderer.
- Preserve palettes, colour modes, phase, sweep, cascade, camera, ground, and
  tone-map semantics. Do not regenerate presets or thumbnails.
- Worker must not run `git add`, `git commit`, or any git mutation. The dirty
  worktree plus final handoff envelope is the deliverable.
- If the full stage cannot be completed inside the worker budget, stop cleanly,
  preserve the best coherent partial result, and report every unfinished item in
  the handoff envelope rather than waiting for input.
- Use relative paths in committed files. UK English, no em dash.

## Acceptance criteria

The verifier will check every criterion. Any unmet criterion is a stage failure.

1. The surface fragment shader no longer derives its normal from `dFdx/dFdy`;
   it consumes an interpolated per-vertex normal produced by the builder, and
   retains the two-sided view-facing flip, key/fill lighting, and Fresnel rim.
2. `buildOrbitSurface` emits a `normals` attribute that pure tests prove is
   finite, unit-length within tolerance, deterministic across a double build,
   and correctly oriented for a flat period-1 sheet; isolated vertices fall back
   to an up normal.
3. `SURFACE_GRID_SIZES` is raised one tier and `ORBIT_SURFACE_TRIANGLE_LIMIT` is
   raised to cover the documented worst case; the built mesh never exceeds the
   cap, and the handoff states the measured peak triangle count.
4. `Cloud` is still the default with unchanged budgets, ordering, shader path,
   and visible behaviour; the point path is unchanged apart from shared plumbing.
5. Changing only opacity still does not rebuild geometry; `orbit3dBuildKey`
   still excludes `surfaceOpacity`.
6. Stage-26 sheet-selection and equal-rank behaviour is unchanged; real-slice
   fallback still reports zero triangles and draws its point curtain.
7. Targeted Playwright renders the hybrid surface at the new resolution, proves
   a positive triangle count below the raised cap, captures glass and opaque
   screenshots that visibly read smoother than the stage-26 baseline, and shows
   no console or WebGL errors.
8. `npm run build:test && node --test src/sims/logistic-mandelbrot/kernel.test.cjs`,
   the targeted Playwright case, and `npm run verify` all pass.
9. Only the declared deliverables change. `docs/INTERFACE.md`, presets,
   thumbnails, publishing, and Promo Flow stay untouched.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Changing `K`/`sampleCount`, period detection, or the sheet-selection rules.
- Contour/boundary interpolation that reshapes sheet silhouettes (a possible
  later stage; this stage is normals + grid density only).
- Watertight closure, refraction, alpha sorting, depth peeling, OIT, or mesh
  export.
- New presets, regenerated thumbnails, release/publish work, or Promo Flow.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 25 minutes

## Verifier handoff

Worker returns the exact files changed, focused test output, targeted Playwright
output and screenshot paths, full `npm run verify` output, the measured peak
triangle count and per-frame build cost at the new grid tier, a before/after
note on any warmup change, and a criterion-by-criterion self-check. Verifier runs
independent tests, inspects both screenshots against the stage-26 baseline, and
returns one JSON artefact with `overall: PASS|FAIL` plus evidence for every
criterion. Autometta makes one atomic worker-authored commit only after a
verifier PASS.

## Family-specific notes

- Codex/GPT worker: run headlessly through `codex exec`, never wait on stdin,
  and write `state/handoffs/27-logistic-mandelbrot-surface-quality.json` as the
  final action. Predictable log:
  `state/logs/27-logistic-mandelbrot-surface-quality-worker.log`.
- Claude Fable 5 verifier: inspect the actual diff against stage-start HEAD,
  run the focused and full gates independently, inspect both screenshots, and
  write the machine-readable verifier artefact. Do not approve a partial
  implementation. Browser acceptance is verifier-side: the worker sandbox cannot
  bind Vite or register Chromium's macOS Mach port, so use the orchestrator
  config, `npx playwright test e2e/smoke.spec.ts --config .cache/surface-playwright.config.ts --grep "Logistic Mandelbrot hybrid surface"`.
  Predictable log:
  `state/logs/27-logistic-mandelbrot-surface-quality-verifier.log`.
