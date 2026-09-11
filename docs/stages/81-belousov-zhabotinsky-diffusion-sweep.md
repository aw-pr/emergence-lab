# Stage card 81-belousov-zhabotinsky-diffusion-sweep: the three rates the feed/kill sweep held fixed

## Metadata

- **Authored:** 2026-09-06
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5 <claude-opus-5@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/81-belousov-zhabotinsky-diffusion-sweep
- **Worker effort:** high
- **Verifier effort:** medium
- **Verifier panel:** false
- **Path claims:** docs/sweeps/belousov-zhabotinsky-interestingness.md, e2e/harness/sims.ts
- **Pairing rationale:** cross-family, worker family alternating from card
  80. The Codex synthesis seat designs a bounded sweep; the Claude verifier
  reruns it headlessly. Claims are disjoint from card 80 so the two may
  pipeline; they overlap card 77 on `sims.ts`, which will have landed.
- **Type:** Measurement sweep on unsearched axes. No promotion.

## Surfacing concern

The BZ write-up records that `diffusionA`, `diffusionB` and `diffusionC` were
not searched at all, and that "the three diffusion rates set front width and
spiral pitch, and the shipped presets differ in all three, so the sweep ranks
these presets only on their feed/kill placement." The three shipped presets
are therefore ranked on an axis they do not vary along, and unranked on the
ones they do.

## Inputs (read these in your own context)

- `docs/sweeps/belousov-zhabotinsky-interestingness.md` — the whole file
- `e2e/harness/sims.ts` — the `BELOUSOV_ZHABOTINSKY` block and `SimSweepConfig`
- `src/sims/belousov-zhabotinsky/kernel.ts` — the slider ranges and the
  kernel's own note on damping

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A diffusion sweep design of at most twelve sets: hold feed and kill at the
   "Spiral waves" values, and vary the three rates along one line through
   parameter space that passes through all three shipped presets' diffusion
   triples, plus at most two off-line probes. State the line and why in the
   appendix before the table.
2. The axes added to the config as a second sweep entry or a `dyingValue`-style
   switch, whichever the harness supports without changing other sims'
   configs. Do not replace the feed/kill axes.
3. A dated appendix: the table, whether the three presets now rank differently
   from their feed/kill placement, and which single diffusion triple the
   composite prefers at Spiral waves' feed/kill.
4. A promotion recommendation or an explicit "none", with the reason.

## Constraints

- No preset change. `src/app/presets.ts` is not in your claims.
- No metric, weight, threshold or composite change.
- Headless only: `SWEEP=1 npx playwright test sweep.spec.ts -g "sweep belousov"`.
- Every other sim's config in `sims.ts` is untouched.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes unmodified.
3. The sweep ran at most twelve sets and the appendix lists all of them with
   the line they lie on.
4. The three references are re-scored in the same run and their scores match
   the 2026-08-23 write-up to the third decimal, proving nothing else moved.
5. The appendix answers the ranking question in one sentence with the numbers.
6. The recommendation section is present and names a promotion or "none".

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the freeze-marker block stage 70 added around the
  `metrics harness rewards structure over washout` test, with its recorded
  sha256, must still validate unchanged. Do not write the literal marker tokens
  into this card's prose.

## Out of scope

- Promoting anything. A promotion is its own card with a browser check.
- `stepsPerFrame`, the fourth unsearched param; it is a speed control.
- Widening feed or kill.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If the three references do not reproduce to the third decimal, stop: something
other than the new axis moved, and the numbers are not comparable. Report the
drift and do not fill the table.

## Verifier handoff

Check criterion 4 first, from your own rerun, before anything else in the
appendix is read as meaningful. Then confirm the twelve-set bound from the
config, not the prose.

## Re-card (2026-09-06, Codex session limit reached)

The Codex provider window is exhausted for this session, so the worker seat
moved from `GPT-5.6 Sol` to `Claude Opus 5`, at the worker effort of high the
card already specifies. The verifier (Claude Sonnet 5) is unchanged, so the
pair is still cross-model.

The Metadata pairing rationale above is left standing as the record of what was
designed; its "Codex synthesis seat" is now an Opus seat, and the claim of
cross-family alternation from card 80 no longer holds. The sweep bounds, the
three diffusion axes and the no-promotion rule are untouched.
