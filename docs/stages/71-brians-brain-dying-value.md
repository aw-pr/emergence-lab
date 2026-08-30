# Stage card 71-brians-brain-dying-value: search the one axis Brian's Brain never tried

## Metadata

- **Authored:** 2026-08-30
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/71-brians-brain-dying-value
- **Worker effort:** high
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Path claims:** src/app/presets.ts, docs/sweeps/brians-brain-interestingness.md, e2e/harness/sims.ts
- **Pairing rationale:** Codex worker, Claude verifier, cross-family on numeric
  acceptance, matching stages 60–62. Path claims overlap the other
  preset-touching cards so the slate stays serial.

## Objective

The 2026-08-23 sweep ranked a candidate (birth 1, seed 0.18) above the shipped
"Classic waves" (0.174 against 0.071) but the write-up explicitly recommends
**not** promoting on that number: the candidate wins purely on coverage while
being less structured (autocorrelation 0.10 against 0.32). Its stated
conclusion is that if "Classic waves" changes at all, the case would be to raise
its coverage while keeping `birthCount` 2 — which seedDensity cannot do, and
which would need the `dyingValue` axis the sweep never searched.

This card searches that axis. **It carries a methodological trap that must be
handled before any number is trusted.**

## The trap — read this before designing the sweep

`dyingValue` sets the brightness of the refractory state and nothing else about
the dynamics. It is an **intensity**, and the harness scores intensity fields
against a fixed `coverageThreshold` of 0.25. So moving `dyingValue` across that
threshold changes *what counts as covered* rather than what the sim does: a run
with `dyingValue` 0.2 and one with 0.3 have identical dynamics and different
coverage scores, purely as an artefact.

A naive sweep of this axis will therefore produce a confident, entirely
spurious ranking that a coverage-weighted composite will happily reward. Do not
produce that. Decide and document how you separate the artefact from any real
effect before you sweep — for example by scoring the firing channel alone, by
holding the effective threshold at a fixed position relative to `dyingValue`,
or by demonstrating that the dynamics are invariant and reporting the axis as
cosmetic only. Whichever route you take, state it in the write-up and justify it.

A defensible negative result — "this axis is cosmetic, here is the proof, no
promotion is possible through it" — is a full pass for this card.

## Inputs (read these in your own context)

- `docs/sweeps/brians-brain-interestingness.md` — the whole file; the
  `dyingValue` discussion around the "Coverage of the search" section and the
  closing recommendation are the brief
- `e2e/harness/sims.ts` (`BRIANS_BRAIN` — the coverage threshold and channel)
- `src/sims/brians-brain/kernel.ts` (what `dyingValue` actually touches —
  confirm for yourself that it is intensity-only and nothing else)
- `src/app/presets.ts` (the three Brian's Brain presets; two set `dyingValue`
  away from 0.5, at 0.62 and 0.42)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A documented method for scoring this axis without the coverage artefact,
   with the reasoning, written into the appendix before the results.
2. A sweep over `dyingValue` at `birthCount` 2, held there per the write-up's
   recommendation, with the evaluated/skipped counts.
3. A dated appendix in `docs/sweeps/brians-brain-interestingness.md` recording
   the method, the ranked table, and — this is the actual question — whether
   "Classic waves" coverage can be raised at `birthCount` 2 through this axis.
4. Note that the sweep's existing reference scores for two shipped presets are
   **not** strictly comparable to swept sets, because they set `dyingValue`
   away from the pinned 0.5. Your method should fix that or state that it does
   not; either way say so.
5. `src/app/presets.ts` — promote only if the axis produces a real, non-artefact
   improvement to "Classic waves" at `birthCount` 2. Otherwise promote nothing.

## Constraints

- Metric stack, composite and weights unchanged. If your method needs a
  different coverage threshold for this sim, that is a per-sim config change in
  `e2e/harness/sims.ts`, not a metric change — and it must be recorded as
  making the new numbers incomparable to the 2026-08-23 table.
- Headless only; unattended.
- **Do not promote the birth-1/seed-0.18 candidate.** The write-up already
  rejected it on the grounds that it wins on coverage while being less
  structured, and that judgement stands.

## Acceptance criteria

1. `npm run verify` green.
2. The appendix documents the artefact-separation method and its justification
   before presenting any ranking.
3. The sweep completes headless with evaluated/skipped counts recorded.
4. The appendix answers the write-up's actual question plainly: can "Classic
   waves" coverage rise at `birthCount` 2 through `dyingValue`, yes or no.
5. Either no promotion, or a promotion to "Classic waves" that keeps
   `birthCount` 2 and carries a delta comment showing the gain is not a
   coverage-threshold artefact.
6. The birth-1/seed-0.18 candidate is not promoted.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Promoting the previously-rejected candidate; changing `birthCount` away from
  2; changing the composite or its weights; other sims; merging; deploys.

## Budget

- **Worker wall-clock:** 150 minutes
- **Verifier wall-clock:** 45 minutes

## Escalation

If the axis proves purely cosmetic, record the proof and stop — that is a pass,
not a failure, and it closes the last open axis on this sim. If it turns out
`dyingValue` touches the dynamics after all (contradicting the write-up), stop
and escalate rather than sweeping on a changed premise.

## Verifier handoff

Re-run `npm run verify` and the sweep. The judgement that matters is whether the
artefact-separation method is sound — check it before checking any ranking, and
fail the stage if a ranking rests on an unhandled coverage artefact. Confirm the
rejected candidate was not promoted.
