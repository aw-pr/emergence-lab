# Stage card 36-logistic-mandelbrot-gpu-parity-fallback: freeze the parity harness and harden the fallback

## Metadata

- **Authored:** 2026-08-14
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Worker effort:** medium
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Pairing rationale:** By this point the design decisions are already made
  and written down — stage 34 fixed the tolerances, stage 35 built the path.
  What remains is careful, well-specified test and fallback work, which is
  what Terra is for and does not warrant Opus rates. The verifier still needs
  a browser to confirm the fallback actually degrades gracefully on a real
  page rather than merely in principle, so it stays a Claude role with
  `Requires GUI`. Verifier effort stays high because the failure mode of a
  parity harness is a test that passes vacuously.

## Depends on

Stages 34 and 35, both completed. Read
`docs/spikes/2026-08-14-fp32-orbit-precision.md` for the tolerance numbers and
stage 35's card and diff for the path it built.

## ORCHESTRATOR: digest filled 2026-08-15 — this card is dispatchable

The frozen block is committed in
`src/sims/logistic-mandelbrot/gpu-parity.test.cjs` and its digest is recorded
in the Contract test section below. Worker notes on what the orchestrator
froze:

- **Scope decision, from stage 35's verified measurements**
  (`state/verifiers/35-logistic-mandelbrot-gpu-sampler.json`): the stage-34
  gates (2e-6 value, 0.05% period mismatch) are asserted over
  **stable-interior cells only**, exactly as the spike scopes them. The
  boundary band is reported separately and sanity-capped (5% production, 1%
  baker), never gated at interior tolerances — split-double measurably buys
  nothing there. Do not "fix" a boundary failure by touching the block; that
  is a finding.
- The block consumes `loadParityReport(settings)` from a new sibling module
  `src/sims/logistic-mandelbrot/gpu-parity-harness.cjs` — that module, its
  fixture or emulated-path choice, and the report plumbing are the worker's
  deliverable. The expected report shape is documented in the test file's
  header comment.
- `scripts/run-kernel-tests.cjs:36` currently discovers only
  `kernel.test.cjs` under `src/sims/**`; extending discovery so this file
  actually runs is in scope and required — an undiscovered parity test is the
  vacuous test criterion 4 exists to catch.
- Environment: run any manual dev server with `--strictPort` on port 5175 or
  higher. Ports 5173/5174 may carry servers from other worktrees, and
  `playwright.config.ts` silently reuses a foreign 5173.

## Objective

Turn stage 35's one-off parity measurement into a standing, frozen regression
test, and make the fallback chain robust and observable enough that a future
change cannot silently drop a machine onto the slow path — or onto a wrong one.

## Background you need

The orbit is the **complex quadratic map `z -> z^2 + c`**
(`src/sims/logistic-mandelbrot/model.ts:154-158`), not the real logistic map.
The sim's name refers to what it plots.

There are now four ways a logistic-Mandelbrot cloud can come into being, and
this stage is the one that guarantees all four keep working:

1. GPU-sampled (stage 35's new path)
2. CPU-sampled via the time-sliced sweep (`orbit3d.ts:1112`)
3. Prebaked ELPC, loaded by `applyPrebaked()` (`orbit3d.ts:982`)
4. No orbit3d at all — the 2D field, tagged `orbit3d-fallback-field`
   (`webglRenderer.ts:1497`)

## Inputs (read these in your own context)

- src/sims/logistic-mandelbrot/kernel.test.cjs — the existing test style,
  harness conventions, and how `.test-build/` is consumed
- scripts/run-kernel-tests.cjs — how tests are discovered and run
- scripts/check-contract-test-gate.sh — lines 1-30, the freeze-gate contract
- src/app/orbitSampler.ts and src/app/orbit3d.ts — stage 35's path and gate
- src/app/webglRenderer.ts — lines 1480-1500, the `canvas.dataset` convention
- e2e/smoke.spec.ts — the live-browser test style and screenshot conventions
- docs/spikes/2026-08-14-fp32-orbit-precision.md — the tolerance numbers

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/sims/logistic-mandelbrot/gpu-parity.test.cjs` — the frozen parity
   harness, containing the orchestrator-written assertion block between the
   `AUTOMETTA-CONTRACT-*` markers. **Do not edit anything between those
   markers**; the freeze gate will reject it and the stage fails. Everything
   the assertions need in order to run — fixtures, helpers, the reference
   sampler invocation — is yours to write around the block.
2. An e2e case in `e2e/smoke.spec.ts` asserting the `canvas.dataset` value for
   the logistic-mandelbrot route reports the path that actually ran, and that
   a cloud builds within a stated time budget.
3. Fallback hardening in the stage-35 path: every capability probe fails
   closed to the next path down the chain, never throws, and never leaves a
   half-built cloud on screen. If a GPU sample pass fails partway, the cloud
   must fall back cleanly rather than render partial garbage.
4. A short table in `docs/PUBLISH-WORKFLOW.md`'s sibling docs — or a new
   section in `README.md` under the existing orbit3d material — naming the
   four paths, when each is chosen, and how to tell which one you are on from
   `canvas.dataset`. Keep it to a table plus a few lines; this is operator
   documentation, not an essay.

## Constraints

- **The frozen assertion block is not yours to edit.** If you believe an
  assertion is wrong, stop and say so in your handoff. Changing it and
  re-deriving the digest is a stage failure, and it is the specific thing the
  freeze gate exists to catch.
- Do not weaken a tolerance to make a test pass. If the GPU path cannot meet
  stage 34's numbers, that is a finding about stage 35, and it should be
  reported as one, not tuned away.
- Do not change `src/sims/logistic-mandelbrot/model.ts` or
  `scripts/bake-orbit3d.mjs`.
- Do not change the ELPC format or the prebake precedence.
- Kernel tests run headless in Node with no WebGL. The parity harness must
  therefore compare against a **captured GPU reference fixture** or run the
  emulated-fp32 path from stage 34 — decide which, state your reasoning, and
  do not silently make the test vacuous by skipping when WebGL is absent. A
  test that no-ops on the machine that runs it is worse than no test.
- Keep the e2e addition within the existing config's timeouts and single-worker
  assumption (`playwright.config.*`).
- No new runtime dependencies.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` green (typecheck + kernel tests + production build).
2. `scripts/check-contract-test-gate.sh` passes over the staged change set, and
   the frozen block's digest matches the one recorded in this card. Run it.
3. The frozen block is byte-identical to what the orchestrator wrote. Diff it
   explicitly; do not infer this from the gate passing alone.
4. **The parity test is not vacuous.** Verify by deliberately breaking it —
   perturb the GPU path or its fixture and confirm the test fails, then revert.
   State what you perturbed and what failure you saw. A parity test that
   cannot fail is the primary risk of this stage.
5. The test does not skip, no-op, or silently pass when WebGL is unavailable.
6. The e2e case asserts a real `canvas.dataset` value and fails if the wrong
   path is reported. Confirm by running it against the real page.
7. **Fallback chain exercised end to end, in a browser.** Force each of the
   four paths and confirm the correct one is selected, the sim stays usable,
   and the reported dataset value is right in each case. Screenshot each.
8. A mid-build GPU failure falls back cleanly with no partial cloud left on
   screen. Simulate it.
9. The documentation table matches the code's actual selection order. Read the
   gate and check, do not trust the prose.
10. No regression to Kuramoto, the three GPU fractals, the prebaked path, or
    orbit3d camera and marker-drag behaviour.

## Contract test

- **Test file:** `src/sims/logistic-mandelbrot/gpu-parity.test.cjs`
- **Assertions digest:** sha256:111b37b263b2afb8137c4628eae41ec55f035d2a2c8955f939ad82816d7be30e

## Out of scope

- Changing the GPU sampler's algorithm. If stage 35's path is wrong, report it;
  fixing it is a re-brief of stage 35, not work for this card.
- The CPU sampler, the model, the baker, the ELPC format.
- Markus–Lyapunov or any other sim.
- Quality profiles, resolution presets, render mode selection.
- Any push, publish-branch, or merge work.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 60 minutes

## Verifier handoff

Worker reports: whether the parity harness compares against a captured fixture
or the emulated path, and why; confirmation that the frozen block was not
touched; what the four fallback paths do on failure and how each was hardened;
the `canvas.dataset` value emitted per path; and any assertion in the frozen
block the worker believes is wrong, stated rather than worked around.

## Family-specific notes

Codex worker: stdin is redirected from `/dev/null` by the dispatch wrapper.
The worker cannot run a browser; the e2e case must be written without being
executed by its author, and the worker must not claim to have run it.
`Requires GUI: true` is for the Claude verifier.
