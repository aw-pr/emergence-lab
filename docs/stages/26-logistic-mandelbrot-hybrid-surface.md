# Stage card 26-logistic-mandelbrot-hybrid-surface: Logistic Mandelbrot hybrid glass sheets

## Metadata

- **Authored:** 2026-07-19
- **Orchestrator:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** The raw-WebGL topology and material work needs frontier implementation judgement; a cross-family frontier verifier independently checks mathematical seams, fallback behaviour, resource ownership, and the visual result within the final Fable subscription window.

## Objective

Add an optional `Hybrid surface` geometry mode to the existing Logistic
Mandelbrot simulation. Stable detected period-q regions become open,
rank-matched sheets while chaotic and unresolved regions remain the existing
point cloud. Add one opacity control that moves the sheets from luminous
translucent glass to an opaque depth-writing surface. Keep `Cloud` as the exact
factory default and preserve its current point budgets and rendering path.

Implement the reviewed plan in
`docs/plans/2026-07-19-logistic-mandelbrot-hybrid-surface.md`.

## Inputs (read these in your own context)

- `docs/plans/2026-07-19-logistic-mandelbrot-hybrid-surface.md`
- `src/sims/logistic-mandelbrot/model.ts`
- `src/sims/logistic-mandelbrot/kernel.ts`
- `src/sims/logistic-mandelbrot/kernel.test.cjs`
- `src/app/orbit3d.ts`
- `src/app/webglRenderer.ts`
- `src/app/simView.ts`
- `tsconfig.test.json`
- `e2e/smoke.spec.ts`
- `essays/logistic-mandelbrot.md`
- `docs/verification.md`

Do not read unrelated simulations unless a shared API makes that necessary.

## Deliverables

1. `src/app/orbitSurface.ts` - pure, deterministic regular-grid sheet topology builder.
2. `src/sims/logistic-mandelbrot/kernel.ts` - `geometryMode` and `surfaceOpacity` descriptors.
3. `src/sims/logistic-mandelbrot/kernel.test.cjs` - schema and topology fixtures.
4. `src/app/simView.ts` - both new controls grouped at the start of View controls.
5. `src/app/orbit3d.ts` - hybrid sampler, mesh resources, depth attachment, glass and opaque passes, stats, cleanup, and fallback.
6. `src/app/webglRenderer.ts` - mode/opacity plumbing and observable canvas build evidence.
7. `tsconfig.test.json` - include the pure topology module in the test build.
8. `e2e/smoke.spec.ts` - targeted hybrid, material, no-rebuild, and real-slice fallback checks.
9. `essays/logistic-mandelbrot.md` - concise explanation of periodic sheets, particulate chaos, and opacity.

## Constraints

- Do not change the reviewed shape or version of `docs/INTERFACE.md`.
- `Cloud` remains the default and retains its current point dimensions,
  budgets, ordering, shader semantics, and draw behaviour.
- Do not add Three.js, another dependency, another simulation, or another
  gallery card.
- The surface is an open collection of periodic sheets, not a watertight shell,
  volume, refractive material, or order-independent-transparency system.
- Hybrid uses a capped regular grid: 128 squared performance, 192 squared
  balanced, 256 squared high, 384 squared ultra, and 512 squared extreme. It
  stays below 600,000 triangles.
- Keep the existing 8 ms time slices. Changing geometry mode rebuilds;
  changing only opacity redraws without rebuilding.
- Real-slice-only has no two-dimensional adjacency and must retain its cloud
  curtain with zero surface triangles.
- Surface allocation, compilation, framebuffer, or depth failure degrades to
  Cloud without disabling the existing orbit renderer.
- Preserve current palettes, colour modes, phase, sweep, cascade, camera,
  ground, and tone-map semantics. Do not regenerate presets or thumbnails.
- Worker must not run `git add`, `git commit`, or any other git mutation. The
  dirty worktree plus final handoff envelope is the deliverable.
- If the full stage cannot be completed inside the worker budget, stop cleanly,
  preserve the best coherent partial result, and report every unfinished item
  in the handoff envelope rather than waiting for input.
- Use relative paths in committed files. Use UK English and no em dash.

## Acceptance criteria

The verifier will check every criterion. Any unmet criterion is a stage failure.

1. The schema exposes `geometryMode` options `["cloud", "hybrid"]`, default
   `"cloud"`, and `surfaceOpacity` default `0.40`, minimum `0.1`, maximum `1`,
   step `0.05`; both controls lead the Logistic Mandelbrot View group.
2. Pure-builder tests prove deterministic output, finite attributes, in-range
   indices, sorted equal-rank period-1 and period-2 sheets, and independent
   rejection of escaped, period-zero, under-sampled, mixed-period, and excessive
   height-jump triangles.
3. Cloud is still the default and keeps the pre-stage point budgets, reservoir
   compaction, point ordering, shader path, and visible behaviour.
4. Hybrid samples a capped regular grid in 8 ms slices, emits only compatible
   stable sheets, and retains only period-zero chaotic/unresolved samples as
   points. Real-slice-only reports zero triangles and draws its point curtain.
5. The RGBA16F accumulation target owns a complete `DEPTH_COMPONENT16`
   renderbuffer. Resize, failure, and destroy paths release every new WebGL
   resource. Surface-only failure reports fallback and leaves Cloud working.
6. Opacity below 1 uses depth testing without depth writes, premultiplied
   additive HDR energy, and a two-sided Fresnel rim. Opacity 1 disables blending
   and writes depth. Changing opacity does not rebuild geometry.
7. Surface colour and reveal use existing palette, phase, interior multiplier,
   boundary, sweep, camera, and cascade semantics; existing Cloud output is
   unchanged.
8. Canvas data attributes expose geometry mode, build state, surface
   availability/fallback, and triangle count. Targeted Playwright proves a
   positive count below 600,000, captures glass and opaque screenshots, sees no
   console or WebGL errors, proves opacity does not rebuild, and checks the
   real-slice fallback.
9. `npm run build:test && node --test src/sims/logistic-mandelbrot/kernel.test.cjs`,
   the targeted Playwright case, and `npm run verify` all pass.
10. Only the declared deliverables change. `docs/INTERFACE.md`, presets,
    thumbnails, publishing, and Promo Flow stay untouched.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Physically correct refraction, alpha sorting, depth peeling, thickness,
  watertight closure, volume rendering, or mesh export.
- Changing the two-dimensional Mandelbrot renderer or its colour semantics.
- New presets, regenerated thumbnails, release/publish work, or Promo Flow.
- Any additional renderer framework or dependency.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 25 minutes

## Verifier handoff

Worker returns the exact files changed, focused test output, targeted Playwright
output and screenshot paths, full `npm run verify` output, triangle/build stats,
resource-cleanup notes, and a criterion-by-criterion self-check. Verifier must
run independent tests and return one JSON artefact with `overall: PASS|FAIL`
plus evidence for every acceptance criterion. Autometta makes one atomic
worker-authored commit only after a verifier PASS.

## Family-specific notes

- Codex/GPT worker: run headlessly through `codex exec`, never wait on stdin,
  follow the implementation plan task by task, and write
  `state/handoffs/26-logistic-mandelbrot-hybrid-surface.json` as the final
  action. Its predictable log is
  `state/logs/26-logistic-mandelbrot-hybrid-surface-worker.log`.
- Claude Fable verifier: inspect the actual diff against stage-start HEAD, run
  the focused and full gates independently, inspect both screenshots, and write
  the required machine-readable verifier artefact. Do not approve a partial
  implementation. Its predictable log is
  `state/logs/26-logistic-mandelbrot-hybrid-surface-verifier.log`.
- Recovery verifier note: browser acceptance is verifier-only because the Codex
  worker sandbox cannot bind Vite or register Chromium's macOS Mach port. Port
  5173 belongs to the operator's main worktree, so use the orchestrator-provided
  ignored config and run
  `npx playwright test e2e/smoke.spec.ts --config .cache/surface-playwright.config.ts --grep "Logistic Mandelbrot hybrid surface"`.
