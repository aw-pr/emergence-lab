# Stage card 13-reset-all-controls-to-defaults: Reset restores every visible setting

## Metadata

- **Authored:** 2026-05-27
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Pairing rationale:** the acceptance turns on what happens in a browser
  when `Reset to defaults` is pressed, so the browser pass sits in the Claude
  verifier seat, which is unsandboxed and can drive its own headless Chromium.
  The implementation is already committed, so the codex worker seat is
  confirmation only and needs no browser. No `Requires GUI` declaration is
  made or needed: that field widens the codex sandbox and nothing else
  (`resolve_codex_sandbox_for_card`, autometta `scripts/models.sh`), and no
  codex role on this card touches a browser.

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

- Codex worker: stdin is redirected from `/dev/null` and you are sandboxed, so
  you cannot run a browser. Do not commit; leave the working tree for
  orchestrator integration.
- Claude verifier: you are unsandboxed and own the browser pass. Test the reset
  path in your own headless Chromium as well as reading the diff.

## Re-brief 2026-08-23: the browser criterion, satisfied headlessly

This stage has been terminal since 2026-05-27 on one criterion. Its
implementation landed and is committed at `a0ba582` on `dev`. Seven of the
eight criteria PASSed; criterion 2 FAILed, and
`state/verifiers/13-reset-all-controls-to-defaults.json` is explicit that the
cause was the seat rather than the code: "the stage handoff requires
real-browser evidence for this criterion, and browser execution was
unavailable in this verifier environment". The rule that closes that gap
landed on 2026-08-22 in autometta `templates/verifier-prompt.md` (`7c7f22b`),
step 5 of its Required method. The reasoning behind this round is in autometta
`docs/incidents/2026-08-16-emergence-lab-five-broken-stages.md`.

This section says how criterion 2 may now be satisfied. It does not change
what is being checked.

### Criterion 2, before and after

Before:

> Pressing `Reset to defaults` after changing any visible control returns the
> UI and renderer to the default values for that simulation.

After:

> Pressing `Reset to defaults` after changing any visible control returns the
> UI and renderer to the default values for that simulation. Establish this by
> the method in step 5 of `templates/verifier-prompt.md`: load `/#/<slug>`,
> move at least one control in each affected group through its
> `[data-param-key]` input, press the `Reset to defaults` button, then read
> those same inputs and the canvas `data-*` attributes back and show they hold
> the default values. Cover one fractal, Boids and Abelian Sandpile, which is
> what the Verifier handoff section already asks for.

The claim being tested is unchanged. What is new is that the card now names
evidence the verifier's seat can actually produce.

### How to obtain the evidence

`e2e/smoke.spec.ts` is the in-repo headless harness: Playwright with
`headless: true`, its own Vite `webServer`, canvas screenshots into
`e2e/artifacts/smoke/`. Its per-slug case gives you the canvas, the renderer
backend attribute, the display size and a screenshot; the reset interaction
itself is not in it. The verifier prompt forbids writing any file outside the
verifier artefact, so drive the reset with a Playwright script in a temporary
directory outside the repo rather than adding a spec here.

`playwright.config.ts` pins port 5173 with `reuseExistingServer`, and other
worktrees on this machine run dev servers. Confirm the origin you are testing
is your own worktree's server before you cite anything from it.

### The worker's job this round is confirmation only

Everything this card asked for is committed at `a0ba582` and has been extended
since by later stages. Do not rebuild it and do not modify the reset path. Run
`npm run verify` once, record the result, and write your handoff envelope as
your final action. Do not start anything you then wait on: stage 16's second
attempt ended its turn with "The benchmark is running. I'll report once it
lands", never wrote an envelope, and stalled the stage after 2,196,052 tokens.
Run to completion, then hand off.

### Roles this round

The original card named GPT-5.5 as orchestrator and verifier and Claude Opus
4.7 as worker, with a pairing rationale that put the browser pass in the
Codex/GPT verifier seat. The commits already on `dev` keep that authorship and
are not rewritten. The Metadata block above now names the roles the next run
uses: the browser pass moves to the Claude seat because that is the seat that
can run one, and Claude Opus 4.7 is superseded by Claude Opus 5.
