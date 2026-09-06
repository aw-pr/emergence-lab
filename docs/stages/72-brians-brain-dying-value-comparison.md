# Stage card 72-brians-brain-dying-value-comparison: dyingValue is a float, compared as if it were exact

## Metadata

- **Authored:** 2026-09-01
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/72-brians-brain-dying-value-comparison
- **Worker effort:** medium
- **Verifier effort:** high
- **Requires GUI:** false
- **Verifier panel:** false
- **Pairing rationale:** same family, different model. Codex is exhausted at
  authoring time and this is a small, well-bounded numeric correctness fix; the
  Opus seat verifies because the whole card turns on whether a float comparison
  is right, which is read from the code rather than from the sim's appearance.
- **Type:** Kernel correctness fix, unblocking a deferred sweep axis.

## Surfacing concern

Stage 71 was dispatched to sweep Brian's Brain along the `dyingValue` axis and
stopped under its own escalation clause without sweeping. It was right to.

`dyingValue` is stored in a `Float32Array` but later tested with
`current === dyingValue` against an unrounded JavaScript number. Float64 `0.42`
becomes `0.41999998688697815` on the round trip, and the equality never holds.
Measured at `birthCount 2`, `seedDensity 0.22`: both `0.42` and `0.62` failed
to match. Only values exactly representable in float32 — `0.5`, `0.25`, `0.75`
— behave, which is why every shipped preset works and the axis looked fine.

The consequence is not cosmetic. Any `dyingValue` a user types that is not a
dyadic fraction silently does nothing, and the parameter appears inert.

## Inputs (read these in your own context)

- `src/sims/brians-brain/kernel.ts` — the storage and the comparison
- `docs/sweeps/brians-brain-interestingness.md` — the escalation this unblocks
- `state/handoffs/71-brians-brain-dying-value.json` — the previous worker's
  measurements; it did the diagnosis, do not repeat it
- `docs/stages/71-brians-brain-dying-value.md` — superseded, read for context only

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. The comparison stops depending on exact float equality. Quantise the stored
   value to what a `Float32Array` can hold and compare against that, or compare
   with an epsilon derived from float32 precision — not a hand-picked constant.
   State which you chose and why in the handoff.
2. A kernel test that fails against the current code: set `dyingValue` to a
   non-dyadic value such as `0.42`, step the kernel, and assert cells in the
   dying state are actually treated as dying. Demonstrate the failure before
   the fix, not just the pass after.
3. Existing Brian's Brain presets reproduce their current behaviour exactly.
   `0.5` must not change by so much as one cell.

## Constraints

- Kernel only. No preset changes, no sweep, no promotion in this card.
- Do not widen the fix to other sims even if the same pattern appears there.
  Record any sibling you find in the handoff and leave it.
- `npm run verify` green.

## Acceptance criteria

1. `npm run verify` green, including the new test.
2. The new test fails on the pre-change kernel. Show the failure output.
3. A headless run at `dyingValue: 0.42` produces a materially different field
   from `dyingValue: 0` — proving the parameter now does something.
4. The three shipped presets produce byte-identical output to `dev`.
5. No file outside `src/sims/brians-brain/` and its tests is modified.

## Contract test

- **Test file:** the Brian's Brain kernel test file
- **Assertions digest:** wrap the new assertions in the freeze-marker block
  naming this card and record a real sha256. Do not write the literal marker
  tokens into this card's prose; a staged card containing the begin-token trips
  the gate on itself.

## Out of scope

- The `dyingValue` sweep itself. That is the follow-up this unblocks, and it
  should be carded separately once the axis is known to work.
- Promoting or changing "Classic waves".

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 25 minutes

## Escalation

If the quantisation changes any shipped preset's output, stop and report which
and by how much. A silent visual change to a shipped preset is a bigger cost
than an inert parameter, and the operator decides that trade, not this stage.

## Verifier handoff

Check the failing-test-first claim by running the new test against `dev`
yourself. Then confirm criterion 4 by diffing headless output for all three
presets, not by reading that it was done. The single most likely way to pass
this card wrongly is to accept a test that passes both before and after.

## Re-brief 2026-09-06: criterion 4 was unsatisfiable, and the operator has decided the trade

Attempt 1 is preserved at
`2f38be27ad444f798cb177c8649fb6ff2e83c7c6`
(`wip/72-brians-brain-dying-value-comparison-attempt-1`). The verifier passed
criteria 1, 2, 3 and 5 and failed only criterion 4, and it failed it correctly:
the fix is one `Math.fround` at `src/sims/brians-brain/kernel.ts:135`, and two
of the three shipped presets use exactly the non-dyadic `dyingValue`s the bug
made inert. "Classic waves" (0.5) is byte-identical; "Sparse spirals" (0.62) and
"Storm" (0.42) diverge from step 2 and end 43.1% and 45.5% different. The card's
premise and its criterion 4 could not both hold, and the escalation clause said
the operator decides. They have: **land the fix, accept the two presets
change.** The decision and its rejected alternatives are recorded in
`docs/sweeps/brians-brain-interestingness.md` under "Operator decision
2026-09-06".

### What attempt 2 does

Adopt the preserved WIP. Start from `2f38be27ad444f798cb177c8649fb6ff2e83c7c6`
rather than re-deriving the fix: cherry-pick it onto the run branch or apply
its diff. Re-run the headless comparison the verifier ran (all three presets,
128x128, every cell at every step 0..120, dev kernel against the fixed kernel)
and put the measured divergence for each preset in the handoff. Write a `pass`
envelope; attempt 1's was `partial` only because of the escalation.

Constraints are unchanged: kernel and its tests only, no preset edits, no
sweep. Do not touch `src/app/presets.ts` even though two presets will now look
different. Re-tuning them is a follow-up card.

### Criterion 4, before and after

Before:

> The three shipped presets produce byte-identical output to `dev`.

After:

> "Classic waves" produces byte-identical output to `dev` at every step. "Sparse
> spirals" and "Storm" are expected to diverge; the handoff reports, for each,
> the first step at which the field differs and the fraction of cells differing
> at step 120, measured headlessly at 128x128. A divergence that is absent, or
> that appears in "Classic waves", is a FAIL.

All other criteria stand as written.

### Verifier handoff, addendum

Criterion 4 is now a measurement, not a guarantee. Reproduce the three-preset
diff yourself as before; the headless harness is seeded, so your numbers must reproduce the worker's
exactly, and "Classic waves" must still be exact.
Do not fail the card for the two presets changing. That was decided above the
card, and a FAIL on it would re-open a closed question.
