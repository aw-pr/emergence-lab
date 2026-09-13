# Stage card 94-cpu-fallback-refinement-default: the CPU sampling path gets a refinement default of its own

## Metadata

- **Authored:** 2026-09-12
- **Re-briefed:** 2026-09-13 for attempt 2, widened per the Attempt history
- **Attempt:** 2
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** GPT-6 Astra <gpt-6-astra@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/94-cpu-fallback-refinement-default
- **Worker effort:** medium
- **Verifier effort:** medium
- **Verifier panel:** false
- **Gate:** stage-completed: 93-param-groups-to-schema
- **Dispatch:** serial
- **Pairing rationale:** the second Astra-assessment card of the 2026-09-12
  weekend (see card 93's rationale). A small, well-bounded renderer change
  with one pure function to extract and unit-test, so it reads on Astra's
  precision rather than its breadth. Sonnet 5 verifies: the gate is a unit
  test plus a diff on defaults, the shape Sonnet handled at 7/7 on card 89.
  Cross-family; no GUI needed and none declared.
- **Type:** Behaviour change on one code path, guarded by a unit test.
- **Serialises with:** card 93 by gate. The two cards share no files, but 93
  is the wide one and lands first so this card's diff stays legible.

## Attempt history

**Attempt 1 (2026-09-12, GPT-6 Astra) stopped under the escalation clause
with no files changed, and it was right to.** The card assumed the sampler's
existence predicts the sampling path. It does not. `orbit3d.ts:1023` creates
the sampler in the constructor, `:1615-1625` computes `cloudPlan` from
`this.orbitSampler !== null`, and `buildGpuOrbitCloud` only runs afterwards
at `:1658`. A throw or a null result there reaches the CPU fallback at
`:1701`, which re-uses the `refineActive`, `baseSlotCap` and
`refineCandidateCap` already destructured at `:1626-1644`. So a machine that
*has* a sampler but fails the GPU build ends in `cpu-sampled-gpu-failed`
while running the GPU refinement rule, and the pure resolver alone cannot
reach it.

This re-brief widens the card to cover that state, which is what the
operator wants. The enabling fact attempt 1 did not have: inside
`orbitCloudBuildPlan`, `gpuSamplerAvailable` feeds **only**
`boundaryDetailActive` and the `gpu*` fields derived from it. Every CPU-side
field (`pointBudget`, `maxSurvivingCells`, `refineActive`, `baseSlotCap`,
`sampleWidth`, `sampleHeight`, `refineCandidateCap`) comes from
`refineFraction`. A second plan call at the fallback point, before any
array is allocated, is therefore sufficient and safe: everything the CPU
path allocates comes after `:1702` and reads the re-destructured values.

## Surfacing concern

Stage 39b's follow-up (2026-08-15, `HANDOFF.md` around line 477) set the
logistic-mandelbrot defaults to `tailRefinement: 0` and `boundaryDetail: 1`.
Boundary detail is GPU-only: the descriptor's own label says "GPU only; CPU
uses tail refinement", and `orbitCloudBuildPlan` (`src/app/orbit3d.ts`,
around line 3636) is handed `gpuSamplerAvailable` for exactly that reason.
But with the schema default at 0, `refineFraction` resolves to 0 on both
paths, so a machine whose `OrbitSampler.create` returns null (no
`EXT_color_buffer_float`, or setup failure; see `src/app/orbitSampler.ts`
lines 346-360) gets no boundary sharpening at all by default: no GPU
boundary tier, and no tail refinement either. The same is true of the
machine whose sampler creates but whose GPU cloud build then throws
(`cpu-sampled-gpu-failed`), which reaches the CPU renderer carrying the GPU
plan. The schema cannot express a per-path default, so the fix is
renderer-side, and it has waited as a deferred upgrade since August.

## Inputs (read these in your own context)

- `src/app/orbit3d.ts` lines 3630-3700: `orbitCloudBuildPlan`, the
  `refineFraction` resolution and `REFINE_BUDGET_FRACTION` (line 612, value
  0.3); lines 1610-1625, the call site that passes
  `this.orbitSampler !== null`; lines 840-850 and 1560-1705, the
  `samplingPath` states (`gpu-sampled`, `cpu-sampled`,
  `cpu-sampled-gpu-failed`, `prebaked`)
- `src/app/orbit3d.ts` lines 1655-1712 specifically: the `buildGpuOrbitCloud`
  attempt, its `catch`, and the fallback entry where deliverable 2b's
  re-plan goes — read the allocation order here before you write anything
- `src/sims/logistic-mandelbrot/kernel.ts` lines 164-190: the
  `tailRefinement` and `boundaryDetail` descriptors and their `info` text
- `src/sims/logistic-mandelbrot/kernel.test.cjs` lines 636-712: the default
  and range assertions on those two descriptors
- `src/app/webglRenderer.ts` lines 1618-1634: the `canvas.dataset.orbit3d*`
  readouts, in particular `orbit3dSampler`, `orbit3dRefinedCells` and
  `orbit3dRefinedShare`
- `src/app/qualityProfiles.ts` and `src/app/qualityProfiles.test.cjs`: the
  pattern for a small pure module under `src/app` with a `.test.cjs` beside
  it that the `npm test` gate runs

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. **A pure module, `src/app/orbitRefinement.ts`,** exporting one function
   that resolves the effective tail-refinement fraction from three inputs:
   the descriptor value as the renderer receives it (`number | boolean |
   string | undefined`), whether the GPU sampler is available, and whether
   the build is a real-slice-only build. Semantics:
   - GPU sampler available: exactly today's behaviour. A finite number is
     clamped to `[0, 0.6]`; anything else resolves to
     `REFINE_BUDGET_FRACTION`. The schema default 0 therefore keeps
     refinement off on the GPU path, where the boundary tier does the work.
   - GPU sampler unavailable: a finite number above 0 is clamped as before;
     the schema default 0 resolves to `REFINE_BUDGET_FRACTION` instead of 0,
     so the CPU path sharpens by default. Move `REFINE_BUDGET_FRACTION` into
     this module and re-export or import it in `orbit3d.ts`, so there is one
     constant.
   - Real-slice-only builds resolve to 0 on both paths, as today
     (`refineActive` is already false there).
2. **`orbitCloudBuildPlan` calls that function** in place of its inline
   ternary, and nothing else in the plan changes. The prebaked path is
   untouched: a baked cloud carries its own sampling.

2b. **The CPU fallback re-plans.** At the fallback entry (`orbit3d.ts`
   around line 1701, where `samplingPath` is set to
   `cpu-sampled-gpu-failed`), call `orbitCloudBuildPlan` a second time with
   identical arguments except `gpuSamplerAvailable` false, and re-destructure
   the CPU-side fields it returns — `pointBudget`, `maxSurvivingCells`,
   `refineActive`, `baseSlotCap`, `sampleWidth`, `sampleHeight`,
   `refineSubCells`, `refineCandidateCap`, `refineWarmup` — for everything
   below that point. The re-plan must happen **before** the first
   `Float32Array` allocation, so every buffer is sized by the CPU plan. Do
   not recompute or reassign `this.pointBudget`'s GPU value, `gpuPointBudget`,
   or the `gpu*` fields; the GPU attempt has already failed and its readouts
   stay as they are. The no-sampler machine keeps taking the single planning
   call at `:1615`, which now resolves the CPU rule directly.

   Structuring this as `let` bindings reassigned in the fallback, or as a
   small helper returning the plan, is your call — pick whichever keeps the
   diff legible and say which you chose in the envelope.
3. **Descriptor text**: update the `tailRefinement` descriptor's `info` in
   `src/sims/logistic-mandelbrot/kernel.ts` to say that 0 means "off on the
   GPU path, automatic (0.3) on the CPU fallback", and the `boundaryDetail`
   label or info if it now reads wrong. Defaults, ranges and steps stay
   exactly as they are.
4. **A unit test, `src/app/orbitRefinement.test.cjs`,** covering: GPU path
   with 0 gives 0; GPU path with `undefined` gives 0.3; GPU path with 0.45
   gives 0.45; GPU path with 2 clamps to 0.6; CPU path with 0 gives 0.3; CPU
   path with 0.1 gives 0.1; CPU path with `undefined` gives 0.3; real-slice
   gives 0 on both paths regardless of value.
5. **A short audit, `docs/audits/2026-09-13-cpu-fallback-refinement-default.md`,**
   stating the rule in one table with a row per `samplingPath` state
   (`gpu-sampled`, `cpu-sampled`, `cpu-sampled-gpu-failed`, `prebaked`), why
   0 is treated as "auto" on the CPU path rather than adding a control (the
   CPU fallback has no other sharpening, so "off" is not a use case worth a
   slider), why the fallback re-plans rather than deciding at plan time, and
   the one thing the operator loses (there is no way to disable refinement
   on the CPU path from the panel). Note the `orbit3dRefinedShare` dataset readout as the
   way to see the rule in effect on a CPU machine.
6. **`HANDOFF.md`**: the deferred line about the CPU-fallback default
   (around line 477) marked resolved by this card.

## Constraints

- **GPU-path behaviour is frozen.** On a build that reaches
  `samplingPath = "gpu-sampled"`, every input must resolve exactly as the
  current ternary does, and every value handed to `buildGpuOrbitCloud` must
  be byte-for-byte what it is today. Card 92's luma figures and card 88's
  zoom tests were measured on that path and must not move. The re-plan in
  deliverable 2b happens only after that build has failed, so it cannot
  affect a successful GPU build; confirm that ordering in the envelope.
- Descriptor `default`, `min`, `max`, `step` for `tailRefinement` and
  `boundaryDetail` do not change; the kernel test asserts them and must
  keep passing unmodified on those assertions (an `info` string assertion
  may be updated if one exists; list it in the envelope).
- Do not touch `src/app/orbitSampler.ts`, the sampler's fallback decisions,
  `src/sims/logistic-mandelbrot/model.ts`, or the frozen block in
  `src/sims/logistic-mandelbrot/gpu-parity.test.cjs`
  (`sha256:111b37b263b2afb8137c4628eae41ec55f035d2a2c8955f939ad82816d7be30e`).
- No new panel control, no new uniform, no shader change. If the rule
  cannot be expressed without one, stop and report; that is a different
  card.
- No browser. The change is provable from the pure function and the plan's
  inputs; a Codex seat cannot open Chromium on this machine and does not
  need to.
- Do not commit anything under `public/baked/`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the
stage.

1. `npm run verify` green in the run worktree (after `npm ci`).
2. `scripts/check-contract-test-gate.sh --worktree` run and its exit code and
   message reported verbatim in the envelope, with one sentence saying which
   of its three outcomes it was and why that is correct for this card.
3. `src/app/orbitRefinement.test.cjs` exists, is picked up by `npm test`, and
   its eight cases match deliverable 4. The verifier reads the function and
   confirms each case against the stated rule, not against the test alone.
4. The diff to `src/app/orbit3d.ts` is confined to four things:
   `orbitCloudBuildPlan`'s refine resolution, the constant's move, imports,
   and the CPU-fallback re-plan of deliverable 2b with whatever binding
   change that re-plan requires. The verifier reads the whole diff of that
   file and says so, and confirms the re-plan sits above the first
   `Float32Array` allocation and below the failed GPU attempt. Arithmetic
   changes to `pointBudget`, `maxSurvivingCells`, `baseSlotCap` or the
   candidate-cell formulas still fail this criterion.
5. `REFINE_BUDGET_FRACTION` is defined exactly once across `src/app`.
6. The `tailRefinement` and `boundaryDetail` descriptors' `default`, `min`,
   `max` and `step` are unchanged (verifier diffs the kernel file), and the
   kernel test's assertions on them are unmodified.
7. The audit exists at the named path, carries a row per `samplingPath`
   state, and states the rule, the trade-off, and the readout.
8. Both CPU states resolve to 0.3 at the schema default. The verifier
   traces `cpu-sampled` (sampler null at `:1615`) and
   `cpu-sampled-gpu-failed` (re-plan at the fallback) by reading the code,
   and states the resolved `refineFraction` and `refineActive` for each.
9. The envelope carries the Astra scorecard block described under Dispatch
   envelope.

## Contract test

- **Test file:** None
- **Assertions digest:** None

Deliverable 4 is a plain unit test, not a frozen block: the next card that
changes the CPU default fraction should be able to change the expectation
without a digest dance.

## Out of scope

- The hybrid surface path's plan call (`orbit3d.ts` around line 1949), which
  also passes `this.orbitSampler !== null`. It picks up the new resolver for
  free via `orbitCloudBuildPlan`; it gets no re-plan of its own in this card.
- A panel control for the CPU path, or an "auto" option on the slider.
- Changing `REFINE_BUDGET_FRACTION`'s value.
- Anything on the GPU path, the boundary-detail tier, or the sampler.
- Surfacing the sampling path in the UI beyond the existing dataset readout.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 30 minutes
- **Token baseline:** worker 3.5M, verifier 1.5M. Above 6.0M on the worker,
  stop and report what is landed. Attempt 1 spent 297k reaching the blocker,
  which the Attempt history now hands you for free.

## Escalation

Attempt 1's escalation is answered by the Attempt history above; do not
re-raise it. The plan-time flag is known to be unreliable, and deliverable
2b is the sanctioned fix.

Escalate instead if the CPU fallback turns out to consume a plan field
*before* line 1701 in a way the re-plan would invalidate, or if re-planning
changes `sampleWidth`/`sampleHeight` such that some buffer allocated earlier
is wrongly sized. Stop, name the line numbers, and report. Do not add a
rebuild, and do not reach into `buildGpuOrbitCloud` to make its failure
reportable at plan time; that is a different card.

## Dispatch envelope

Return an envelope recording, for each acceptance criterion, whether it
passed and the evidence: the command run and its verbatim exit code and
output, or the committed path. List any kernel test assertion on `info`
text you changed.

Then an **Astra scorecard** block, which the operator reads separately from
the verdict:

- deliverables landed on this attempt, numbered against the list above
- tokens used, worker total
- anything the card asked for that the Codex sandbox prevented (file it
  could not write, command it could not run), or "none"
- one sentence on where the card's brief was wrong or under-specified, if
  anywhere

## Verifier handoff

Derive the eight expected values from the rule in deliverable 1 before you
open the test file, and compare. A test that encodes what the function does
rather than what the card says is the failure to catch.

Then read the `orbit3d.ts` diff in full. The change should be a handful of
lines; anything touching `pointBudget`, `maxSurvivingCells`, `baseSlotCap`
or the candidate-cell arithmetic is out of scope and fails criterion 4 even
if the tests pass.

## Family-specific notes

Codex family: the run worktree has no `node_modules`; run `npm ci` first or
`npm run verify` exits 127. Tests under `src/app` require the compiled
module from `.test-build/app/` after `npm run build:test`, following
`src/app/qualityProfiles.test.cjs`. No network and no GUI are needed; do not
attempt a browser.
