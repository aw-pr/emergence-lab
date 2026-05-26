# Stage card 11-fractal-drag-pan-responsive: Image follows mouse 1:1 during fractal drag-pan

## Metadata

- **Authored:** 2026-05-26
- **Orchestrator:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Worker:** Codex GPT-5.3 <codex-gpt-5-3@local>
- **Verifier:** Claude Sonnet 4.6 <claude-sonnet-4-6@local>
- **Pairing rationale:** Cross-family per `memory/project-cross-family-verification-validated.md`. UX-feel change in one file, no kernel involvement; Claude verifier exercises drag-pan in a real browser on all three fractal sims and confirms there is no double-shift on pointerup.

## Objective

Today's drag-pan (`src/app/fractalCanvas.ts:265–277`, `pointermove` handler) calls `panByBitmapDelta` → `applyCenterZoom` → `setParams` → `Renderer.setParams` on **every** pointermove event. Each `setParams` triggers `reinitFromCanvasSize`, which re-runs the kernel's `init` for the new centre (re-computing the iteration field over the whole canvas at the current `maxIterations`). At default `maxIterations = 128` and a typical viewport, this is hundreds of thousands of iterations per pointermove event — easily 30–50ms — so the image lags well behind the cursor and the drag feels mushy.

Make drag-pan responsive: during a drag, the existing canvas pixels should translate 1:1 with the cursor, and the kernel should re-init **once**, on `pointerup`, with the equivalent `centerX`/`centerY` shift applied. The translation is purely visual; the kernel state is unchanged until the drag ends.

Approach: while a pan drag is active, set a CSS `transform: translate3d(dx, dy, 0)` on the `canvas` element (`dx`, `dy` accumulated in CSS pixels from the drag origin) and skip the per-move kernel re-init. On `pointerup`, compute the equivalent params delta from the accumulated drag, clear the inline transform, and call `setParams` once with the new `centerX`/`centerY`. This applies to all three fractal slugs (`mandelbrot`, `julia-set`, `burning-ship`).

Net: 1:1 visual tracking during drag, single kernel reinit at the end, no flicker or double-shift on release.

## Inputs (read these in your own context)

- `src/app/fractalCanvas.ts`
- `src/app/renderer.ts` (read-only — confirms `setParams` triggers `reinitFromCanvasSize`)
- `src/sims/mandelbrot/kernel.ts` (read-only — for `centerX`/`centerY` schema bounds)
- `src/sims/julia-set/kernel.ts` (read-only)
- `src/sims/burning-ship/kernel.ts` (read-only)

Do not read anything else.

## Deliverables

Edit only `src/app/fractalCanvas.ts`. Make the following behaviour changes to `attachFractalCanvasInteractions`:

1. **Drag state.** When a left-button `pointerdown` starts a drag (existing branch), in addition to capturing `lastClientX`/`lastClientY` and the pointer, also capture:
   - the drag-origin client x/y,
   - the params snapshot at drag start (so the end-of-drag delta is computed against a single anchor rather than accumulated through dirty intermediates).

2. **Per-move visual translate.** In the `pointermove` handler:
   - Compute the cumulative client-pixel delta from drag origin (not the per-event bitmap delta).
   - Apply `canvas.style.transform = "translate3d(<dxCss>px, <dyCss>px, 0)"`.
   - Do **not** call `setParams` while the drag is in progress. Skip the existing `panByBitmapDelta` call inside the drag branch.

3. **Pointerup commit.** In the `endDrag` path, before clearing `dragPointerId`:
   - Compute the bitmap-pixel delta equivalent to the accumulated CSS-pixel delta (use the existing `bitmapDelta`-style ratio from `canvas.width / rect.width` and `canvas.height / rect.height`).
   - Clear the inline `transform` on the canvas: `canvas.style.transform = ""`.
   - Call `panByBitmapDelta(snapshotParams, bitmapDx, bitmapDy)` **once** with the drag-start params snapshot (not the live `getParams()`), so the same physical drag distance always commits the same `centerX`/`centerY` shift regardless of how many pointermove events fired.

4. **Cancel-safety.** On `pointercancel`, clear the inline transform **without** committing the drag — the drag is abandoned, the kernel state is already correct, so just snap the canvas back to origin and reset drag state.

5. **Existing pan path removed for fractals.** The current `pointermove` branch that calls `panByBitmapDelta(getParams(), dx, dy)` must be removed (or guarded out of the drag branch entirely). It is superseded by the transform-then-commit flow above. The per-move `lastClientX/Y` update used by the old delta path is no longer needed; remove it if it has no other reader.

6. **Wheel zoom, ctrlKey pinch, gesture events.** These are added by stage card 09. Stage 11 must not regress them. If 09 lands first, leave its code intact; if 11 lands first, 09 will rebase on top. The `transform` is only set/cleared inside the drag branch — wheel zoom must not touch it.

7. **No CSS file change.** The `transform` is applied as an inline style on the existing `<canvas>` element; no class additions, no stylesheet edits.

8. **Cleanup.** Listener registration continues to use the existing `AbortController` `signal`. No new `AbortController`.

## Constraints

- Edit only `src/app/fractalCanvas.ts`. No kernel changes. No renderer changes. No new files. No CSS files.
- Do not change any other input/interaction handler (palette-cycle keyboard, wheel zoom, gesture events). Do not change the function signature of `attachFractalCanvasInteractions`.
- Do not introduce new params, schema keys, or control widgets.
- Preserve `centerX` / `centerY` schema bounds via the existing `clampKey`. The end-of-drag commit must respect them.
- No flicker on commit: by the time `setParams` runs (which triggers reinit), the inline transform must already be cleared so the painted new state isn't double-shifted.
- `npm run verify` must pass. Atomic commit. Author identity tracks the worker.
- Do NOT run `git commit` from the worker.
- No absolute paths in committed content.
- Report the bundle-size delta in the verifier-handoff section.

## Acceptance criteria

1. `npm run verify` passes (typecheck + kernel tests + production build).
2. Only `src/app/fractalCanvas.ts` is modified.
3. `fractalCanvas.ts` calls `canvas.style.transform = "translate3d(...)"` in the drag-pan `pointermove` branch and `canvas.style.transform = ""` in both the commit and cancel paths.
4. `fractalCanvas.ts` calls `setParams` (via `panByBitmapDelta` or directly) **zero** times inside the `pointermove` handler when a drag is active. Greppable: the `pointermove` handler body must not contain `panByBitmapDelta(` or `setParams(` in the drag branch.
5. The end-of-drag commit reads from a drag-start params snapshot, not from `getParams()` at pointerup time. Greppable: the snapshot variable is referenced in the `endDrag` path.
6. Verifier confirms manually on the running app (`npm run dev`, all three fractal sims):
   - Drag-pan: image tracks cursor 1:1 during the drag with no visible lag. No flicker / no jump on release. The new centre matches where the user dropped the image. No motion sickness on rapid pans.
   - Wheel zoom: still works, still centred on cursor (stage 09 contract).
   - Pinch zoom on macOS trackpad (if stage 09 is landed): still works.
   - Palette cycle keyboard (Arrow Up / Down): unchanged.
   - Reset-to-defaults followed by drag: drag still tracks 1:1; no leftover transform after a `Reset` press during a drag.
7. Bundle-size delta reported in verifier handoff.
8. No files outside the deliverables set are modified — except this stage card itself.

## Out of scope

- Smooth-pan momentum / inertia after pointerup.
- Sub-pixel filtering / texture interpolation tweaks.
- A "loading shimmer" or progress hint during the post-commit kernel re-init.
- Refactoring `zoomAroundCursor` / `panByBitmapDelta` per-slug branches.
- Touch-on-iPad multi-finger pan beyond what the existing pointer events already cover.

## Budget

- **Worker wall-clock:** 30 minutes
- **Verifier wall-clock:** 15 minutes (manual UX exercise on macOS)

## Verifier handoff

Worker returns:

- List of modified files (should be exactly `src/app/fractalCanvas.ts`).
- Bundle-size delta (gzipped production build).
- Confirmation that `npm run verify` is green.
- A one-line confirmation that no `git commit` was invoked.
- A short note on how the drag-start params snapshot is held (variable name, scope) so the verifier can audit cancel-vs-commit isolation.

## Family-specific notes

- Codex worker: `</dev/null` stdin redirect; **do not run `git commit`**. Leave changes uncommitted.
- Claude verifier: cross-family per the validated pairing memory. UX-feel change — needs an actual browser session on macOS, not just static greps.
- Order with stage 09: cards 09 and 11 both edit `fractalCanvas.ts`. If 09 lands first (already in flight at card-authoring time), 11 must rebase on top of it without removing the wheel-zoom, ctrlKey-pinch, or gesture event listeners that 09 added.
