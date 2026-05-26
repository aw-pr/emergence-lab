# Stage card 09-fractal-zoom-trackpad-mouse: Better fractal zoom for trackpad and mouse

## Metadata

- **Authored:** 2026-05-26
- **Orchestrator:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Worker:** Codex GPT-5.3 <codex-gpt-5-3@local>
- **Verifier:** Claude Sonnet 4.6 <claude-sonnet-4-6@local>
- **Pairing rationale:** Cross-family per `memory/project-cross-family-verification-validated.md`. UX-feel change with no kernel involvement; Claude verifier exercises the running app on macOS with both a trackpad (two-finger scroll, pinch) and a mouse wheel, on all three fractal sims.

## Objective

Fractal zoom in `src/app/fractalCanvas.ts` currently does:

```ts
const sensitivity = ev.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.35 : 0.0025;
const factor = Math.exp(-ev.deltaY * sensitivity);
const clamped = Math.min(1.35, Math.max(1 / 1.35, factor));
zoomAroundCursor(getParams(), ev.clientX, ev.clientY, clamped);
```

Two user-visible problems:

1. **Mouse wheel feels sluggish.** Per-click factor is capped at 1.35×; on a typical wheel mouse this is ~5–6 clicks per doubling, which is much slower than other web fractal viewers.
2. **macOS trackpad pinch is not differentiated from two-finger scroll.** Trackpad pinch on Safari/Chrome on macOS arrives as a `wheel` event with `ev.ctrlKey === true` and tiny `deltaY`, currently treated identically to scroll. Safari additionally fires `gesturestart`/`gesturechange`/`gestureend` with a `scale` property, which we ignore. Result: pinch-to-zoom is barely usable.

Make zoom feel responsive on both input devices on the three fractal sims (`mandelbrot`, `julia-set`, `burning-ship`).

## Inputs (read these in your own context)

- `src/app/fractalCanvas.ts`
- `src/sims/mandelbrot/kernel.ts` (read-only — for zoom param schema bounds)
- `src/sims/julia-set/kernel.ts` (read-only)
- `src/sims/burning-ship/kernel.ts` (read-only)
- `src/app/simView.ts` (read-only — confirms how `attachFractalCanvasInteractions` is wired)

Do not read anything else. In particular, do not touch kernels or the renderer.

## Deliverables

Edit only `src/app/fractalCanvas.ts`. Make the following behaviour changes:

1. **Mouse wheel (`deltaMode === WheelEvent.DOM_DELTA_LINE`).** Raise per-click sensitivity so a single notch produces roughly a 1.5–1.6× zoom (in or out). Remove the 1.35× per-event clamp for line-mode events, or raise it to ~1.7. Continue to clamp per-event factor for pixel-mode (trackpad) input to prevent runaway zoom on momentum scrolling.

2. **Trackpad pinch via `wheel + ctrlKey`.** When `ev.ctrlKey === true` and the event is a `wheel`, treat it as a pinch: use higher sensitivity (`~0.02`) than a normal pixel-mode scroll, and zoom around the pointer position. (Two-finger pan is unrelated — leave the existing pan path alone; pinch arrives as wheel-with-ctrlKey, not as pointermove.) `ev.preventDefault()` must be called to suppress the browser's page-zoom default.

3. **Safari gesture events.** Add listeners for `gesturestart`, `gesturechange`, and `gestureend` on the canvas:
   - On `gesturestart`, record the starting `zoom` from current params and the starting client x/y.
   - On `gesturechange`, compute target zoom as `startZoom * ev.scale` (clamped to schema bounds), and call `zoomAroundCursor` around the gesture's client point. `ev.preventDefault()` must be called.
   - On `gestureend`, clear the start state.
   These events are Safari-only; non-Safari browsers will simply never fire them. Use `(ev as any).scale` since the type isn't in standard lib.dom.

4. **Keep existing pan path intact.** `pointerdown` / `pointermove` / `pointerup` for drag-to-pan must continue to work exactly as today. Do not add new pointer handlers.

5. **All three fractal slugs.** The improvements apply to mandelbrot, julia-set, and burning-ship — they share `attachFractalCanvasInteractions`. No per-slug behaviour change.

6. **Cleanup.** All new listeners must be attached with the existing `AbortController` `signal` so the returned disposer cleans them up.

## Constraints

- Edit only `src/app/fractalCanvas.ts`. No kernel changes. No renderer changes. No new files.
- Do not introduce new params, schema keys, control widgets, or kernel.init mappings.
- Do not change the existing pan or palette-cycle-keyboard handlers.
- Preserve the zoom param's schema bounds (read via the existing `clampKey` helper).
- Do not break the existing wheel preventDefault contract — page must not scroll while zooming inside the canvas.
- `npm run verify` must pass. Atomic commit. Author identity tracks the worker (e.g. `Codex GPT-5.3 <codex-gpt-5-3@local>`).
- Do NOT run `git commit` from the worker. The orchestrator will commit on verifier-pass.
- No absolute paths in committed content.
- Report the bundle-size delta in the verifier-handoff section.

## Acceptance criteria

1. `npm run verify` passes (typecheck + kernel tests + production build).
2. Only `src/app/fractalCanvas.ts` is modified.
3. `fractalCanvas.ts` registers `wheel`, `gesturestart`, `gesturechange`, `gestureend`, `pointerdown`, `pointermove`, `pointerup`, `pointercancel` on the canvas — and only these. Greppable: `addEventListener` count is 8.
4. All new listeners share the existing `AbortController` `signal`. No new `AbortController` is created.
5. Wheel handler distinguishes `ctrlKey` pinch from normal scroll and applies a higher sensitivity in the pinch branch.
6. Verifier confirms manually on the running app (`npm run dev`, all three fractal sims):
   - Mouse wheel zoom: 4–6 notches go from `zoom=1` to roughly `zoom≥10` (in) and back to `zoom≤0.3` (out).
   - macOS trackpad two-finger pinch: smooth zoom around fingertip position, no page zoom, no rubber-banding.
   - macOS trackpad two-finger scroll: still pans, unchanged feel.
   - Drag-to-pan with left mouse button: unchanged.
   - Arrow Up / Arrow Down still adjusts palette cycleSpeed (unchanged).
7. Bundle-size delta reported in verifier handoff.
8. No files outside the deliverables set are modified — except this stage card itself, which is exempt per `autometta/memory/feedback-acceptance-criterion-stage-card-exemption.md`.

## Out of scope

- Adding +/- keyboard zoom shortcuts.
- Mini-map, zoom-level HUD, "reset zoom" button.
- Touch (mobile) gesture support beyond what Safari gesture events already cover.
- Refactoring `zoomAroundCursor` per-slug branches.
- Changing default `zoom` / `centerX` / `centerY` for any sim.

## Budget

- **Worker wall-clock:** 35 minutes
- **Verifier wall-clock:** 15 minutes (manual UX exercise on macOS)

## Verifier handoff

Worker returns:

- List of modified files (should be exactly `src/app/fractalCanvas.ts`).
- Bundle-size delta (gzipped production build).
- Confirmation that `npm run verify` is green.
- A one-line confirmation that no `git commit` was invoked from the worker phase.
- A short note on the chosen wheel sensitivity numbers and any clamping ceilings, so the verifier knows the intended tactile envelope.

## Family-specific notes

- Codex worker: `</dev/null` stdin redirect; **do not run `git commit`** in your phase. Leave changes uncommitted.
- Claude verifier: cross-family per the validated pairing memory. UX-feel changes need an actual macOS browser session — static greps alone are not sufficient acceptance.
