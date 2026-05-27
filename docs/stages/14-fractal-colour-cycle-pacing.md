# Stage card 14-fractal-colour-cycle-pacing: Slow and smooth fractal colour cycling

## Metadata

- **Authored:** 2026-05-27
- **Orchestrator:** GPT-5.5 <gpt-5-5@local>
- **Worker:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Verifier:** GPT-5.5 <gpt-5-5@local>
- **Pairing rationale:** Codex/GPT frames the interaction/design target; Claude executes the constrained tuning; Codex/GPT verifies all three fractals in browser and against the build gate.

## Objective

Make colour cycling on Mandelbrot, Julia Set, and Burning Ship slower and less jumpy at usable settings.

User report:

- Colour cycling is jumpy at lower cycle multipliers.
- Set the colour cycle multiplier minimum to `0.5x` on fractals to avoid the jumpy lower range.
- Julia Set should default to `cycleSpeed = 0.1` unless the implementation finds a better shared pacing mechanism.
- Colour cycling feels too fast across all fractals.
- Investigate whether slowing should be achieved by raw speed defaults, a renderer-side scale factor, or more colour spread / phase distribution rather than only lowering the slider.

## Inputs (read these in your own context)

- `src/app/simView.ts`
- `src/app/webglRenderer.ts`
- `src/app/canvasRenderer.ts`
- `src/app/colormap.ts`
- `src/sims/mandelbrot/kernel.ts`
- `src/sims/mandelbrot/kernel.test.cjs`
- `src/sims/julia-set/kernel.ts`
- `src/sims/julia-set/kernel.test.cjs`
- `src/sims/burning-ship/kernel.ts`
- `src/sims/burning-ship/kernel.test.cjs`
- `docs/stages/07-cycling-units-mismatch.md`
- `docs/stages/08-fractal-cycle-defaults-stale.md`
- `docs/INTERFACE.md` (read-only)

## Deliverables

1. A short design note in the worker handoff comparing the two viable approaches:
   - lower per-kernel `cycleSpeed` defaults,
   - add a shared renderer-side palette-cycle rate/spread adjustment that applies consistently to WebGL2 and Canvas2D paths.
2. A scoped implementation that makes the default visual cycle materially slower across all three fractals.
3. Fractal colour cycle multiplier control updated so its minimum is `0.5x`.
4. Julia Set default cycle speed set to `0.1` unless the design note justifies an equivalent or better shared pacing solution.
5. Kernel tests updated for any changed default constants.

## Constraints

- Do not change `docs/INTERFACE.md`.
- Keep the CPU/Canvas and WebGL2 colour-cycle semantics consistent; do not reintroduce the units mismatch fixed by stage 07.
- Do not remove palette-cycle keyboard controls.
- Do not change fractal zoom/pan behaviour from stages 09 and 11.
- Keep commits independent: this card's eventual commit should include only fractal colour pacing and directly required tests.
- Do not run `git commit` from the worker phase.

## Acceptance criteria

1. `npm run verify` passes.
2. Fractal cycle multiplier slider minimum is `0.5x`; the default remains inside the slider bounds.
3. Julia Set schema/test default for `cycleSpeed` is `0.1`, unless the worker handoff documents and implements an equivalent shared pacing scale that makes Julia's default visual cycle no faster than the requested target.
4. Mandelbrot, Julia Set, and Burning Ship cycle visibly more slowly at defaults than the current published version.
5. Low multiplier settings no longer appear jumpy in browser smoke testing.
6. WebGL2 and Canvas2D fallback paths use the same effective cycle-speed model.
7. Reset-to-defaults after stage 13 restores the new fractal cycle defaults and multiplier.
8. No files outside the listed fractal/renderer/control files and tests are modified, except this stage card.

## Out of scope

- Changing fractal geometry defaults other than `cycleSpeed` or palette pacing.
- Adding new palette presets.
- Boids or sandpile tuning.
- Reworking colour dashboard layout.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 25 minutes

## Verifier handoff

Verifier returns:

- `overall: PASS` or `overall: FAIL`.
- Chosen pacing approach and why.
- Files changed.
- `npm run verify` result.
- Browser notes for Mandelbrot, Julia Set, and Burning Ship at default and low multiplier settings.

## Family-specific notes

- Claude worker: do not commit. Leave changes for orchestrator integration.
- Codex/GPT verifier: compare the effective cycle math in both renderer paths before passing.
