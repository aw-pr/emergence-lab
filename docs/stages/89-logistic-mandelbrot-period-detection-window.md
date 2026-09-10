# Stage card 89-logistic-mandelbrot-period-detection-window: eight samples can only see period seven

## Metadata

- **Authored:** 2026-09-10
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5 <claude-opus-5@local>
- **Verifier:** GPT-6 Astra <gpt-6-astra@local>
- **Base branch:** dev
- **Run branch:** autometta/89-logistic-mandelbrot-period-detection-window
- **Worker effort:** high
- **Verifier effort:** high
- **Verifier panel:** false
- **Gate:** stage-completed: 87-logistic-mandelbrot-zoom-diagnostic
- **Path claims:** src/sims/logistic-mandelbrot/model.ts, src/sims/logistic-mandelbrot/kernel.ts, src/sims/logistic-mandelbrot/kernel.test.cjs, src/app/orbitSampler.ts
- **Pairing rationale:** cross-family, and deliberately the Claude seat on the
  worker so this card can overlap card 88. The two cards claim disjoint paths
  and card 88's worker is Astra; alternating the worker family across the pair
  is what makes the overlap draw on two provider windows rather than one. The
  verifier is Astra because acceptance here is arithmetic over a parity oracle,
  which is exactly what a frontier reasoning seat checks well without a browser.
- **Type:** Numeric ceiling removal, guarded by an existing parity oracle.
- **Serialises with:** card 90, which will need the domain plumbed through the
  same two files. 89 lands first.

## Surfacing concern

The operator wants more detail in the bulbs and swirls. The sampling grid is
not the only thing standing in the way, and it may not be the first thing:
**at the shipped default the classifier cannot label any orbit period above
seven.**

`estimatePeriod` in `src/sims/logistic-mandelbrot/model.ts:96-104` opens with

```
const limit = Math.min(maxPeriod, count - 1);
```

`maxPeriod` defaults to `MAX_DETECTABLE_PERIOD = 32` (`:31`), but `count` is
the kept-iterate window, which defaults to `DEFAULT_KERNEL_SAMPLES = 8`
(`src/sims/logistic-mandelbrot/kernel.ts:55`, schema default at `:275`). So
`limit` is 7, `MAX_DETECTABLE_PERIOD` is dead at the default, and every cell
whose true period is 8 or more returns 0 and is treated as chaotic.

Two consequences worth checking rather than assuming:

- The period-doubling cascade is exactly the structure the operator means by
  "swirls". A period-16 band that the grid resolves spatially is still
  rendered as chaos, so raising the grid alone buys less than it looks like.
- `REFINE_PERIOD_THRESHOLD = 8` (`src/app/orbit3d.ts:583` region) and
  `refinePeriodThreshold` in `src/app/orbitSampler.ts:678`
  (`tailCandidate = period === 0 || period >= refinePeriodThreshold`) select
  cells for refinement partly on a period test that can never be true at the
  default. Refinement is therefore driven entirely by the `period === 0`
  branch, which is a much blunter instrument than it was designed to be.

The fix is not "raise `sampleCount`". The kept-iterate count and the point
budget trade one-for-one (`src/sims/logistic-mandelbrot/kernel.ts:47-53`), so
buying period depth that way costs c-plane cells one for one. The detection
window and the kept-iterate window are conceptually different things that this
code happens to share one number for.

## Inputs (read these in your own context)

- `docs/audits/2026-09-11-logistic-mandelbrot-zoom-and-resolution-ceiling.md` —
  card 87's Part B period number and its ranked defect list
- `src/sims/logistic-mandelbrot/model.ts` — `estimatePeriod`,
  `sampleAttractorCell`, `MAX_DETECTABLE_PERIOD`, `PERIOD_TOLERANCE`,
  `CONVERGENCE_TOLERANCE_SQ`
- `src/sims/logistic-mandelbrot/kernel.ts` — the param schema, the sample and
  warmup bounds, and the budget comment at `:47-53`
- `src/app/orbitSampler.ts` — the period fragment shader and its
  `refinePeriodThreshold` consumer
- `src/sims/logistic-mandelbrot/gpu-parity.test.cjs` — the tolerances your
  change must not break, read only
- `docs/plans/2026-08-15-logistic-mandelbrot-gpu-sampler-next-steps.md` — the
  measured tolerances and the explicit instruction that `model.ts` is the
  parity oracle and stays so

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. **Period detection decoupled from the kept-iterate count.** The orbit is
   iterated far enough to test periods up to `MAX_DETECTABLE_PERIOD` while the
   number of iterates kept for plotting stays independently controlled. Both
   the CPU oracle in `model.ts` and the GPU period shader in `orbitSampler.ts`
   change together, or the parity test will tell you they did not.
2. **The default behaves better and the shipped default moves or is argued
   not to.** State the new highest detectable period at the shipped default. If
   you leave a control at its current default, say why.
3. **A measurement, not a claim.** Over a fixed sample of c-values that
   includes at least the period-8 and period-16 windows of the real-axis
   cascade, report the count of cells labelled with each period before and
   after. The point of the card is that cells move out of the "chaotic" bucket
   into a correct periodic one; show them moving.
4. **Tests in `src/sims/logistic-mandelbrot/kernel.test.cjs`** that pin the new
   behaviour: at minimum, a c-value of known period 8 and one of known period
   16 label correctly at the shipped default, and both label as 0 under the old
   window size. Derive the c-values rather than guessing them, and say how.
5. **A cost statement.** Whatever the extra iteration costs — per-cell work,
   build wall-clock at the shipped desktop default, GPU memory — measure it and
   write it down. If the cost is material the operator needs the number, not a
   reassurance.

## Constraints

- **`model.ts` stays the parity oracle.** The CPU path is the reference the GPU
  sampler is measured against; do not invert that relationship, and do not make
  the GPU the source of truth for period.
- The `gpu-parity.test.cjs` tolerances hold unchanged: 2e-6 absolute on `zr`
  and 0.05% period mismatch at both the production and baker settings. That
  file is not in your claims and carries a frozen contract block for card 36.
  If your change cannot hold those tolerances, that is an escalation, not a
  reason to relax them.
- Do not touch the c-domain constants `RE_MIN`, `RE_MAX`, `IM_MIN`, `IM_MAX`
  (`src/sims/logistic-mandelbrot/model.ts:17-20`). Card 90 owns them.
- Do not touch `src/app/orbit3d.ts`, `src/app/webglRenderer.ts`,
  `src/app/renderer.ts`, `src/app/fractalCanvas.ts`, `src/app/simView.ts` or
  `e2e/smoke.spec.ts`. Card 88 claims all six and may be running concurrently.
  If a change of yours appears to require one of them, stop and say so.
- No new runtime dependency. Kernels are pure deterministic numerics.
- Do not change the `SimKernel` interface shape. That is a versioned decision
  under `docs/INTERFACE.md` and is not in this card's scope.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the
stage.

1. `npm run verify` green.
2. `scripts/check-contract-test-gate.sh --worktree` run and its exit code and
   message reported verbatim in the envelope, with one sentence saying which of
   its three outcomes it was and why that is correct for this card.
3. The GPU parity test passes at its existing tolerances, and the envelope
   quotes the measured `maxAbsZrDelta` and period-mismatch fraction for both
   the production and baker settings rather than only the pass line.
4. The highest detectable period at the shipped default is above 7, and the
   envelope states what it is and what sets it.
5. The before/after period census exists, covers the period-8 and period-16
   windows, and shows cells moving from the 0 bucket into correct periodic
   buckets. A census that shows no movement means the change did not work.
6. The new tests in `kernel.test.cjs` exist and would fail against the current
   dev behaviour. The envelope records that they were run against it and failed.
7. The cost statement exists with a measured number, not an estimate.

## Contract test

- **Test file:** None
- **Assertions digest:** None

The frozen block in `src/sims/logistic-mandelbrot/gpu-parity.test.cjs`
(`sha256:111b37b263b2afb8137c4628eae41ec55f035d2a2c8955f939ad82816d7be30e`) is
out of this card's claims and must not drift; it is the gate this card's
criterion 3 leans on.

## Out of scope

- Raising the c-plane sampling grid, adaptive density, or a variable domain.
  Card 90.
- Anything to do with the camera. Card 88.
- The ELPC bake format and its u16 quantisation floor. Recorded by card 87 and
  left for a later decision.
- The accumulation target's half-float precision. Real, separate, not this
  card.

## Budget

- **Worker wall-clock:** 100 minutes
- **Verifier wall-clock:** 40 minutes
- **Token baseline:** worker 4.0M, verifier 2.0M. This is a small-file change
  with a heavy measurement obligation; the repo's worker median is 1.72M and
  its p95 7.2M. Above 7.0M on the worker, stop and report.

## Escalation

If decoupling the detection window cannot hold the `gpu-parity.test.cjs`
tolerances, stop. Do not relax them and do not add an exemption. The 2026-08-15
plan is explicit that those tolerances exist precisely to fail a change that
degrades the orbit arithmetic, and a card that loosens its own gate has
verified nothing. Write down what you measured and what it would take.

If card 87's audit found that the shipped default already detects periods above
7 — that is, if the orchestrator's reading of `model.ts:104` is wrong — stop.
The premise of this card is gone and the right outcome is to say so, not to
find something else to change in these files.

## Dispatch envelope

Return an envelope recording, for each acceptance criterion, whether it passed
and the evidence: the command run and its verbatim exit code and message, or
the committed path and the measured number. Include the parity figures, the
period census table, and the cost measurement inline. State your token spend.
If you stopped on an escalation clause, name the clause and say what you did
and did not land.

## Verifier handoff

Re-derive the period cap yourself from `estimatePeriod` before you read the
worker's account of it, and check the `Math.min` the same way for the changed
code: a decoupled detection window that is still silently clamped by some other
count is the exact failure this card exists to remove, and it will read as a
success in prose.

Two more things to attack.

The census is the load-bearing evidence and it is the easiest thing to produce
misleadingly. Check that the c-values sampled actually lie in the period-8 and
period-16 windows — the real-axis cascade windows are narrow and a sample drawn
uniformly over `[-2, 1]` will mostly miss them. A census over the wrong
c-values will show movement that means nothing.

Second, a longer detection loop that reads iterates it did not compute is a
correctness bug that a tolerance test may not catch if the extra iterates
happen to be near-periodic. Check that the iteration count actually rose and
that the samples compared are real.

## Family-specific notes

Claude worker: this card needs no browser and does not declare `Requires GUI`.
Do not attempt to open one; the parity harness runs under node via
`scripts/spike-fp32-orbit.mjs`.

Astra verifier: likewise no browser. Codex seats are refused at the Mach-port
rendezvous on this machine.

The run worktree needs `node_modules` before `npm run verify` will do anything
but exit 127.
