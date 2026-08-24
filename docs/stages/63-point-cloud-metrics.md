# Stage card 63-point-cloud-metrics: make the sweep able to see particle sims

## Metadata

- **Authored:** 2026-08-24
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Claude Opus 5 <claude-opus-5@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/63-point-cloud-metrics
- **Worker effort:** high
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Pairing rationale:** this touches the metric stack — the most
  design-sensitive work in tonight's slate — so the strong Claude tier takes
  the worker seat and the Codex family verifies, cross-family. The verifier
  re-runs sweeps, hence Requires GUI.

## Objective

Two sweeps have now recorded the same null result: the lag-1
autocorrelation/occupancy metric stack cannot rank sparse point-cloud sims.
Boids (2026-07-16, all sets ≈0.02) and Particle Life (2026-08-23, 55% of the
composite a constant ≈0, total spread 0.025) are both invisible to it. Both
write-ups name the fix: score a *smoothed* density field, and score what the
sim actually organises — velocity coherence for boids, species mixing for
Particle Life. Build those instruments additively and re-run both sweeps with
them.

## Inputs (read these in your own context)

- `docs/sweeps/particle-life-interestingness.md` (the null result and the
  follow-up spec)
- `docs/sweeps/gray-scott-interestingness.md` (the boids paragraph and the
  metric definitions)
- `e2e/harness/metrics.ts`, `e2e/harness/sims.ts`, `e2e/harness/driver.ts`,
  `e2e/sweep.spec.ts`
- `src/sims/boids/kernel.ts`, `src/sims/particle-life/kernel.ts` (channel
  layout only — boids carries vx/vy in channels 2–3)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `e2e/harness/metrics.ts` — **additive only**: a Gaussian-smoothed density
   preprocess (blur radius as a per-sim config field) and a velocity-coherence
   metric (polarisation/order parameter over the velocity channels). The
   existing four metrics and the composite are untouched — every recorded
   field-sim score must still reproduce.
2. `e2e/harness/sims.ts` — a per-sim opt-in (e.g. a `pointCloud` block on
   `SimSweepConfig`) wiring boids and Particle Life to the new scoring; the
   other configs unchanged.
3. Re-run boids and Particle Life sweeps under the new instruments, artefacts
   under `e2e/artifacts/`, and dated appendices in
   `docs/sweeps/particle-life-interestingness.md` and a new
   `docs/sweeps/boids-interestingness.md` recording ranked tables and whether
   the new metrics actually separate the shipped presets.
4. **No preset promotions.** First run of a new instrument is calibration:
   record, do not act. Read
   `state/verifiers/15-boids-density-motion-tuning.json` before writing any
   boids recommendation — a prior boids regime already failed a browser check.

## Constraints

- The existing composite, weights, and all recorded scores stay valid: the
  contract-test guard below must pass unmodified, and one Gray-Scott set must
  reproduce its recorded scores after the change.
- Headless only; unattended.
- Cap and record the search per sim as the established write-ups do.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes unmodified.
3. A re-run of one Gray-Scott parameter set reproduces its recorded scores
   exactly (the new code changed nothing for field sims).
4. Both new sweeps complete headless; the new metrics separate the shipped
   presets by more than the old ones did (Particle Life presets spanned 0.010
   under the old stack — the new spread must exceed that, or the write-up
   states plainly that the new instrument also fails).
5. Both write-ups record evaluated/skipped counts and no promotion was made.

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the existing `metrics harness rewards structure over
  washout` test must still pass unmodified — it is the guard that a metrics
  change has not inverted the scoring.

## Out of scope

- Preset changes of any kind; circular-statistics metrics for
  Kuramoto/Swarmalators (that is its own follow-up); changing existing
  metrics or weights; merging; deploys.

## Budget

- **Worker wall-clock:** 240 minutes
- **Verifier wall-clock:** 60 minutes

## Escalation

If the smoothed-density and velocity-coherence instruments still cannot
separate the presets, that is a recordable negative result, not a failure:
write it down with the numbers and stop. Do not invent a third instrument
inside this stage.

## Verifier handoff

Re-run `npm run verify`, the contract guard, the Gray-Scott reproduction
check, and both new sweeps. Confirm no preset changed and the separation
numbers in criterion 4. Judge numbers only.
