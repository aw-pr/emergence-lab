# Stage card 58: reset restores the kernel preset select

## Metadata

- **Authored:** 2026-08-23
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Claude Opus 5 <claude-opus-5@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/58-kernel-preset-not-reset
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Pairing rationale:** the fix is a few lines; the evidence is a browser pass
  across three slugs. Verifier moved to the Codex family (2026-08-24, operator
  decision) to restore cross-family verification; the codex seat drives
  headless Chromium, hence Requires GUI.

## Objective

'Reset to defaults' does not restore the **Kernel preset** select. Found by the
stage 13 verifier on 2026-08-23 and reported there as a real defect out of that
card's scope.

On all three slugs checked the dropdown kept the user's selection after a reset
(mandelbrot `whole-set`, boids `balanced-flock`, sandpile `classic-critical`)
while every underlying parameter did return to default. The label then names a
preset whose values are no longer loaded, which is worse than either being
wrong on its own: the UI asserts something false about the running kernel.

Root cause is already identified. `buildKernelPresetRow`
(`src/app/controls.ts:773-807`) never stores its `<select>` on the instance, so
neither `syncColourControls` nor `resetToDefaults` can reach it — there is no
`kernelPreset` or `presetSelect` field anywhere in `controls.ts`. The control
postdates the reset path, landing at `7b88e64` (2026-07-18), well after
`a0ba582`.

## Inputs (read these in your own context)

- `src/app/controls.ts` (`buildKernelPresetRow` 773-807, `resetToDefaults`
  1092-1147, and how sibling controls register themselves for reset)
- `e2e/smoke.spec.ts` (existing reset and control coverage, and the headless
  patterns already in use)
- `docs/stages/13-reset-all-controls-to-defaults.md` (the reset contract this
  extends)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/app/controls.ts` — the kernel preset select is reachable from the
   instance and restored by `resetToDefaults` to the preset matching the
   defaults, following whatever registration pattern the neighbouring controls
   already use rather than inventing a second one.
2. `e2e/smoke.spec.ts` — a case that mutates the preset, resets, and asserts the
   select returns to its default on each slug that has one.

## Constraints

- Follow the existing reset mechanism. If sibling controls register through a
  common list or a `[data-param-key]` attribute, use it; do not special-case
  this one control in `resetToDefaults` if a general path exists.
- The preset select must end up naming the parameters actually loaded. If the
  defaults correspond to no named preset, the correct end state is the same
  neutral option a fresh load shows, not an arbitrary first entry.
- Reset must stay a single visual step. Do not introduce a flash where the
  select changes after the parameters.
- Do not change any preset's parameter values, or which presets exist.
- Boids, mandelbrot and abelian-sandpile must all be covered; the defect
  reproduced on all three.

## Acceptance criteria

1. `npm run verify` passes.
2. After changing the kernel preset and clicking 'Reset to defaults', the select
   shows the default option on `/#/mandelbrot`, `/#/boids` and
   `/#/abelian-sandpile`.
3. The parameters the restored preset names match the parameters actually
   loaded after reset.
4. The reset behaviour proven by card 13 still holds: every `[data-param-key]`
   input and every colour, display, speed and resolution control returns to its
   pre-mutation default.
5. The new e2e case fails against the current `dev` and passes with the fix.
6. No files unrelated to this defect are modified, except this card.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Any other control that may not reset. If one is found, report it as an
  additional finding the way stage 13's verifier did, and let it have its own
  card.
- Redesigning the preset row, or persisting preset choice across reloads.

## Budget

- **Worker wall-clock:** 40 minutes
- **Verifier wall-clock:** 30 minutes

## Verifier handoff

Return the browser evidence per slug: preset before mutation, after mutation,
and after reset, plus the parameter values backing criterion 3. Drive headless
Chromium with `--use-angle=metal --enable-gpu` and start a dev server on a port
other than 5173, which other worktrees use.

## Family-specific notes

None
