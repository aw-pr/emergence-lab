# Stage card 70-gray-scott-rebaseline: re-score the priority kernel against the current seed

## Metadata

- **Authored:** 2026-08-30
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/70-gray-scott-rebaseline
- **Worker effort:** high
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Path claims:** src/app/presets.ts, docs/sweeps/gray-scott-interestingness.md
- **Pairing rationale:** Claude worker, Codex verifier, cross-family on numeric
  acceptance. Shares the `presets.ts` claim with cards 68 and 69 so all three
  preset-touching stages serialise.

## Objective

`docs/sweeps/gray-scott-interestingness.md` carries this warning at the top:

> Historical note (2026-07-16): the score tables below were captured with the
> former raw square seed. The live kernel now generates a single approximate
> warm-start wave, so fresh absolute scores are not directly comparable.

Every Gray-Scott number in the repo therefore describes a kernel that no longer
exists, and Gray-Scott is named in `CLAUDE.md` as the priority kernel for
refinement. Worse, that file is the reference write-up the other eleven sweeps
cite for the metric definitions, and four queued metric cards (63, 65, 66, 67)
use "a Gray-Scott set reproduces its recorded scores" as their guard that a
change was inert. That guard is currently anchored to stale numbers.

Re-baseline it: re-run the sweep against the current warm-start kernel, re-score
the shipped presets, and replace the stale table.

## Inputs (read these in your own context)

- `docs/sweeps/gray-scott-interestingness.md` (the whole file — you are
  replacing its numbers, so read what they claim)
- `e2e/harness/sims.ts` (`GRAY_SCOTT`), `e2e/sweep.spec.ts`
- `src/sims/gray-scott/kernel.ts` (the warm-start seed — what changed and when)
- `src/app/presets.ts` (the Gray-Scott block)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A full re-run of the Gray-Scott sweep on the current kernel at the recorded
   harness settings (128², 700 steps), with the shipped presets re-scored as
   references in the same run so the comparison is like-for-like.
2. `docs/sweeps/gray-scott-interestingness.md` — replace the stale ranking and
   reference tables with the fresh ones, and **remove the 2026-07-16 historical
   note** once the numbers behind it are gone. Keep the file's role as the
   reference write-up for the metric definitions: the "How the harness scores a
   frame" section stays.
3. Record, plainly, how much the seed change moved things: for each shipped
   preset, old score against new score. This is the point of the card. If the
   ranking is unchanged, say so — a null result here is genuinely useful,
   because it means the other eleven write-ups' cross-references are still sound.
4. `src/app/presets.ts` — promote only if a swept set beats a shipped preset by
   more than 5% on the fresh composite, and only as a replacement for the
   preset it beats. A new visual character is a fourth-preset candidate and goes
   to Escalation, not into the file.

## Constraints

- Metric stack, composite and weights unchanged — this card re-measures, it does
  not re-instrument. If it runs after cards 63/65/66/67, those were all
  additive and the composite is unchanged, so this remains a like-for-like
  re-baseline; confirm that before starting by checking the composite is the
  same expression the write-up documents.
- Headless only; unattended.
- Cap and record the search as the established write-ups do: evaluated,
  skipped, and not-searched counts.

## Acceptance criteria

1. `npm run verify` green.
2. The sweep completes headless and the write-up's tables are fully replaced,
   with evaluated/skipped/not-searched counts.
3. Every shipped Gray-Scott preset has an old-score/new-score pair recorded.
4. The 2026-07-16 historical note is gone, and no table in the file still
   carries a pre-warm-start number.
5. Re-running one recorded set reproduces its four metric scores exactly.
6. Either a promotion carrying its delta comment and >5% margin, or a recorded
   no-promotion reading with the best candidate's numbers.

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the existing `metrics harness rewards structure over
  washout` test must still pass unmodified.

## Out of scope

- Changing the metric stack, composite or weights; kernel changes to
  Gray-Scott; re-baselining any other sim's write-up; merging; deploys.

## Budget

- **Worker wall-clock:** 150 minutes
- **Verifier wall-clock:** 45 minutes

## Escalation

If the fresh numbers show a shipped preset is now broken — a dead or saturated
field under the warm-start seed, as "Waves" was under the old seed at 0.000 —
that is a defect, not a tuning question. Record it with the frame and escalate;
do not fix it and promote in the same stage.

## Verifier handoff

Re-run `npm run verify`, the contract guard, and the sweep. Confirm the old/new
pairs are recorded for every shipped preset, that no stale number survives in
the file, and the >5% margin if a promotion landed. Judge numbers only.

## Re-brief 2026-09-01: the missing old scores, and one number that disagrees

Terminal since 2026-08-31 on one criterion of six. Criterion 3 failed because
Worms and U-skate gliders carry 'not previously measured' rather than numeric
old scores (`docs/sweeps/gray-scott-interestingness.md:62-70`, explained at
`:72-78`). Two ways to close it, and the choice is the worker's to argue:
produce the old numbers by running the previous instrument against those two
presets, or take the criterion back to the operator as unsatisfiable and say
why. Silently restating 'not previously measured' fails the same way again.

Second, independent of that criterion: the verifier's deterministic rerun
disagrees with the write-up on one figure. U-skate temporal flux reads 0.0009
at `docs/sweeps/gray-scott-interestingness.md:95-104`, but the rerun wrote
0.0015342029914791055 at `e2e/artifacts/gray-scott/results.json:1211-1217`.
Coverage, entropy and composite agree after rounding, so this is one number,
not a broken pipeline. Find out which is right and correct the loser.

Note for the gate: this card states its Assertions digest in prose and
`e2e/sweep.spec.ts:279-301` carries no AUTOMETTA-CONTRACT-BEGIN/END markers, so
`check-contract-test-gate.sh` exited 0 without recomputing anything. The gate
passed vacuously last round. Add the markers or expect the same empty pass.

## Re-brief 2026-09-01 (second): the work is done, the envelope is not

Attempt 2 stalled with `worker_envelope_missing_after_exit` after 8,431,105
tokens. No verifier ever ran. Its work is committed and preserved at
`wip/70-gray-scott-rebaseline-attempt-2` (`06df598`), authored to Claude
Sonnet 5. **Start there, not from the card.** Read it first:

    git show wip/70-gray-scott-rebaseline-attempt-2

On the face of it, that commit closes everything the previous re-brief asked
for. **Nothing in it is verified** — `npm run verify` was never recorded
green and no verifier saw any of it, so treat it as a strong draft to check,
not as trusted work:

- Retroactive old-kernel scores for the two presets that had none: Worms
  0.704 old / 0.709 new, U-skate gliders 0.143 old / 0.201 new. That was the
  criterion 3 failure.
- U-skate temporal flux corrected to 0.001534, matching the verifier's
  deterministic rerun rather than the stale 0.0009 in the write-up.
- Freeze markers added around the `metrics harness rewards structure over
  washout` test, with a real sha256 recorded in the Contract test section
  above, replacing the prose digest that let the gate pass vacuously.

It also records a pre-existing defect it found on the way: U-skate gliders
scores far below every other preset under both the old and new kernels, and
is broken rather than merely unlucky. That is a finding, not this card's work.
Leave it recorded and do not fix it here.

### Why it stalled, and the one thing to do differently

**Correction, 2026-09-01, after this re-brief caused a third stall.** The
paragraph that stood here blamed the `state -> ../emergence-lab/state`
symlink and told the next worker to remove it. That was wrong, and the worker
that followed it stalled the stage with `dispatch_configuration_fault:worker`.

The tick creates that symlink itself at every dispatch
(`scripts/tick.sh:1461`) and validates it before dispatching
(`scripts/tick.sh:1376-1388`). Removing it is what breaks the run, not what
fixes it. **Leave `state` alone; it is meant to be a symlink.**

Stage 63's warning was about something different: a worker replacing a
*tracked* `state/` tree and deleting tracked files from the run branch. The
real fragility here is that `state/handoffs/.gitkeep` and
`state/handoffs/README.md` are tracked on the run branch, so checking the
branch out materialises a real `state/` directory and the tick's `ln -s` then
lands *inside* it as `state/state` instead of replacing it. That is an
autometta defect, not this card's work.

Why attempt 2's envelope went missing is still unestablished.

**Write `state/handoffs/70-gray-scott-rebaseline.json` as soon as you have a
defensible result, and update it as you go.** An envelope recording a partial
pass is worth far more than a perfect run that exits silently: without one the
tick cannot hand the stage to a verifier at all, which is how 8.4M tokens of
finished work ended up unverified twice. Do not touch the worktree's `state/`.

Scope for this round: adopt or correct the preserved commit, confirm it,
write the envelope. The acceptance criteria above are unchanged.
