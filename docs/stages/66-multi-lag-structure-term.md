# Stage card 66-multi-lag-structure-term: see structure above lag 1

## Metadata

- **Authored:** 2026-08-30
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/66-multi-lag-structure-term
- **Worker effort:** high
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Path claims:** e2e/harness/metrics.ts, e2e/harness/sims.ts, e2e/sweep.spec.ts
- **Pairing rationale:** the mirror of card 65 — Claude worker, Codex verifier,
  cross-family on numeric acceptance. Path claims overlap cards 63/65/67 by
  design, forcing serial execution across the metrics-stack slate.

## Objective

The structure term is a lag-1 spatial autocorrelation, and it is provably wrong
about at least one shipped preset. Game of Life's "Maze-like" (B3/S12345, seed
0.05) stabilises into a static maze of one-cell corridors alternating with
one-cell walls: coverage 0.539, but autocorrelation **−0.07** and a composite
of 0.082. The maze is anti-correlated at lag 1, which is exactly the signal the
term is built to punish because it is the same signal white noise produces. The
write-up is explicit that this is a limitation of the instrument, not a defect
in the preset — the pattern simply lives at a spatial frequency a lag-1
measure cannot see as structure.

Build a structure term that can see it: autocorrelation at several lags, or
band energy from a 2-D FFT. Report it alongside the existing term and record
where the two disagree across the sims already swept.

## Inputs (read these in your own context)

- `docs/sweeps/game-of-life-interestingness.md` (Finding 2 — the null case)
- `docs/sweeps/ising-model-interestingness.md` (the Critical domains vs Cold
  quench note — read it to confirm what it says: that case is the term
  behaving *correctly*, and is **not** a target of this card)
- `e2e/harness/metrics.ts`, `e2e/sweep.spec.ts`
- The ranked tables of two or three other `docs/sweeps/*-interestingness.md`
  files of your choosing, for the cross-check in deliverable 3

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `e2e/harness/metrics.ts` — **additive only**: a multi-lag or FFT-band
   structure term reported beside the existing `spatialAutocorrelation`. The
   existing four metrics and the composite are untouched. Pick one approach and
   justify it in a comment; do not build both.
2. A dated appendix in `docs/sweeps/game-of-life-interestingness.md` showing
   the new term's reading of "Maze-like" against the lag-1 reading, and
   confirming the term still starves white noise — a random field must score
   low under the new term, or it has simply traded one blind spot for another.
3. A cross-check across at least three already-swept sims: re-score their
   recorded sets under both terms and record where the rankings disagree, in a
   dated appendix in each. This is the evidence base for a future decision
   about whether the composite should adopt the new term.
4. **No preset promotions and no composite change.** This card builds and
   characterises the instrument; adopting it is a separate decision.

## Constraints

- The existing composite, weights, and all recorded scores stay valid. Do not
  fold the new term into the composite — twelve write-ups depend on the
  current scoring, and invalidating them is its own card with its own
  re-scoring plan.
- Headless only; unattended.
- Cap and record the search per sim as the established write-ups do.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes unmodified.
3. A re-run of one Gray-Scott parameter set reproduces its recorded scores
   exactly — the composite is untouched.
4. The new term scores "Maze-like" materially above its lag-1 reading of
   −0.07, **and** scores a synthetic uniform-random field low. Both numbers
   recorded. If it cannot do both at once, that is the negative result and it
   is recorded as such.
5. At least three sims cross-checked under both terms, with the disagreements
   tabulated.
6. No preset changed (`git diff src/app/presets.ts` empty).

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the existing `metrics harness rewards structure over
  washout` test must still pass unmodified.

## Out of scope

- Adopting the new term into the composite; re-weighting; preset changes;
  circular statistics (card 65); Lorenz snapshot averaging (card 67);
  point-cloud metrics (card 63); merging; deploys.

## Budget

- **Worker wall-clock:** 180 minutes
- **Verifier wall-clock:** 45 minutes

## Escalation

If a multi-lag term cannot rescue "Maze-like" without also rewarding noise,
record that with both numbers and stop — it is a real finding about the
instrument, not a failure of the stage. Do not try a third formulation inside
this card.

## Verifier handoff

Re-run `npm run verify`, the contract guard, the Gray-Scott reproduction check,
and the maze/noise pair from criterion 4. Confirm the composite is byte-for-byte
unchanged and no preset moved. Judge numbers only.
