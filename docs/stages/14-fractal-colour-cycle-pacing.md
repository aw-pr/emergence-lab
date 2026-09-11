# Stage card 14-fractal-colour-cycle-pacing: Slow and smooth fractal colour cycling

## Metadata

- **Authored:** 2026-05-27
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Pairing rationale:** the one open criterion is what the palette looks
  like in a browser at low multipliers, so the browser pass sits in the Claude
  verifier seat, which is unsandboxed and can drive its own headless Chromium.
  The pacing change is already committed, so the codex worker seat is
  confirmation only and needs no browser. No `Requires GUI` declaration is
  made or needed: that field widens the codex sandbox and nothing else
  (`resolve_codex_sandbox_for_card`, autometta `scripts/models.sh`), and no
  codex role on this card touches a browser.

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

- Codex worker: stdin is redirected from `/dev/null` and you are sandboxed, so
  you cannot run a browser. Do not commit; leave changes for orchestrator
  integration.
- Claude verifier: you are unsandboxed and own the browser pass. Compare the
  effective cycle math in both renderer paths before passing, and take the
  low-multiplier evidence in your own headless Chromium.

## Re-brief 2026-08-23: the browser criterion, satisfied headlessly

This stage has been terminal since 2026-05-27 on one criterion. Its
implementation landed and is committed at `6af7104` on `dev`. Seven of the
eight criteria PASSed, including the renderer-path and defaults checks;
criterion 5 FAILed, and
`state/verifiers/14-fractal-colour-cycle-pacing.json` is explicit that the
cause was the seat rather than the code: "direct browser smoke testing could
not be completed in this verifier run: Vite started at
http://127.0.0.1:5173/, but local Chrome headless launch returned no usable
page output". The rule that closes that gap landed on 2026-08-22 in autometta
`templates/verifier-prompt.md` (`7c7f22b`), step 5 of its Required method. The
reasoning behind this round is in autometta
`docs/incidents/2026-08-16-emergence-lab-five-broken-stages.md`.

This section says how criterion 5 may now be satisfied. It does not change
what is being checked.

### Criterion 5, before and after

Before:

> Low multiplier settings no longer appear jumpy in browser smoke testing.

After:

> Low multiplier settings no longer appear jumpy in browser smoke testing.
> Establish this by the method in step 5 of `templates/verifier-prompt.md`:
> with the colour cycle multiplier at its `0.5x` minimum, capture a timed burst
> of canvas screenshots on each of Mandelbrot, Julia Set and Burning Ship, and
> show that successive frames advance in small palette steps rather than
> jumping between distant phases. Jumpiness at a low multiplier is a large
> per-frame phase step, so a burst that shows small steps is the evidence.

The claim being tested is unchanged: the palette must not jump at low
multipliers. What is new is that the card now names a measurement of it that
the verifier's seat can actually take, in place of an impression formed at a
headed window.

### How to obtain the evidence

`e2e/smoke.spec.ts` is the in-repo headless harness: Playwright with
`headless: true`, its own Vite `webServer`, canvas screenshots into
`e2e/artifacts/smoke/`. Its per-slug cases cover the three fractals and give
you a loaded route, the renderer backend attribute and a screenshot; the
timed burst at the `0.5x` minimum is not in it. The verifier prompt forbids
writing any file outside the verifier artefact, so drive the burst with a
Playwright script in a temporary directory outside the repo rather than adding
a spec here.

`playwright.config.ts` pins port 5173 with `reuseExistingServer`, and other
worktrees on this machine run dev servers. Confirm the origin you are testing
is your own worktree's server before you cite anything from it.

### The worker's job this round is confirmation only

The pacing work is committed at `6af7104` and still stands on `dev`: the
multiplier minimum is `0.5` in `src/app/simView.ts` and Julia's
`DEFAULT_CYCLE_SPEED` is `0.1` in `src/sims/julia-set/kernel.ts`. Do not
rebuild it and do not re-tune the palettes. Run `npm run verify` once, record
the result, and write your handoff envelope as your final action. Do not start
anything you then wait on: stage 16's second attempt ended its turn with "The
benchmark is running. I'll report once it lands", never wrote an envelope, and
stalled the stage after 2,196,052 tokens. Run to completion, then hand off.

### Roles this round

The original card named GPT-5.5 as orchestrator and verifier and Claude Opus
4.7 as worker, with a pairing rationale that put the browser pass in the
Codex/GPT verifier seat. The commits already on `dev` keep that authorship and
are not rewritten. The Metadata block above now names the roles the next run
uses: the browser pass moves to the Claude seat because that is the seat that
can run one, and Claude Opus 4.7 is superseded by Claude Opus 5.

## Superseded 2026-08-23

Retired without completing. The card asks (criterion 4) that all three fractals
cycle more slowly than the version published when it was authored on
2026-05-27. Later work reopened that question and answered it the other way:
`75fdb8c` (2026-07-16) seated the colour-cycle multiplier default at 1.8, and
`e2e/smoke.spec.ts` now pins that value as expected behaviour.

On the tree at retirement only julia-set is slower than the 2026-05-27
baseline (-35%); mandelbrot is 44% faster and burning-ship 75% faster. The
verifier recorded this as an evidenced FAIL rather than a sandbox limitation.

The 2026-08-23 re-brief repeated each criterion verbatim by design, which
preserved the stale baseline along with the wording. Re-briefing the criterion
against current intent is a fresh decision, not a re-run of this card.
