# Stage card fractal-defaults-and-cycling: Mandelbrot + Julia palette and cycling defaults

## Metadata

- **Authored:** 2026-05-26
- **Orchestrator:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Worker:** Codex GPT-5.3 <codex-gpt-5-3@local>
- **Verifier:** Claude Sonnet 4.6 <claude-sonnet-4-6@local>
- **Pairing rationale:** Cross-family per `memory/project-cross-family-verification-validated.md`. Defaults change spans kernels and the controls schema; Claude verifier confirms the per-slider override mechanism (already shipped) is respected.

## Objective

Change Mandelbrot and Julia defaults so the first impression is striking:

1. Default palette: **Inferno** (instead of whatever each currently defaults to).
2. Default colour-cycling speed: **2×** the previous default (a doubling).
3. Default schema `max` for the colour-cycling slider: **5** (so the user can push the slider to 5 without invoking the per-slider override; values above 5 should still be reachable via the existing per-slider override popover from `controls: per-slider min/max override + value persistence`, commit `6259ee5`).
4. Same three changes apply to the Burning Ship sim if it exposes the same controls — the worker checks and applies symmetrically if so; if not, Burning Ship is out of scope.

## Inputs (read these in your own context)

- `src/sims/mandelbrot/kernel.ts`
- `src/sims/julia-set/kernel.ts`
- `src/sims/burning-ship/kernel.ts` (only to check whether the same controls exist)
- `src/app/fractalCanvas.ts`
- `src/app/colormap.ts`
- `src/app/controls.ts` (for the per-slider override mechanism)
- `src/app/presets.ts`
- `docs/INTERFACE.md` (read-only)

Do not read anything else unless you need to.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/sims/mandelbrot/kernel.ts` — update `paramSchema` defaults (palette, cycling speed, cycling-slider max).
2. `src/sims/julia-set/kernel.ts` — same.
3. `src/sims/burning-ship/kernel.ts` — same if and only if it exposes the same controls (worker decides).
4. `src/sims/mandelbrot/kernel.test.cjs`, `src/sims/julia-set/kernel.test.cjs`, and Burning Ship's test file if applicable — update any default-value assertions.

## Constraints

- No modifications to `docs/INTERFACE.md`.
- The per-slider override (localStorage `el:bounds:<slug>:<paramKey>`) must continue to work — the worker does not break or duplicate that mechanism, only changes the default `max` on the schema.
- No changes to other sims.
- `npm run verify` passes. Atomic commit. Author `Codex GPT-5.3 <codex-gpt-5-3@local>`.
- No absolute paths in committed content.

## Acceptance criteria

1. `npm run verify` passes.
2. `docs/INTERFACE.md` is unchanged.
3. Mandelbrot and Julia `paramSchema` show palette default `"inferno"` (case-insensitive match acceptable).
4. The colour-cycling-speed default in both kernels is exactly doubled from its pre-stage value (worker reports the before/after values).
5. The colour-cycling-speed schema entry has `max: 5` (or higher; not less) in both kernels.
6. With localStorage cleared, loading `/#/mandelbrot` shows the Inferno palette as the initial render. Same for `/#/julia-set`.
7. The existing per-slider override popover still opens on the cycling-speed slider and still persists values to `el:bounds:<slug>:cyclingSpeed` (or the equivalent key) on both sims.
8. No files outside the deliverables set are modified — except this stage card itself.

## Out of scope

- Adding new palettes.
- Changing the per-slider override mechanism itself.
- Math-formula rendering on the fractal pages (separate card: `math-formula-rendering`).
- Other fractal-specific defaults (zoom, max iterations, escape radius).

## Budget

- **Worker wall-clock:** 25 minutes
- **Verifier wall-clock:** 10 minutes

## Verifier handoff

Worker returns:

- Before/after values for cycling speed default in both kernels.
- Whether Burning Ship was modified and why or why not.
- Confirmation that `/#/mandelbrot` and `/#/julia-set` render in Inferno on first load with cleared localStorage.
- `npm run verify` green.

## Family-specific notes

- Codex worker: `</dev/null` stdin redirect.
- Claude verifier: cross-family pairing.
