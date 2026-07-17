# Stage card 20-logistic-mandelbrot-cascade: Logistic Mandelbrot — animate the maths

## Metadata

- **Authored:** 2026-07-17
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 4.8 <claude-opus-4-8@local>
- **Verifier panel:** false
- **Pairing rationale:** Animation sequencing over existing plumbing is implementation work for the Codex tier; Claude verifies that the animations are mathematically honest (the cascade shows real branch splits, not a fade).

## Objective

Add the two signature "animate the maths" behaviours plus their params:

1. **Cascade reveal** — animate the plotted-iteration count upward from 1
   through K over a configurable duration: the audience watches the single
   attractor sheet split into 2, 4, 8… into the chaotic band, live in 3D.
   Runs on load (respecting the existing auto-cycle/idle conventions) and on
   demand via a control.
2. **Real-axis sweep** — auto-animate the stage-19 c-marker along the real
   axis from c = 0.25 to c = −2, so the highlighted column traces the
   bifurcation diagram through the curtain. Manual marker drag interrupts
   the sweep.
3. **Real-slice toggle** — a boolean param that hides off-axis points,
   leaving the classic 2D bifurcation curtain; toggling back restores the
   full volume.

All new tunables (cascade duration, sweep speed, exposure, point density if
not already exposed) go through `paramSchema` so the auto-generated controls
panel picks them up.

## Inputs (read these in your own context)

- `src/app/orbit3d.ts` / the orbit3d branch in `src/app/webglRenderer.ts`
  (stages 18–19)
- `src/sims/logistic-mandelbrot/kernel.ts` (plotted-iterations param from
  stage 17)
- `src/app/simView.ts` (animation loop / speed conventions)
- `src/app/presets.ts` (idiom only; presets authored in stage 21)
- `docs/verification.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. Cascade reveal animation driven by the existing plotted-iterations
   parameter (stage 17 criterion 4), interpolated smoothly, with start/stop
   control and load-time trigger.
2. Real-axis sweep animation for the c-marker with interrupt-on-drag.
3. Real-slice-only toggle wired from `paramSchema` through to the point
   renderer.
4. `paramSchema` entries for all new tunables; controls panel renders them
   with no bespoke UI code.

## Constraints

- Animations must be frame-rate independent (dt-based, matching the repo's
  frame-rate-independence conventions).
- No new render passes; reuse the stage-18 pipeline (uniform or point-count
  changes only).
- Stage 17–19 tests and behaviours stay green.
- Do not run `git commit` from the worker phase.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes.
2. Browser smoke: cascade reveal shows discrete visible branch splits
   (1 sheet → 2 → 4) before dissolving into the chaotic band — the splits
   occur at fixed cascade positions, not as a uniform fade-in.
3. Real-axis sweep traverses 0.25 → −2 with the highlighted column's sheet
   count changing 1 → 2 → 4 → chaos → 3 (the period-3 window near
   c ≈ −1.76) → chaos; dragging the marker stops the sweep.
4. Real-slice toggle leaves only the Im(c) = 0 curtain; the view matches the
   textbook logistic bifurcation diagram shape.
5. All new params appear in the auto-generated controls panel and persist
   through a param reset correctly.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Presets, palette polish, ground plane, essay, thumbnail (stage 21).
- Audio, recording/export features.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 20 minutes

## Verifier handoff

Worker returns: files changed, `npm run verify` output, browser smoke notes
mapping each acceptance criterion to what was observed, including where in
the sweep the period-3 window appeared. Verifier returns `overall: PASS|FAIL`
with per-criterion results; criterion 2's "splits not fade" judgement must be
explicit.

## Family-specific notes

- Codex worker: the cascade is a plotted-iterations ramp, not an alpha ramp —
  if implementation pressure pushes toward a fade, stop and re-read the
  objective.
- Claude verifier: check the period-3 window location against the conjugacy
  c = r/2·(1 − r/2) with r ≈ 3.83.
