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
