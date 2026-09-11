# Stage card 77-brians-brain-dying-value-sweep: the axis stage 72 unblocked, swept without the trap

## Metadata

- **Authored:** 2026-09-06
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/77-brians-brain-dying-value-sweep
- **Worker effort:** high
- **Verifier effort:** medium
- **Verifier panel:** false
- **Path claims:** docs/sweeps/brians-brain-interestingness.md, e2e/harness/sims.ts
- **Pairing rationale:** cross-family. The Codex synthesis seat designs the
  sweep because the card turns on a methodological choice made before any
  number is trusted; the Claude verifier reruns the harness headlessly and
  checks the artefact was separated from the effect. Claims are disjoint from
  card 78 (metrics and the Particle Life write-up) so the two may pipeline.
- **Type:** Measurement sweep on a newly live axis. No promotion.

## Surfacing concern

Stage 71 was authored to sweep `dyingValue` and stopped under its own escalation
clause: the parameter was inert for every non-dyadic value because the kernel
compared a float32-stored value against an unrounded number. Stage 72 fixed
that on 2026-09-06 (`f54d19ba`), and the operator accepted that "Sparse
spirals" and "Storm" now render differently. The axis is live and has never
been measured.

Stage 71's trap still stands and this card inherits it verbatim: `dyingValue`
sets the brightness of the refractory state. Under a fixed `coverageThreshold`
of 0.25, moving it across the threshold changes what counts as covered rather
than what the sim does. A naive sweep produces a confident, spurious ranking.

## Inputs (read these in your own context)

- `docs/sweeps/brians-brain-interestingness.md` — the whole file, including
  the 2026-09-06 operator decision at the end
- `docs/stages/71-brians-brain-dying-value.md` — the trap section is the brief;
  the rest is superseded
- `e2e/harness/sims.ts` — the `BRIANS_BRAIN` block and `SimSweepConfig`
- `src/sims/brians-brain/kernel.ts` — confirm what `dyingValue` now touches
  after the stage 72 fix; it is no longer intensity-only in effect, because a
  dying cell is now recognised and retired

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A stated method for separating the coverage artefact from any real effect,
   written into the sweep write-up before the numbers. Acceptable routes:
   score the firing channel alone; hold the effective threshold at a fixed
   position relative to `dyingValue`; or demonstrate the dynamics are invariant
   and report the axis as cosmetic. State which and why.
2. The `dyingValue` axis added to `BRIANS_BRAIN` in `e2e/harness/sims.ts`,
   with at most five values spanning the slider, at `birthCount` 2 and the
   two `seedDensity` values the shipped presets use (0.12 and 0.36). That is
   at most ten sets. Do not widen.
3. A dated appendix in the write-up: the method, the table, the frames it
   scored, and a ranking that is honest about what the composite can and
   cannot see. The two changed presets are re-scored under the corrected
   kernel and the appendix records that their 2026-08-23 reference scores were
   measured under the bug.
4. A recommendation for card 79, which re-tunes the two presets: the candidate
   `dyingValue` for each, or the finding that the axis is cosmetic and the
   retune should hold 0.5.

## Constraints

- No preset changes. `src/app/presets.ts` is not in your claims.
- No metric, weight, threshold or composite change in `e2e/harness/metrics.ts`.
- Headless only. Run with `SWEEP=1 npx playwright test sweep.spec.ts -g "sweep brians"`.
- Every other sim's config in `sims.ts` is untouched.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes unmodified.
3. The method for handling the coverage artefact is stated in the appendix
   before any table, and the table is consistent with it.
4. The sweep ran at most ten sets and the appendix lists all of them.
5. The two changed presets carry re-scored numbers under the corrected kernel,
   and the appendix says their earlier scores were taken under the bug.
6. The appendix ends with a recommendation card 79 can act on without
   re-running anything.

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the freeze-marker block stage 70 added around the
  `metrics harness rewards structure over washout` test, with its recorded
  sha256, must still validate unchanged. Do not write the literal marker tokens
  into this card's prose.

## Out of scope

- Promoting or editing any preset. Card 79 owns that.
- Any change to the metric stack.
- Searching `birthCount` or `seedDensity` again.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If no method separates the artefact from the effect, say so with the evidence
and recommend that card 79 hold `dyingValue` at 0.5. That is a full pass. Do
not report a ranking you cannot defend.

## Verifier handoff

Rerun the sweep headlessly and diff the table against the appendix. Then check
criterion 3 by reading the stated method and asking whether the numbers could
have been produced any other way; if the method is "score the firing channel",
confirm the config actually does. Do not accept a ranking whose only mover is
coverage.
