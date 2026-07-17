# Stage card 18-logistic-mandelbrot-orbit3d: Logistic Mandelbrot — orbit3d render mode and point cloud

## Metadata

- **Authored:** 2026-07-17
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 4.8 <claude-opus-4-8@local>
- **Verifier panel:** false
- **Pairing rationale:** GPU pipeline plumbing (new render mode, float textures, additive point pass) is well-scoped implementation work for the Codex tier; Opus cross-family verifies visual correctness against the stage-17 reference kernel. (Fable dropped off subscription mid-run; Opus is the substitute Claude verifier.)

## Objective

Add a new renderer mode `orbit3d` that draws the stage-17 attractor point set
as a 3D point cloud: point i at (Re(c), Im(c), Re(z_i)), rendered with
additive blending and exposure tone-mapping over a dark background, from a
fixed default camera (elevated three-quarter view; interactive camera is
stage 19). The real-axis curtain must read as the bifurcation diagram; the
off-axis limit-cycle sheets must be visible over the bulbs.

Point positions come from the stage-17 sampler, either uploaded as a static
Float32Array point cloud (recompute only on param change, amortised so the UI
never blocks) or computed in ping-pong float textures following the in-repo
Kuramoto GPU precedent. Worker chooses; the choice and its tradeoff go in the
handoff. Target ≥ 2M points at 60fps on Apple Silicon, scaled down via the
existing quality-profile mechanism on weaker GPUs.

## Inputs (read these in your own context)

- `src/app/webglRenderer.ts` (fractal direct-GPU seam ~lines 484–577, Kuramoto
  GPU update precedent immediately after; follow the existing mode-branch
  structure)
- `src/app/renderModes.ts`
- `src/sims/logistic-mandelbrot/model.ts` and `kernel.ts` (stage 17)
- `src/app/qualityProfiles.ts`
- `docs/INTERFACE.md` (renderer/kernel boundary)
- `docs/verification.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `renderModes.ts` maps `logistic-mandelbrot` → new mode `orbit3d`.
2. `orbit3d` path in `src/app/webglRenderer.ts` (or a new module it imports,
   e.g. `src/app/orbit3d.ts` if the inline branch would exceed ~200 lines):
   point-cloud build/upload, vertex/fragment shaders, additive blend +
   exposure uniform, fixed default camera matrix.
3. Quality-profile scaling of point budget (c-grid resolution × K) wired into
   the existing profile mechanism.
4. Graceful fallback: if `EXT_color_buffer_float`/float-texture support is
   absent, fall back to the stage-17 2D field mode rather than a black canvas.
5. Point budget and per-frame cost notes in the worker handoff.

## Constraints

- The stage-17 kernel, sampler, and tests must remain green and unmodified
  (excepting a minimal hook, e.g. exposing the sampler arrays, if strictly
  required — justify any such change in the handoff).
- No pointer/camera interaction in this stage.
- Do not regress the other 16 sims: no changes to existing mode branches
  beyond the new dispatch case.
- Keep shader sources embedded following the file's existing idiom.
- Do not run `git commit` from the worker phase.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes; stage-17 kernel tests still pass.
2. Browser smoke on `/#/logistic-mandelbrot`: a 3D point cloud renders — the
   vertical curtain along Im(c) = 0 visibly shows the period-doubling cascade
   (1→2→4 branch splits and the chaotic band), and distinct flat sheets hover
   over the period-2 disc.
3. Frame rate stays interactive (no sustained sub-30fps) at the default point
   budget on the dev machine; param changes re-sample without freezing the
   main thread for more than ~1s.
4. At least two other sims (one field-mode, one particle-mode) spot-checked
   visually unchanged.
5. Fallback path verified by forcing the capability flag off.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Orbit camera, dragging, c-marker (stage 19).
- Iteration-cascade animation and presets (stage 20).
- Ground-plane Mandelbrot texture, essay, thumbnail (stage 21).

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 30 minutes

## Verifier handoff

Worker returns: chosen compute strategy (CPU point cloud vs ping-pong
textures) with rationale, point budget per quality profile, files changed,
`npm run verify` output, and screenshots or described browser smoke for
criteria 2–5. Verifier returns `overall: PASS|FAIL` with per-criterion
results and an explicit judgement on whether the curtain matches the
bifurcation diagram (branch points near c = −0.75 and c = −1.25).

## Family-specific notes

- Codex worker: run browser smoke via the dev server (`npm run dev`); note
  that `webglRenderer.ts` is ~2500 lines — read the mode-dispatch and fractal
  branch first, not the whole file.
- Claude verifier: do not fix worker code; report only.
