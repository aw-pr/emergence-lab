# Stage card 65-circular-phase-statistics: score phase channels on the circle

## Metadata

- **Authored:** 2026-08-30
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/65-circular-phase-statistics
- **Worker effort:** high
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Path claims:** e2e/harness/metrics.ts, e2e/harness/sims.ts, e2e/sweep.spec.ts
- **Pairing rationale:** metric-stack work with numeric acceptance, so a Codex
  worker and a Claude verifier cross-family, matching stages 60–62. The
  overlapping path claims with stages 63/66/67 are deliberate: they force the
  tick to refuse pairing so the metrics-stack cards run strictly serially.

## Objective

Two sweeps recorded the same root cause. Kuramoto and Swarmalators both carry a
**phase** channel that wraps at 1.0, and both the lag-1 spatial autocorrelation
and the temporal flux read that wrap as a discontinuity: two oscillators at
phase 0.99 and 0.01 are nearly in step, and the linear metrics score them as
maximally far apart. Every ranking on those two sims is contaminated by it.

The instrument both write-ups name is circular statistics — mean resultant
length and a circular autocorrelation. Build them additively and re-score both
sims with them.

## Inputs (read these in your own context)

- `docs/sweeps/kuramoto-oscillators-interestingness.md` (the follow-up note)
- `docs/sweeps/swarmalators-interestingness.md` (the same note, same cause)
- `e2e/harness/metrics.ts`, `e2e/harness/sims.ts`, `e2e/sweep.spec.ts`
- `src/sims/kuramoto-oscillators/kernel.ts`,
  `src/sims/swarmalators/kernel.ts` (channel layout only — which channel is
  phase, and its `channelRange`)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `e2e/harness/metrics.ts` — **additive only**: a mean resultant length
   (circular order parameter, in [0, 1]) and a circular spatial
   autocorrelation over a phase channel, both treating the channel as an angle
   on [0, 2π). The existing four metrics and the composite are untouched.
2. `e2e/harness/sims.ts` — a per-sim opt-in naming the phase channel (same
   shape as the `pointCloud` block from stage 63), wired to Kuramoto and
   Swarmalators. Every other config unchanged.
3. Re-run both sweeps under the new instruments, artefacts under
   `e2e/artifacts/`, and dated appendices in both write-ups recording the
   ranked tables under the linear and circular readings **side by side**, and
   whether the circular reading reorders the shipped presets.
4. **No preset promotions.** First run of a new instrument is calibration:
   record, do not act. If the circular reading disagrees with a shipped preset
   ranking, that is a finding to write down and escalate, not to act on.

## Constraints

- The existing composite, weights, and all recorded scores stay valid. The new
  terms are reported alongside, never folded into the composite — swapping a
  term into the composite would invalidate all twelve existing sweep write-ups
  at once, and that is a separate decision with its own card.
- Headless only; unattended.
- Cap and record the search per sim as the established write-ups do.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes unmodified.
3. A re-run of one Gray-Scott parameter set reproduces its recorded scores
   exactly — the new code changed nothing for non-phase sims.
4. Both sweeps complete headless, and both appendices carry the linear and
   circular readings side by side with evaluated/skipped counts.
5. A synthetic check is recorded showing the circular autocorrelation is blind
   to the wrap where the linear one is not: a field of constant phase gradient
   crossing 1.0 scores high circularly and poorly linearly.
6. No preset changed (`git diff src/app/presets.ts` empty).

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the existing `metrics harness rewards structure over
  washout` test must still pass unmodified — the guard that a metrics change
  has not inverted the scoring.

## Out of scope

- Changing the composite, its weights, or any existing metric; preset changes
  of any kind; the multi-lag structure term (card 66); Lorenz snapshot
  averaging (card 67); point-cloud metrics (card 63); merging; deploys.

## Budget

- **Worker wall-clock:** 180 minutes
- **Verifier wall-clock:** 45 minutes

## Escalation

If the circular instruments do not separate the presets any better than the
linear ones, that is a recordable negative result, not a failure: write it down
with the numbers and stop. Do not invent a third instrument inside this stage.
If the circular reading argues for a different shipped preset, record both
readings and leave the promotion to the operator.

## Verifier handoff

Re-run `npm run verify`, the contract guard, the Gray-Scott reproduction check,
the synthetic wrap check, and both sweeps. Confirm no preset changed and that
the composite is untouched. Judge numbers only.
