# Stage card 19-logistic-mandelbrot-camera: Logistic Mandelbrot — orbit camera and c-marker

## Metadata

- **Authored:** 2026-07-17
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 4.8 <claude-opus-4-8@local>
- **Verifier panel:** false
- **Pairing rationale:** Pointer/gesture plumbing mirrors the existing fractalCanvas idiom — mechanical adaptation suited to the Codex tier; Claude verifies interaction feel and mathematical readability (period ↔ sheet count).

## Objective

Make the stage-18 view interactive in three dimensions:

1. **Orbit camera** — pointer drag orbits (azimuth/elevation), wheel or pinch
   dollies, double-click/tap resets. Slug-gated, following the existing
   fractal pointer-handling seam.
2. **c-marker** — a draggable marker on the c-plane. While dragging, the
   orbit column at the marker's c is highlighted (brighter/coloured points)
   so the number of sheets it pierces — the period of the bulb — is readable.
   The marker's current c and detected period are surfaced to the side panel.

## Inputs (read these in your own context)

- `src/app/fractalCanvas.ts` and `src/app/fractalView.ts` (preview/commit
  param flow, pointer/wheel/gesture idiom to adapt)
- `src/app/orbit3d.ts` or the stage-18 branch in `src/app/webglRenderer.ts`
- `src/sims/logistic-mandelbrot/model.ts` (period estimate per c)
- `src/app/controls.ts` (read-only; how panel values surface)
- `docs/verification.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. Camera state (azimuth, elevation, distance, target) driving the orbit3d
   view matrix, with pointer-drag orbit, wheel/pinch dolly, and reset.
   Inertia optional; clamp elevation to avoid gimbal flip.
2. c-marker: plane-intersection picking from the pointer ray, draggable,
   rendered as a small glyph on the c-plane with a highlighted orbit column.
3. Marker readout (c value and period) visible in the UI without new
   bespoke panel machinery — reuse the existing readout/controls idiom.
4. Camera interaction is slug-gated and does not alter pointer behaviour on
   any other sim.

## Constraints

- No changes to stage-17 sampler/kernel logic or tests beyond exposing the
  period lookup if not already exported.
- Pointer handlers must be gated to the `logistic-mandelbrot` slug exactly as
  fractal handlers are gated to fractal slugs.
- Touch: single-finger drag orbits, two-finger pinch dollies; the c-marker is
  grabbed only when the pointer-down lands on/near it.
- Do not run `git commit` from the worker phase.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes.
2. Browser smoke: drag-orbit and dolly work smoothly; reset returns to the
   stage-18 default view.
3. Dragging the c-marker into the period-2 disc highlights a column piercing
   exactly 2 sheets and the readout shows period 2; the main cardioid shows
   period 1; the period-3 bulb (top of the set) shows period 3.
4. Pointer interaction on `/#/mandelbrot` (2D fractal) and one non-fractal
   sim is unchanged.
5. No files outside the deliverable scope are modified, except this stage card.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Auto-animations (cascade sweep, marker auto-sweep) — stage 20.
- Presets, essay, thumbnail — stage 21.
- Keyboard navigation.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 20 minutes

## Verifier handoff

Worker returns: files changed, `npm run verify` output, browser smoke notes
for criteria 2–4 including which bulbs were checked. Verifier returns
`overall: PASS|FAIL`, per-criterion results, and a subjective note on
interaction feel (orbit damping, marker grab radius).

## Family-specific notes

- Codex worker: test touch gestures via devtools device emulation if no
  touch hardware is available; note emulation limits in the handoff.
- Claude verifier: verify the period readouts against the stage-17 model's
  period estimates, not just visually.
