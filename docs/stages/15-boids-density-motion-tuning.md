# Stage card 15-boids-density-motion-tuning: Larger denser faster Boids

## Metadata

- **Authored:** 2026-05-27
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Pairing rationale:** the one open criterion is what the flock looks like
  in a browser, so the browser pass sits in the Claude verifier seat, which is
  unsandboxed and can drive its own headless Chromium. The tuning is already
  committed, so the codex worker seat is confirmation only and needs no
  browser. No `Requires GUI` declaration is made or needed: that field widens
  the codex sandbox and nothing else (`resolve_codex_sandbox_for_card`,
  autometta `scripts/models.sh`), and no codex role on this card touches a
  browser.

## Objective

Tune Boids so the flock is visibly denser, larger, and faster.

User target:

- Increase point size so the minimum is about 16 times the current minimum.
- Increase boid count by about 10x.
- Increase movement rate by about 10x.
- Commit this independently from other model fixes.

Current baseline from `src/sims/boids/kernel.ts`:

- `boidCount` default `80`, max `400`.
- `maxSpeed` default `2`, max `8`.
- `pointSize` default `6`, min `1`, max `16`.
- `simView` default display dot size for Boids is `2`.

## Inputs (read these in your own context)

- `src/sims/boids/kernel.ts`
- `src/sims/boids/kernel.test.cjs`
- `src/app/webglRenderer.ts`
- `src/app/simView.ts`
- `src/app/renderer.ts`
- `docs/INTERFACE.md` (read-only)
- `docs/verification.md`

## Deliverables

1. Boids defaults and bounds tuned toward the target:
   - point-size minimum around `16`,
   - default point size at or above the new minimum,
   - boid-count default about 10x current if performance allows,
   - movement speed about 10x current if performance allows.
2. Update any renderer glyph clamping that prevents the larger point-size control from taking effect.
3. Update Boids tests for changed metadata/defaults.
4. If the exact 10x target is too slow because the kernel is still O(n²), document the measured fallback and choose the highest usable default that keeps the browser responsive.

## Constraints

- Edit Boids and directly required renderer/control files only.
- Do not change other simulations.
- Do not change the SimKernel contract.
- Keep Boids deterministic for the same params and steps.
- Keep the browser responsive at default settings on a normal laptop.
- Do not run `git commit` from the worker phase.

## Acceptance criteria

1. `npm run verify` passes.
2. `boidCount`, `maxSpeed`, and `pointSize` defaults/tests reflect the chosen tuning.
3. The visible glyph size is materially larger in WebGL2; no shader clamp silently caps it at the old size.
4. Browser smoke test on `/#/boids` shows a denser flock with faster motion and no blank canvas.
5. Default Boids remains responsive enough for interactive controls.
6. No files unrelated to Boids tuning are modified, except this stage card.

## Out of scope

- Spatial hashing or kernel algorithm rewrite.
- New Boids controls.
- Colour palette redesign.
- Fractal or sandpile tuning.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 20 minutes

## Verifier handoff

Verifier returns:

- `overall: PASS` or `overall: FAIL`.
- Final chosen Boids defaults and bounds.
- `npm run verify` result.
- Browser performance/visual notes.
- Any follow-up recommendation if O(n²) prevents the full 10x target.

## Family-specific notes

- Codex worker: stdin is redirected from `/dev/null` and you are sandboxed, so
  you cannot run a browser. Do not commit; leave changes uncommitted.
- Claude verifier: you are unsandboxed and own the browser pass. Pay particular
  attention to the WebGL glyph clamp and default-frame responsiveness, and take
  the smoke evidence in your own headless Chromium.

## Re-brief 2026-08-23: the browser criterion, satisfied headlessly

This stage has been terminal since 2026-05-27 on one criterion. Its
implementation landed and is committed at `38b5e6d` on `dev`. Five of the six
criteria PASSed, including the glyph-clamp check; criterion 4 FAILed, and
`state/verifiers/15-boids-density-motion-tuning.json` is explicit that the
cause was the seat rather than the code: "Overall is FAIL only because the
required browser smoke test could not be executed to completion in this
sandbox." The rule that closes that gap landed on 2026-08-22 in autometta
`templates/verifier-prompt.md` (`7c7f22b`), step 5 of its Required method. The
reasoning behind this round is in autometta
`docs/incidents/2026-08-16-emergence-lab-five-broken-stages.md`.

This section says how criterion 4 may now be satisfied, and settles the
point-size ambiguity the incident doc flagged. It does not change what is
being checked.

### Criterion 4, before and after

Before:

> Browser smoke test on `/#/boids` shows a denser flock with faster motion and
> no blank canvas.

After:

> Browser smoke test on `/#/boids` shows a denser flock with faster motion and
> no blank canvas. Establish this by the method in step 5 of
> `templates/verifier-prompt.md`: run the in-repo `boids` smoke case in
> `e2e/smoke.spec.ts`, which loads the route in headless Chromium against a
> Vite server it starts itself, asserts the canvas is visible and names a
> renderer backend, asserts a non-zero display size, asserts the iteration
> counter advances over a wait, and writes `e2e/artifacts/smoke/boids.png`.
> That is the no-blank-canvas and motion half. For density and speed, read the
> live `boidCount` and `maxSpeed` values off the control inputs in the same
> page and cite them alongside the screenshot.

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

### The point-size question the incident doc left open, settled

This stage's worker pinned `pointSize` at `min = max = 16`, which made the
slider degenerate, and flagged that `boidsGlyphRadius()` still clamped at 8.
The card's wording was genuinely ambiguous about whether `16` was a minimum or
a fixed value. The operator settled it on 2026-06-01 in `187c087`, whose own
message reads "the glyph was locked at 16px": it restored a usable range of
`min: 4, max: 16` and shrank the default, because a 16px floor is unreadable
at the boid counts that same commit made possible. `16` was a ceiling for the
glyph, never a fixed value. Do not restore the degenerate slider.

### The tree has moved since 2026-05-27, and this stage does not move it back

Later deliberate work has superseded parts of this card's tuning targets:

- `187c087` (2026-06-01) added spatial binning, raised the count ceiling and
  shrank the default glyph.
- `4f2bcf3` (2026-08-16) set clustered initial flocks and a 1x default speed
  to match the native viewer.

Current values on `dev` are `boidCount` 17777, `maxSpeed` 36, `pointSize`
default 4 with `min: 4, max: 16`, against a pre-stage baseline of 80, 2 and 6.
Criteria 2 and 3 are judged against the tree as it stands, not against the May
values quoted in the Objective. This card does not re-tune Boids: if a
criterion no longer holds because later work deliberately moved a value, that
is a finding to record in `additional_findings`, not a licence to change code.

### The worker's job this round is confirmation only

The tuning is committed at `38b5e6d` and has been superseded in part as above.
Do not rebuild it and do not re-tune Boids. Run `npm run verify` once, record
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
