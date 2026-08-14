# Stage card 33-markus-lyapunov-interaction: drag-pan and scroll-zoom the Lyapunov portrait

## Metadata

- **Authored:** 2026-08-14
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Claude Opus 5 <claude-opus-5@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Worker effort:** high
- **Verifier effort:** high
- **Verifier panel:** false
- **Pairing rationale:** The failure mode here is subtle rather than laborious
  — wiring the wrong one of three similarly-named slug sets, or a coordinate
  branch that pans at a plausible but wrong rate. Both roles therefore run at
  high effort, and the two families are split across worker and verifier so
  the check is genuinely independent of the build: a cross-family verifier
  re-deriving the coordinate mapping is the point, since a same-family
  verifier tends to repeat the worker's reasoning error.
- **Verifier transport:** cli. The `Verifier effort` field is inert on the sdk
  transport, which takes no effort argument.

## Re-brief 2026-08-14 round 2: fix the inverted vertical drag

Round 1 landed as `e14b28c` and was verified 7/8. Do not rebuild it — the slug
sets, the coordinate branch, the `BASE_PLANE_SPAN` import and the clamp are all
correct and `renderModes.ts` was correctly left alone. One criterion failed.

**The defect (criterion 4).** Vertical drag pans the wrong way.
`panByBitmapDelta` samples `{ y: -dy }` (`src/app/fractalView.ts:97-110`),
because the three original fractal mappings invert Y. The Markus mapping does
not: it increases plane Y with bitmap Y (`src/app/fractalView.ts:42-50`),
matching `sampleLyapunovGrid`. So the negation double-counts for this sim.

Demonstrated: an 800x600 view centred at (3,3), zoom 1, dragging +60px
downward moved `centerY` to 3.2 and carried the grabbed point from screen
y=300 to y=240. 1:1 tracking requires y=360.

Fix the sign for the markus-lyapunov branch **without** changing behaviour for
`mandelbrot`, `julia-set` or `burning-ship`, which depend on the existing
negation. Prefer making the Y convention explicit per slug over special-casing
inside the shared helper, so the next sim added here cannot inherit the same
trap silently.

## Objective

Markus–Lyapunov is currently explorable only by typing Centre A, Centre B and
Zoom into the params panel. Give it drag-pan and scroll-zoom so the portrait
can be explored by pointer, reusing the existing fractal view machinery rather
than writing a second pan/zoom path.

## Inputs (read these in your own context)

- src/app/fractalView.ts (`FractalSlug`, `complexAtPoint`, `zoomAroundPoint`,
  `panByBitmapDelta`, `isFractalViewSlug`)
- src/app/fractalCanvas.ts (`FRACTAL_SLUGS`, `isFractalSlug`, and the
  `pointerdown` / `pointermove` / `wheel` handlers from roughly line 300 on)
- src/sims/markus-lyapunov/model.ts (`LyapunovGridSpec`, `BASE_PLANE_SPAN`,
  and the `scale` derivation inside `sampleLyapunovGrid`)
- src/app/renderModes.ts (read only — see the trap below)
- src/app/presets.ts (the `"markus-lyapunov"` arm, around line 629, for the
  param shape and sane starting views)

Do not read anything else unless you need to; keep your context lean.

## The trap: three separate slug sets

There are three similarly-named sets and they do different jobs. Getting this
wrong is the most likely way this stage fails:

| Set | File | Governs | Change it? |
|---|---|---|---|
| `FractalSlug` / `isFractalViewSlug` | `src/app/fractalView.ts` | coordinate maths (screen point → plane point) | **yes** |
| `FRACTAL_SLUGS` / `isFractalSlug` | `src/app/fractalCanvas.ts` | HUD construction and pointer handler wiring | **yes** |
| `FRACTAL_SLUGS` | `src/app/renderModes.ts` | render mode selection | **no — never** |

`markus-lyapunov` currently falls through `getRenderMode` to `"field"`. Adding
it to `renderModes.ts`'s set would flip it to `"fractal"` mode and change how
it rasterises. That is a regression, not part of this stage.

## Deliverables

1. `src/app/fractalView.ts` — admit `"markus-lyapunov"` to `FractalSlug` and
   give `complexAtPoint` a branch using that sim's own mapping, which differs
   from the three existing fractals: `scale = BASE_PLANE_SPAN / (min(width,
   height) * zoom)` with `BASE_PLANE_SPAN = 2`, centred on `centerX` /
   `centerY`, matching `sampleLyapunovGrid` in `src/sims/markus-lyapunov/model.ts`
   exactly. Import or re-derive the constant; do not hardcode a second copy of
   `2` without a comment tying it to the model.
2. `src/app/fractalCanvas.ts` — admit `"markus-lyapunov"` to `FRACTAL_SLUGS`
   so the HUD and the pointer/wheel handlers wire up for it.
3. Clamp the view to the meaningful region. The logistic map only keeps orbits
   bounded for `r` in `[0, 4]`, and `sampleLyapunovPoint` returns `NaN` outside
   that square, so pan and zoom must not let the user drift into a fully empty
   plane. Keep the visible centre inside `[0, 4]²`; zoom-out should stop at
   roughly the full square rather than continuing indefinitely.

## Constraints

- Only `src/app/fractalView.ts` and `src/app/fractalCanvas.ts` may change,
  plus a test file if you add coverage.
- **Do not touch `src/app/renderModes.ts`** — see the trap table.
- Do not change `src/sims/markus-lyapunov/model.ts` or `kernel.ts`: the
  coordinate mapping is derived *from* the model, and the model is correct.
  If the view maths and the model disagree, the view is wrong.
- Do not change behaviour for `mandelbrot`, `julia-set`, `burning-ship`, or
  `logistic-mandelbrot` (which has its own `orbit3d` marker-drag path — do not
  disturb it; its drag behaviour was fixed on 2026-08-13 in `048255c`).
- Preserve the existing param panel: Centre A / Centre B / Zoom must stay
  editable by typing, and pointer interaction must keep those widgets in sync
  rather than desynchronising from them.
- Recomputation is expensive per frame at high sample counts. Do not add a
  recompute per pointermove event beyond what the existing fractal handlers
  already do; reuse their throttling/coalescing rather than inventing new.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` green (typecheck + kernel tests + production build).
2. Diff confined to the two files named in Constraints (plus any added test).
   `src/app/renderModes.ts` is unchanged — confirm by diff, explicitly.
3. `getRenderMode("markus-lyapunov")` still returns `"field"`.
4. Drag-pan tracks the pointer at 1:1, **in both axes**: grabbing a feature and
   dragging keeps it under the cursor. Verify by executing the real pan path
   with concrete numbers — feed a known view and a known bitmap delta through
   `panByBitmapDelta` and check where the grabbed point lands — and state the
   figures. Do not reason about the formula in the abstract; that is how the
   round-1 sign error survived the worker's own review. A browser is not
   required and not available: codex roles are sandboxed and every Playwright
   browser aborts before it loads a page unless the card declares
   `Requires GUI`. Cover a downward drag explicitly, since that is the case
   that failed.
5. Scroll-zoom is anchored: the plane point under the cursor stays under the
   cursor across a zoom in and back out.
6. The pan/zoom clamp holds — attempting to pan or zoom out far past the
   `[0, 4]²` square does not produce an all-empty (all-`NaN`) frame.
7. The three existing fractals and `logistic-mandelbrot` are unchanged,
   **including their vertical drag direction** — they rely on the existing
   negation, so the round-2 fix must not disturb them. Spot check pan, zoom,
   and (for logistic-mandelbrot) marker drag.
8. Typing a Centre A / Centre B / Zoom value still works, and a pointer
   interaction afterwards updates those same widgets.

## Contract test

- **Test file:** None required. If you add one, put pure coordinate-mapping
  assertions next to the existing kernel tests.
- **Assertions digest:** Any added test must assert that `complexAtPoint` for
  `markus-lyapunov` agrees with `sampleLyapunovGrid`'s own mapping at the
  centre and at a corner, for at least two zoom levels.

## Out of scope

- The Lyapunov kernel, its sampling, its sequence parameter, or its palette.
- Render mode, quality profiles, resolution presets.
- New presets, or touching the three existing fractals' behaviour.
- Any push or publish-branch work.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 30 minutes

## Verifier handoff

Worker reports: how the coordinate branch was derived and how it was checked
against `sampleLyapunovGrid`; exactly which slug sets were modified and
confirmation that `renderModes.ts` was not; how the `[0, 4]²` clamp is
enforced for both pan and zoom-out; and what was done about per-frame
recompute cost on drag.

## Family-specific notes

None
