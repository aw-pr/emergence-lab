# Stage card 16-sandpile-larger-slower: Larger slower Abelian Sandpile

## Metadata

- **Authored:** 2026-05-27
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Pairing rationale:** the one criterion no role has ever reached is what
  the sandpile looks like in a browser, so the browser pass sits in the Claude
  verifier seat, which is unsandboxed and can drive its own headless Chromium.
  The tuning is already committed, so the codex worker seat is confirmation
  only and needs no browser. No `Requires GUI` declaration is made or needed:
  that field widens the codex sandbox and nothing else
  (`resolve_codex_sandbox_for_card`, autometta `scripts/models.sh`), and no
  codex role on this card touches a browser.

## Objective

Make Abelian Sandpile feel bigger and slower.

User target:

- Make the sandpile bigger.
- Slow it down by about 5x.
- Commit this independently from other model fixes.

Current baseline:

- `initialPile` default `100000`, max `500000`.
- `grainsPerStep` default `4`.
- `topplesPerStep` default `50000`.
- `speedProfileFor("abelian-sandpile")` initial simulation speed `4`.

## Inputs (read these in your own context)

- `src/sims/abelian-sandpile/kernel.ts`
- `src/sims/abelian-sandpile/kernel.test.cjs`
- `src/app/simView.ts`
- `src/app/colormap.ts` (read-only unless colour range needs minor visibility adjustment)
- `docs/INTERFACE.md` (read-only)
- `docs/verification.md`

## Deliverables

1. Sandpile defaults tuned so the default pattern is larger.
2. Sandpile pacing tuned so visible evolution is about 5x slower than the current default.
3. Kernel tests updated for changed defaults.
4. Browser smoke notes in the worker handoff explaining the chosen tradeoff between visible scale and startup responsiveness.

## Constraints

- Edit Abelian Sandpile and directly required speed-profile/test files only.
- Do not change other simulations.
- Do not change the SimKernel contract.
- Preserve deterministic kernel behaviour.
- Keep default startup nonblank and responsive.
- Do not run `git commit` from the worker phase.

## Acceptance criteria

1. `npm run verify` passes.
2. Abelian Sandpile defaults/tests reflect a larger default pile or equivalent larger visible pattern.
3. The default visual pace is about 5x slower than the current published version, either through kernel defaults, `speedProfileFor`, or both.
4. Browser smoke test on `/#/abelian-sandpile` shows a larger pattern forming without freezing the UI.
5. No files unrelated to Abelian Sandpile tuning are modified, except this stage card.

## Out of scope

- New sandpile rendering mode.
- GPU acceleration.
- Colour palette redesign unless the larger pattern becomes unreadable.
- Fractal or Boids tuning.

## Budget

- **Worker wall-clock:** 35 minutes
- **Verifier wall-clock:** 15 minutes

## Verifier handoff

Verifier returns:

- `overall: PASS` or `overall: FAIL`.
- Final sandpile defaults and speed-profile values.
- `npm run verify` result.
- Browser notes on size, pace, and responsiveness.

## Family-specific notes

- Codex worker: stdin is redirected from `/dev/null` and you are sandboxed, so
  you cannot run a browser. Do not commit; leave changes uncommitted.
- Claude verifier: you are unsandboxed and own the browser pass. Compare
  defaults against the current baseline listed in this card, and take the smoke
  evidence in your own headless Chromium.

## Re-brief 2026-08-23: the browser criterion, satisfied headlessly

This stage is the odd one of the four. No verifier has ever recorded a verdict
on it: both worker logs are near-empty, the first attempt died on the
`claude -p` env-strip auth defect and the second exited without a handoff
envelope, and three attempts were spent without any role forming an opinion
about the code.

**The code is nonetheless committed.** `8099310` on `dev`,
"16-sandpile-larger-slower: enlarge and slow default", carries this card's
deliverables 1 to 3: `DEFAULT_INITIAL_PILE` 100000 to 300000, the
`abelian-sandpile` speed profile 4 to 0.8, and the matching kernel test. It was
committed by the orchestrator session on 2026-05-27, the same day the stage's
worker failed to start, which is why autometta
`docs/incidents/2026-08-16-emergence-lab-five-broken-stages.md` recorded this
stage as having no committed work. It has some. What it has never had is a
verifier that looked.

Criterion 4 is a browser criterion of the same kind that left stages 13, 14
and 15 terminal, so this stage would have landed in the same place. The rule
that closes that gap landed on 2026-08-22 in autometta
`templates/verifier-prompt.md` (`7c7f22b`), step 5 of its Required method.

This section says how criterion 4 may now be satisfied. It does not change
what is being checked.

### Criterion 4, before and after

Before:

> Browser smoke test on `/#/abelian-sandpile` shows a larger pattern forming
> without freezing the UI.

After:

> Browser smoke test on `/#/abelian-sandpile` shows a larger pattern forming
> without freezing the UI. Establish this by the method in step 5 of
> `templates/verifier-prompt.md`: run the in-repo `abelian-sandpile` smoke
> case in `e2e/smoke.spec.ts`, which loads the route in headless Chromium
> against a Vite server it starts itself, asserts the canvas is visible and
> names a renderer backend, asserts a non-zero display size, asserts the
> iteration counter advances over a wait, and writes
> `e2e/artifacts/smoke/abelian-sandpile.png`. A counter that advances over the
> wait is the not-frozen half; the screenshot and the live `initialPile` value
> read off the control input are the pattern-size half.

The claim being tested is unchanged. What is new is that the card now names
evidence the verifier's seat can actually produce.

### How to obtain the evidence

`e2e/smoke.spec.ts` is the in-repo headless harness: Playwright with
`headless: true`, its own Vite `webServer`, canvas screenshots into
`e2e/artifacts/smoke/`. The verifier prompt forbids writing any file outside
the verifier artefact, so if you need an interaction the suite does not cover,
drive it with a Playwright script in a temporary directory outside the repo
rather than adding a spec here.

`playwright.config.ts` pins port 5173 with `reuseExistingServer`, and other
worktrees on this machine run dev servers. Confirm the origin you are testing
is your own worktree's server before you cite anything from it.

### Deliverable 4 moves to the verifier

Deliverable 4 asked the worker for browser smoke notes on the scale and
responsiveness tradeoff. The worker seat on this round is codex, which is
sandboxed and cannot run a browser at all: every browser aborts in
`NSApplication init` before a page loads, headless included. Write the
tradeoff from the committed values and the kernel, and do not claim a
measurement you could not take. The browser evidence for criterion 4 is the
verifier's to produce.

### Why attempt 2 stalled, and what is different this time

The requeue on 2026-08-16 was the right call and it worked: the worker got
past the login refusal that killed attempt 1 and ran. It then ended its turn
with a 75-byte log reading "The benchmark is running. I'll report once it
lands", having spent 2,196,052 tokens, and never wrote its handoff envelope.
`state.yaml` recorded `worker_envelope_missing_after_exit`. The envelope is
the loop's only completion signal, so a role that defers its result to a
measurement it is no longer running to collect stalls the stage however much
work it did. Nothing in the tooling failed on that attempt.

So this round is not a repeat of that requeue. The worker seat changes family,
the job is confirmation only, and the instruction is explicit: do not start
anything you then wait on. Run each check to completion, then write the
envelope as your final action, even if something you would have liked to
measure is incomplete. A `partial` envelope that says what is missing is worth
more to this loop than a turn that ends waiting.

### The tree has moved since 2026-05-27, and this stage does not move it back

Later deliberate work has superseded parts of this card's tuning targets:

- `f44c65d` (2026-06-06), "tune(sandpile): fill the screen fast".
- `417776b` (2026-06-06), "tune(sandpile): default simulation speed back to 1".

Current values on `dev` are `DEFAULT_INITIAL_PILE` 450000, larger still than
this card asked for, and an `abelian-sandpile` speed profile of 1 against the
pre-stage baseline of 4, so four times slower rather than the five this card
named. Criteria 2 and 3 are judged against the tree as it stands, not against
the May values quoted in the Objective. This card does not re-tune the
sandpile: if a criterion no longer holds because later work deliberately moved
a value, that is a finding to record in `additional_findings`, not a licence
to change code.

### The worker's job this round is confirmation only

The tuning is committed at `8099310` and has been superseded in part as above.
Do not rebuild it and do not re-tune the sandpile. Run `npm run verify` once,
record the result, write the deliverable 4 tradeoff note from the committed
values, and write your handoff envelope as your final action.

### Roles this round

The original card named GPT-5.5 as orchestrator and verifier and Claude Opus
4.7 as worker, with a pairing rationale that put the browser pass in the
Codex/GPT verifier seat. `8099310` keeps its authorship and is not rewritten.
The Metadata block above now names the roles the next run uses: the browser
pass moves to the Claude seat because that is the seat that can run one, and
Claude Opus 4.7 is superseded by Claude Opus 5.

## Superseded 2026-08-23

Retired without running. Criterion 3 asks for a default pace about 5x slower
than the version published when the card was authored on 2026-05-27. That
change landed as `8099310` and was deliberately reversed ten days later by
`417776b` ("default simulation speed back to 1") and `f44c65d` ("fill the
screen fast"), then retuned again by `42960a0` (2026-07-06, "larger default
pile, lighter per-frame topples").

`speedProfileFor` returns `initial: 1` for abelian-sandpile at retirement,
matching the revert. Running the card could only fail, or invite a worker to
undo the June and July tuning decisions.
