# Stage card 13-reset-all-controls-to-defaults: Reset restores every visible setting

## Metadata

- **Authored:** 2026-05-27
- **Orchestrator:** GPT-5.5 <gpt-5-5@local>
- **Worker:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Verifier:** GPT-5.5 <gpt-5-5@local>
- **Pairing rationale:** Codex/GPT supplies the bug diagnosis and acceptance route; Claude executes the UI/control fix; Codex/GPT verifies the result against the repo gate and browser behaviour.

## Objective

Fix the Reset-to-defaults path so it restores every visible setting for the active simulation, not only kernel `paramSchema` values.

Current suspected bug: `ControlsPanel.resetToDefaults()` rebuilds params from `paramSchema`, clears persisted param values/bounds, and calls `onReset()`, but it does not reset renderer-side settings such as the simulation speed / colour cycle multiplier, colour options, or display options. This is visible on fractals where the colour cycle multiplier can remain at the user's old value after pressing Reset to defaults.

## Inputs (read these in your own context)

- `src/app/controls.ts`
- `src/app/simView.ts`
- `src/app/colormap.ts`
- `src/app/renderer.ts`
- `src/app/persistence.ts`
- `docs/INTERFACE.md` (read-only)
- `docs/verification.md`

Do not read unrelated simulation kernels unless needed to confirm a default source.

## Deliverables

1. `src/app/controls.ts` updated so Reset to defaults also resets:
   - simulation speed / colour cycle multiplier control,
   - colour dashboard options,
   - display options such as Boids point display size,
   - persisted local values and bounds already covered today.
2. `src/app/simView.ts` updated only if the control panel needs explicit default values or callbacks to make the reset complete.
3. Focused tests if a pure helper seam already exists or can be added without broad refactor. Otherwise document why manual browser verification is the right gate.

## Constraints

- Do not change `docs/INTERFACE.md`.
- Preserve the distinction between `Reset` and `Reset to defaults`: `Reset` should restart the current parameter set; `Reset to defaults` should restore defaults.
- No broad control-panel refactor. Keep the fix local to the reset path and the default values already passed into `ControlsPanel`.
- Do not change any simulation defaults in this card. That belongs in the per-model cards.
- Do not run `git commit` from the worker phase.

## Acceptance criteria

1. `npm run verify` passes.
2. Pressing `Reset to defaults` after changing any visible control returns the UI and renderer to the default values for that simulation.
3. Fractal colour cycle multiplier resets to its default value and the slider label updates.
4. Colour preset, gamma, contrast, invert, and cycle direction reset to default colour options for the simulation and the legend updates.
5. Boids display size resets to its default when changed.
6. Existing localStorage values for params and bounds are cleared as before; no new stale persisted state is introduced.
7. `Reset` still restarts the current state without overwriting user-selected defaults.
8. No files outside the deliverables are modified, except this stage card.

## Out of scope

- Changing fractal cycle speed defaults.
- Boids density, point size, or speed tuning.
- Sandpile scale/speed tuning.
- Changing the kernel-to-renderer interface.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 20 minutes

## Verifier handoff

Verifier returns:

- `overall: PASS` or `overall: FAIL`.
- Files changed.
- `npm run verify` result.
- Browser evidence for Reset-to-defaults on at least one fractal, Boids, and Abelian Sandpile.
- Confirmation that `Reset` still preserves current user choices.

## Family-specific notes

- Claude worker: do not commit. Leave the working tree dirty for orchestrator integration.
- Codex/GPT verifier: test in a real browser as well as reading the diff.
