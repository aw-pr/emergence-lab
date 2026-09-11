# Stage card 67-lorenz-multi-snapshot-scoring: stop scoring trajectories on one frame

## Metadata

- **Authored:** 2026-08-30
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/67-lorenz-multi-snapshot-scoring
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Path claims:** e2e/harness/metrics.ts, e2e/harness/sims.ts, e2e/sweep.spec.ts
- **Pairing rationale:** the smallest card of the metrics slate and the most
  mechanical, so a Codex worker with a Claude verifier, cross-family. Path
  claims overlap cards 63/65/66 by design to force serial execution.

## Objective

The harness scores one frame pair. For a trajectory sim that is a coin toss on
timing: Lorenz at the canonical `rho=28` scores 0.174 and reads as a thin
one-wing trace purely because the snapshot catches the trajectory lingering on
one wing before the short trail lights both up. Higher rho with a long fade
scores 0.60–0.63 for what is arguably the same quality of attractor. The
`gray-scott-interestingness.md` write-up files a multi-snapshot average as the
fix and explicitly notes no preset action is needed — the shipped "Wide wings"
preset at `rho=35` already renders the full butterfly. **This is a
scoring-robustness card only.**

## Inputs (read these in your own context)

- `docs/sweeps/gray-scott-interestingness.md` (the "Lorenz & Boids (swept, not
  promoted)" section — the Lorenz bullet is the whole brief)
- `docs/sweeps/clifford-dejong-interestingness.md` and
  `docs/sweeps/diffusion-limited-aggregation-interestingness.md` (the other two
  trajectory/accretion sims — check whether they share the sensitivity)
- `e2e/harness/metrics.ts`, `e2e/harness/sims.ts`, `e2e/harness/driver.ts`,
  `e2e/sweep.spec.ts`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A per-sim opt-in on `SimSweepConfig` for multi-snapshot scoring: sample N
   frame pairs spread across the run rather than one, and report the mean plus
   the spread (standard deviation or min/max) of each metric. Additive — sims
   without the opt-in take the single-pair path they always did, byte-identical.
2. Wire it to Lorenz. Evaluate whether Clifford–de Jong and DLA warrant it too
   and record the reasoning either way; wire them only if the evidence in
   deliverable 3 supports it.
3. A dated appendix in `docs/sweeps/gray-scott-interestingness.md` recording,
   for at least four Lorenz parameter sets including `rho=28` and `rho=35`: the
   single-frame score, the multi-snapshot mean, and the spread. The spread is
   the point — it quantifies how much of the old ranking was timing noise.
4. **No preset promotions.** The write-up already concluded no preset action is
   needed here. If the multi-snapshot reading changes that conclusion, record
   it and escalate.

## Constraints

- The existing composite, weights, and all recorded scores for single-snapshot
  sims stay valid.
- N and the sampling positions are config, not magic numbers buried in the
  spec; record the cost in wall-clock, since N snapshots is roughly N times the
  driving.
- Headless only; unattended.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes unmodified.
3. A re-run of one Gray-Scott parameter set reproduces its recorded scores
   exactly — no opt-in, no change.
4. The appendix records single-frame score, multi-snapshot mean and spread for
   at least four Lorenz sets including `rho=28` and `rho=35`, with N and the
   sampling positions stated.
5. Re-running one recorded multi-snapshot set reproduces its mean exactly — the
   sampling is deterministic, not wall-clock dependent.
6. No preset changed (`git diff src/app/presets.ts` empty).

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the existing `metrics harness rewards structure over
  washout` test must still pass unmodified.

## Out of scope

- Preset changes of any kind; changing the composite or its weights; circular
  statistics (card 65); the multi-lag structure term (card 66); point-cloud
  metrics (card 63); merging; deploys.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If multi-snapshot scoring turns out not to move Lorenz much — that is, the
spread is small and `rho=28` still scores 0.174 — that is a clean negative
result: it means the single-frame score was right and the write-up's suspicion
was wrong. Record it with the numbers and stop.

## Verifier handoff

Re-run `npm run verify`, the contract guard, the Gray-Scott reproduction check,
and the determinism check from criterion 5. Confirm no preset changed. Judge
numbers only.
