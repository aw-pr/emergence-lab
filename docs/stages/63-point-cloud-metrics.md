# Stage card 63-point-cloud-metrics: make the sweep able to see particle sims

## Metadata

- **Authored:** 2026-08-24
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Claude Fable 5 <claude-fable-5@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/63-point-cloud-metrics
- **Worker effort:** high
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Pairing rationale:** this touches the metric stack — the most
  design-sensitive work in tonight's slate — so the Fable tier takes the
  worker seat (operator opened the Fable quota for heavy stages, 2026-08-24)
  and the Codex family verifies, cross-family. The verifier re-runs sweeps,
  hence Requires GUI.

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

- **Worker wall-clock:** 180 minutes
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

---

## Re-brief (2026-08-30)

The 2026-08-24 dispatch stalled: `worker_envelope_missing_after_exit`, 4,617,912
tokens spent, no verifier ever dispatched, nothing landed. The card itself is
unchanged and still correct — everything above stands. This re-brief records
what the last attempt left behind and the three things that killed it.

### Salvageable prior work

The previous worker's tree is committed and preserved at tag
`archive/63-point-cloud-metrics-wip` (`65e7d03`), authored to Claude Fable 5.
**Nothing in it is verified** — `npm run verify` was never recorded green, the
contract guard never ran, and the Gray-Scott reproduction check never ran.
Treat it as a strong starting draft to review, not as trusted code:

    git show archive/63-point-cloud-metrics-wip

It covers deliverables 1 and 2 and appears to respect the additive constraint:

- `e2e/harness/metrics.ts` — toroidal separable Gaussian blur, a
  jointly-normalised two-frame preprocess (one shared max, so temporal flux
  stays comparable), and a velocity polarisation order parameter.
- `e2e/harness/sims.ts` — a `PointCloudConfig` opt-in wired to boids
  (blurRadius 6, velocity channels 2–3, `obstacleLayout` pinned to `"none"`)
  and Particle Life (blurRadius 8, no velocity channels).
- `e2e/sweep.spec.ts` — routes opted-in sims through the smoothed path,
  re-drives the deterministic kernel once per velocity channel, and emits a
  `.smoothed.png` beside each thumbnail.

Adopt, correct or discard it on your own judgement, but do not re-derive it
from scratch without looking. Deliverable 3 — the sweep re-runs and the two
dated write-ups — was never reached, and is the bulk of the remaining work.

### Why it stalled, and what to do differently

1. **It parked on a background task and never woke up.** The final log line is
   "The Particle Life sweep is running in the background; I'll pick up when its
   completion notification arrives". That notification never came and the
   worker burned its 240-minute budget waiting. **Run the sweeps in the
   foreground with an explicit timeout.** If a sweep genuinely cannot finish
   inside the budget, cut the axes and record what you dropped — the card
   already permits that.
2. **It wrote no envelope on the way out.** Write
   `state/handoffs/63-point-cloud-metrics.json` as soon as you have a
   defensible partial result, and update it as you go. An envelope recording a
   partial pass is worth vastly more than a perfect run that exits silently —
   without one the tick cannot hand the stage to a verifier at all.
3. **It replaced the worktree's tracked `state/` with a symlink** to the main
   repo (`state -> ../emergence-lab/state`), deleting `state/handoffs/.gitkeep`
   and `state/handoffs/README.md` from the run branch. Do not do this. The run
   worktree's `state/` is tracked content; leave it alone. (The
   `node_modules -> ../emergence-lab/node_modules` symlink it also created is
   the sanctioned workaround for a worktree without installed deps — that one
   is fine, just never commit it.)

### Unchanged

Deliverables, constraints, acceptance criteria, contract test, out-of-scope and
escalation are all exactly as written above. In particular: **no preset
promotions** — first run of a new instrument is calibration.

The Budget section above is cut from 240 to **180** worker minutes. The
2026-08-24 attempt burned a full 240 and landed nothing, and deliverables 1
and 2 now exist as a draft at `archive/63-point-cloud-metrics-wip`, so the
remaining work is deliverable 3. This caps what a second stall can cost the
overnight window.
