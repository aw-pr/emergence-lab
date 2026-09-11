# Stage card 79-brians-brain-preset-retune: Sparse spirals and Storm, tuned on the corrected kernel

## Metadata

- **Authored:** 2026-09-06
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/79-brians-brain-preset-retune
- **Worker effort:** medium
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** stage-completed: 77-brians-brain-dying-value-sweep
- **Path claims:** src/app/presets.ts, docs/sweeps/brians-brain-interestingness.md
- **Pairing rationale:** the established visual-acceptance pairing: a Codex
  worker edits the presets from card 77's numbers, and the Claude verifier
  drives the browser and looks. Worker family alternates from card 78. Claims
  overlap card 77 on the write-up, which is why this card is gated on it
  rather than paired with it.
- **Type:** Preset retune, closing the operator decision of 2026-09-06.

## Surfacing concern

Stage 72 fixed the `dyingValue` comparison and the operator accepted the
consequence: "Sparse spirals" (0.62) and "Storm" (0.42) now differ from their
shipped appearance in 43% and 45% of cells. Their current parameters were
scored and promoted on the buggy kernel, so those scores are not evidence.
The write-up's "Operator decision 2026-09-06" section names this card as the
follow-up.

Card 77 supplies the measurement. This card acts on it.

## Inputs (read these in your own context)

- `docs/sweeps/brians-brain-interestingness.md` — the operator decision and
  card 77's appendix, which ends with a recommendation for this card
- `src/app/presets.ts` — the `brians-brain` block
- `docs/stages/68-physarum-fourth-preset.md` — the preset-promotion shape,
  including how the delta comment records what was inherited versus chosen

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/app/presets.ts`: "Sparse spirals" and "Storm" updated to card 77's
   recommended parameters. If card 77 found the axis cosmetic and recommended
   holding 0.5, set both to 0.5 and say so in the delta comment. Keep the ids
   and labels; users have them bookmarked.
2. "Classic waves" untouched, byte for byte.
3. A dated appendix in the write-up recording the before and after parameters
   for both presets, the scores under the corrected kernel, and one sentence
   per preset on what the frame now looks like.

## Constraints

- Parameters come from card 77's appendix. Do not run a new sweep here.
- No kernel, harness or metric change.
- If card 77's recommendation is missing or ambiguous, stop under Escalation.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes unmodified.
3. "Classic waves" is byte-identical to `dev`.
4. Both changed presets carry the parameters card 77's appendix recommends,
   and the delta comment says which values were chosen and which inherited.
5. In the browser, each of the two presets renders a field that matches the
   appendix's one-sentence description, and neither floods to uniform or dies
   within 300 steps.
6. No file outside the path claims is modified.

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the freeze-marker block stage 70 added around the
  `metrics harness rewards structure over washout` test, with its recorded
  sha256, must still validate unchanged. Do not write the literal marker tokens
  into this card's prose.

## Out of scope

- A fourth Brian's Brain preset.
- "Classic waves".
- Regenerating thumbnails; note in the appendix if they are now stale.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 45 minutes

## Escalation

If card 77's appendix does not give a value for one of the presets, or gives
one whose frame floods or dies, stop and report which. Do not pick a value
yourself; that reopens the sweep this card is gated on.

## Verifier handoff

Confirm criterion 3 by diff, criterion 4 by reading card 77's appendix
yourself, then drive the browser to each preset and watch 300 steps. Brian's
Brain is a Canvas2D sim; headless Chromium needs no GPU flags. Capture one
frame per preset for the artefact.

## Re-card (2026-09-06, Codex session limit reached)

The Codex provider window is exhausted for this session, so the worker seat
moved from `Codex GPT-5.6 Terra` to `Claude Fable 5.1`. The verifier (Claude
Opus 5) is unchanged, so the pair is still cross-model, and this card was
chosen for the Fable seat because the worker's task here is the most mechanical
of the slate: transcribe two numbers card 77 already measured and write the
appendix. It does not design anything.

The Metadata pairing rationale above is left standing as the record of what was
designed. Its "Codex worker" is now a Fable worker; the half that carries the
acceptance weight, a Claude verifier driving the browser and looking at 300
steps of each preset, is untouched.

Two things about this card's inputs are unresolved at the time of writing and
are with the operator, not the worker:

1. Card 77's appendix, this card's sole input, is on branch
   `autometta/77-brians-brain-dying-value-sweep` at `5ac20e7c` with integration
   state `awaiting`. It is **not** on `dev`. A worker dispatched against `dev`
   will not find the recommendation and should stop under Escalation rather
   than improvise.
2. Deliverable 1 forks on whether card 77 recommended parameters or found the
   axis cosmetic. Card 77 returned both readings at once, and resolving that
   fork is an operator decision recorded separately. Do not pick a branch of it
   yourself.

## Re-brief (attempt 1, 2026-09-06, after card 77 answered deliverable 1's fork both ways at once)

Card 77 passed 6/6 and is now merged into `dev` at `5ac20e7c` (run branch
`autometta/77-brians-brain-dying-value-sweep`, commit
`5ac20e7c40027bcb3a2cbcbcc805e9c96ca1ffeb`). Its appendix, including the
"Recommendation for card 79" section, is on `dev` — read it there. This
resolves the input problem noted in the Re-card section above; that note's
point 1 is now closed.

Point 2 is resolved here, by the operator, on 2026-09-06.

**Deliverable 1 takes the recommended-parameters branch, not the hold-0.5
branch. Set `dyingValue: 0.9` for both Sparse spirals and Storm**, keeping
each preset's existing `birthCount` and `seedDensity`.

Why the fork looked ambiguous, so you do not re-open it: card 77 found the
`dyingValue` axis cosmetic *as dynamics* — firing coverage is exactly
invariant across the whole swept range, 0.028 at seed density 0.12 and 0.034 at
0.36, unchanged at every value. That invariance is a statement about the firing
channel only. It is **not** the "found the axis cosmetic" condition deliverable
1 contemplates, which was written against the possibility that card 77 would
find no basis to prefer any value and recommend holding. Card 77 did find a
basis: on the appearance-sensitive composite, 0.9 scores 0.055 against Sparse
spirals' corrected 0.051 and 0.070 against Storm's corrected 0.057. So the
hold-0.5 branch is not triggered and must not be taken.

Carry card 77's own caveat into your delta comment and appendix rather than
dropping it: 0.9 is a brighter-afterglow candidate, and the improvement is in
how the field looks, not in what it does. Do not write the appendix as though
the dynamics changed — they demonstrably did not.

Acceptance criterion 5 is where this is actually settled: the Claude verifier
drives the browser and watches 300 steps of each preset. That visual check is
the gate on the appearance change, not the composite score. If either preset
floods to uniform or dies within 300 steps at 0.9, stop under Escalation and
report which — do not fall back to 0.5 or search for a third value yourself.

Everything else about this card is unchanged: "Classic waves" stays
byte-identical, no kernel/harness/metric change, no new sweep, and the path
claims are still `src/app/presets.ts` and
`docs/sweeps/brians-brain-interestingness.md`.
