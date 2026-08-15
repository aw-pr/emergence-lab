# Stage card 37-logistic-mandelbrot-boundary-detail: leaf detail where the leaves actually are

## Metadata

- **Authored:** 2026-08-15
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Pairing rationale:** Same asymmetry as stage 35, and for the same reason:
  the deliverable is judged by what a human sees when zooming into bulb-edge
  leaf structure, and the sandboxed codex worker cannot run WebGL. Sol built
  the sampler this stage extends; the Claude verifier is the only role that
  executes it, and the acceptance hinges on screenshots and frame timing that
  cannot be reasoned into existence.
- **Verifier transport:** cli.

## Depends on

Stages 35 and 36, both completed. Read stage 35's verifier artefact
(`state/verifiers/35-logistic-mandelbrot-gpu-sampler.json`) for the measured
numbers this card's budgets are derived from. If stage 36 is not yet
`completed`, stop and report that rather than proceeding: this stage changes
the sampling paths that stage 36's frozen parity harness and fallback e2e
assertions exist to guard, and those guards must be standing before this work
begins.

## Objective

Make the bulb-boundary leaf structure explorable. Stage 35's GPU sampler cut
`extreme` sampling from 6,221 ms to 419 ms, so compute is no longer the
constraint — the point budget is (the extreme cloud already sits at 9,314,960
of the 9,600,000 ceiling, `orbit3d.ts:362`), and points are currently spent
uniformly across a field that is mostly smooth interior. This stage adds an
opt-in **boundary detail** mode that concentrates a raised point budget on
boundary-band cells, sampled deeper, so edge leaves resolve instead of
dissolving into speckle when the camera closes in.

## Background you need

The orbit is the **complex quadratic map `z -> z^2 + c`**
(`src/sims/logistic-mandelbrot/model.ts:154-158`), not the real logistic map.
The sim's name refers to what it plots.

The machinery to extend already exists. The `tailRefinement` param
(`kernel.ts:139-148`, default 0.2, max 0.6) reserves a share of the point
budget for re-sampling interesting cells on a finer sub-grid: candidates are
cells whose detected period is 0 or `>= REFINE_PERIOD_THRESHOLD` (8)
(`orbit3d.ts:376`, `:1191-1192`), subdivided `REFINE_SUBDIVISION = 3` per
axis (`orbit3d.ts:377`), refined at a deeper (but capped, `orbit3d.ts:1095`)
warmup, weighted down by `REFINE_POINT_WEIGHT = 0.15`. Both the CPU sweep and
stage 35's GPU path (`buildGpuOrbitCloud`, second `sampler.sample` call)
run this pass.

Two measured facts should drive the design:

1. **Warmup is the accuracy lever at boundaries.** Stage 35 measured
   boundary-band period mismatch of 1.71% at production warmup (1,500) but
   0.25% at baker warmup (20,000). Boundary cells sampled deeper are not just
   denser, they are *more correct* — and per stage 34, no precision trick
   changes this, only iterations do.
2. **The GPU has headroom, the frame loop may not.** 3.7M base cells sampled
   in 419 ms; the parity corpus at baker settings (20,000 warmup) sampled at
   ~0.4 ms per 1,000 cells. Sampling deeper on a boundary subset is cheap.
   *Rendering* a larger cloud every frame is the cost to watch.

## Inputs (read these in your own context)

- src/app/orbit3d.ts — `POINT_BUDGETS` (357), the refinement constants
  (376-382), `rebuild()`'s budget split and candidate selection (1060-1230)
- src/app/orbitSampler.ts — `buildGpuOrbitCloud` and the refinement
  invocation; the `OrbitSampler.sample` warmup cap (`MAX_WARMUP_ITERATIONS`)
- src/sims/logistic-mandelbrot/kernel.ts — the param schema, `tailRefinement`
- src/app/qualityProfiles.ts and src/app/resolutionPreset.ts — how the
  extreme tier is selected and recovered from the point-count product
- state/verifiers/35-logistic-mandelbrot-gpu-sampler.json — the measured
  baseline this card cites

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A **boundary detail** control in the logistic-mandelbrot param schema
   (suggested key `boundaryDetail`, default 0 = off, so current behaviour is
   byte-identical until opted in). When raised, it:
   - selects **boundary-band candidates** — cells the existing pass already
     flags (period 0 or `>= REFINE_PERIOD_THRESHOLD`) plus cells adjacent to
     an escaped/non-escaped edge, which is where leaf filaments live;
   - re-samples them on the GPU at a **deeper warmup** than the base pass
     (design point: 8,000-20,000; state what you chose and why, citing the
     1.71% -> 0.25% measurement), at a finer subdivision than the base grid;
   - spends a **raised point ceiling** on them: extend `POINT_BUDGETS` with
     an opt-in tier at 16M (do not touch the existing extreme value; the
     tier recovery logic in qualityProfiles must keep working).
2. GPU-only: when the sampler is unavailable (`cpu-sampled-gpu-failed`),
   `boundaryDetail` must degrade to current `tailRefinement` behaviour rather
   than attempt a 16M-point CPU sweep. Say so in the control's tooltip/label
   if the schema supports it; at minimum the dataset must make it observable.
3. Observability, same convention as stage 35: a `canvas.dataset` value
   (suggested `orbit3dBoundaryDetail`) reporting off/active/degraded, plus
   the existing point-count values continuing to tell the truth.
4. A short addition to the four-paths table stage 36 wrote (README orbit3d
   section) documenting the new control and its dataset value.

## Constraints

- **Stage 36's frozen parity block is untouchable** and its harness must stay
  green: the base-pass sampling this stage inherits may not change numerically.
  Boundary-detail points are additive, produced by the refinement pass.
- Do not change `src/sims/logistic-mandelbrot/model.ts`,
  `scripts/bake-orbit3d.mjs`, the ELPC format, or prebake precedence. A
  prebaked cloud still wins; `boundaryDetail` applies to live builds only.
- Do not change the `SimKernel` interface (`docs/INTERFACE.md`, versioned).
  A new entry in this sim's own `paramSchema` is not a shape change.
- Do not regress the default experience: with `boundaryDetail` at 0, build
  time, point count, and visuals must match current behaviour exactly.
- Respect the raised ceiling as a budget, not a target, same as
  `kernel.ts:45-50`.
- Frame rate is part of the deliverable: if 16M points cannot hold interactive
  orbiting on the reference machine (M2 Max), cap the tier where it can, state
  the number you shipped, and why.
- No new runtime dependencies.
- `feat/logistic-mandelbrot-hybrid-surface` remains out of scope and is not a
  reference.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` green, including stage 36's parity harness, undoctored —
   confirm the frozen block digest still matches card 36.
2. Protected files unchanged (model.ts, bake-orbit3d.mjs, ELPC/baker), by diff.
3. With `boundaryDetail` at 0: build time within noise of the stage-35
   baseline (759 ms navigation-to-complete at extreme), identical point count
   (9,314,960), dataset unchanged. Measure, don't assume.
4. With `boundaryDetail` raised: the cloud gains points only in boundary
   regions. Verify by comparing point counts and by eye: zoom into a bulb
   junction (the period-2/period-4 shoulder and one leaf filament off the
   cardioid edge) and screenshot the same view at detail 0 and detail max.
   The leaf structure must be visibly better resolved, not merely denser
   speckle, and interiors must not visibly change.
5. Build time at maximum `boundaryDetail` stays under 2 s
   navigation-to-complete on the reference machine. State the measured figure.
6. Interactive orbiting at maximum detail holds a stated, measured frame rate
   the verifier judges usable (target 30 fps+); no watchdog resets, no
   context loss.
7. The GPU-unavailable degradation works: force sampler creation to fail and
   confirm `boundaryDetail` degrades to current behaviour with the dataset
   reporting it, not a multi-second CPU stall or a throw.
8. Prebake still wins where present, unchanged.
9. Stage 36's e2e fallback assertions still pass; the four-path table
   addition matches the code.
10. No regression to Kuramoto, the three GPU fractals, camera or marker drag.

## Contract test

- **Test file:** None new; stage 36's `gpu-parity.test.cjs` is the standing
  guard and criterion 1 pins its digest.
- **Assertions digest:** None

## Out of scope

- Changing the base-pass sampling, the CPU sampler, or stage 36's harness.
- New global resolution presets beyond the opt-in point-budget tier.
- Markus–Lyapunov or any other sim.
- Any push, publish-branch, or merge work.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 75 minutes

## Verifier handoff

Worker reports: the candidate-selection rule and warmup chosen, with the
measured stage-35 numbers cited as justification; the shipped point ceiling
and the frame-rate reasoning behind it; how degradation behaves without the
GPU sampler; the exact dataset values emitted; predicted build time and point
counts at detail 0 and max — flagged as predictions, since the worker cannot
run WebGL; and confirmation the frozen parity block was not touched.

## Family-specific notes

Codex worker: stdin is redirected from `/dev/null`; you cannot run a browser.
Write the path without executing it and do not claim measurements you could
not take. `Requires GUI: true` is for the Claude verifier.

Environment, both roles: run any manual dev server with `--strictPort` on
port 5175 or higher; ports 5173/5174 may carry foreign worktree servers and
`playwright.config.ts` silently reuses a foreign 5173. The operator may have
a server on 5178 — never reuse it.

## Round 2 re-brief (2026-08-15)

Round 1 PASSed 9/10 on measured evidence and FAILed only criterion 6. **The
implementation is not in question and must not be rebuilt.** It is committed
at **`091ffb2`** on this branch: candidate selection, 5x5 sub-grid, 20,000
warmup, the additive 16M ceiling, degradation, and observability all verified
working; detail 0 is byte-identical to the prior behaviour down to screenshot
bytes, and max-detail build lands at ~0.91 s.

The failure, measured by the round-1 verifier: at the **widest** camera, max
detail orbits at 23.8 fps and drags at 10.9 fps. Two of its findings frame
the fix: zoomed into the boundary band — this mode's whole use case — max
detail runs at the 120 Hz display cap; and the detail-0 baseline itself is
only 29.8/13.5 fps at the widest camera, so no point-ceiling choice can reach
30 fps there.

**Operator decision: camera-distance gating of the raised tier.** Round 2
adds exactly this and nothing else:

- When the camera is far, refinement points beyond today's budget must not
  cost frame time; as the camera closes on the boundary band, the full
  detail appears. Prefer the codebase's existing precedent of per-frame
  vertex-shader culling (`kernel.ts:160` — instant, no rebuild) over
  rebuild-on-threshold; a smooth distance-driven fade of refinement points
  is acceptable and avoids a visible pop. State the threshold you chose and
  why.
- Do not change candidate selection, warmup, the sub-grid, the ceiling
  value, or anything else from `091ffb2`.
- Round-1 verifier numbers to design against: at detail 0.5 the cloud
  saturates its budget exactly (12,800,000), so the slider's mid-range is
  budget-bound; at 1.0 it is candidate-bound (13,238,624 of 16M).

**Criterion 6 is re-worded for round 2** (this supersedes the original):
at every detail level and every camera distance, frame time is no worse than
detail 0 at the same camera within measurement noise; zoomed into the
boundary band at max detail, frame rate remains at or near the display cap;
no watchdog resets, no context loss. Measure all of these; the round-1
verifier's rAF-probe method and camera positions are the reference.

All other criteria were verified at `091ffb2` and need only spot-check
re-confirmation that the gating change did not disturb them — detail-0
byte-identity (criterion 3) and the parity freeze (criterion 1) in
particular, since a vertex-shader change touches the draw path both share.

## Round 3 re-brief (2026-08-15)

Round 2's gating is committed at **`4356f66`** and verified doing real work:
smoothstep reveal from culled at distance 2.25 to revealed at 1.25, base
prefix pinned to the unraised budget, ~two-thirds of the far-camera
regression removed, boundary-band at display cap, no context loss. The
residual FAIL on criterion 6 is one mechanism, measured precisely: at the
dolly extreme (distance 12) the vertex shader's early-out still pays vertex
fetch, hash and draw submission for all 3,920,824 gated points — a
reproducible 16.7 ms (12-19%) frame-time penalty against detail 0.

**Round 3 is one change: take fully-culled points out of the draw call.**
The reveal prefix is already contiguous (`boundaryDetailBaseCellCount`,
`orbit3d.ts:1116`, `:1198-1200`), so when
`boundaryDetailRevealForDistance` (`:1781-1790`) returns 0, shrink the draw
range to the base prefix instead of submitting gated points the shader will
discard; while the reveal is partial (between 2.25 and 1.25), the existing
shader cull carries the transition exactly as now. Do not change the
thresholds, the smoothstep, the buffer layout, or anything else from
`4356f66`.

Acceptance for round 3 is criterion 6's round-2 wording, now expected to
hold everywhere: the round-2 verifier measured detail 1 within noise of
detail 0 at distances 5.098, 2.408 and 0.537 already — the dolly-extreme
camera (six wheel-out ticks, distance 12) is the one measurement that must
move, from ~150 ms to detail 0's ~133 ms within noise. Spot-check criterion
3 (detail-0 byte-identity) and criterion 1 (parity digest) again; a draw
range touches the shared draw path.

## Round 4 re-brief (2026-08-15)

Round 3's base-only draw ranges are committed at **`c03d082`**, confirmed
firing by draw-call instrumentation, and stay. They were not, however, the
residual: the round-3 verifier's controls show removing the gated points
from submission buys only ~4 ms of the ~24 ms dolly-extreme gap, and that
drawing exactly detail 0's vertex count from the detail-1 cloud still costs
141.5 ms against detail 0's 125.0 ms. **The gap is in the base prefix
itself:** `boundaryDetailBaseCellCount` is set to `maxSurvivingCells`
(`orbit3d.ts:1198-1200`) = floor(9,600,000 / 8) = 1,200,000 cells — the
budget cap — but a real detail-0 build is candidate-bound at 1,164,370
cells. Fully gated detail 1 therefore draws 9,600,000 vertices where
detail 0 draws 9,314,960, a larger and differently-composed base cloud,
and at the dolly extreme the cost is overdraw-dominated (at the default
camera the same configuration is *faster* than detail 0).

**Round 4 is one change: pin the reveal prefix to the cells a detail-0
build actually yields, not to the budget cap.** When fully gated, the drawn
set must be the same cells, same count, same order as a detail-0 build —
that is what makes far-camera frame time equal by construction. Do not
change the thresholds, the smoothstep, the draw-range mechanism, or the
refinement tier from `c03d082`.

Two method notes from the round-3 verifier, binding on the round-4
verifier: measure with autoRotate, continuousSpin and realAxisSweep all
off (the spin phase swings 90-160 ms at the dolly extreme and hides a
24 ms effect; with them off the probe reproduces to 0.1 ms); and re-check
the boundary-band camera, where round 3 saw detail 1 at 16.6 ms against
detail 0's 8.4 ms in some runs — one vsync step below cap is within "at or
near the display cap" only if it does not reproduce as a consistent halving.
Spot-check criteria 3 and 1 as before.
