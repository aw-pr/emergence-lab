# Stage card 160-gray-scott-speed-one-ultra-tuning: one step per frame, then re-tune Gray-Scott at the GPU ultra grid

## Metadata

- **Authored:** 2026-11-09
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Verifier:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/160-gray-scott-speed-one-ultra-tuning
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Recovery attempt:** 1
- **Gate:** stage-completed: 157-ising-coarse-domains-trial
- **Dispatch:** serial
- **Pairing rationale:** an open-ended brief on the priority kernel: the preset change is literal, but the measurement has to drive the GPU path in the real app and design a bounded search at the shipped grid, which is high-complexity work an Opus 5.5 worker lands in fewer attempts (it wrote the GPU path on 2026-11-08). Checking the criteria is reading, replaying and one browser session, so the cross-family verifier is the Codex coding tier. Card 159's worker is also Claude, so this pair does not alternate; dispatch is serial, so no two seats draw on one provider window at once.
- **Open decisions:** none
- **Decided:** by the operator on 2026-11-09 (`docs/UAT/uat.md` notes 1 and 4): "set the sim speed to 1 and start looking at some other optimisations... we had optimised around the bad code", "more tuning with gray scott now the rendering issue is sorted". The orchestrator reads "speed 1" as the presets' Steps per frame value, which is 20 on all six presets while the kernel default and the Simulation speed slider already open at 1.

## Surfacing concern

Every Gray-Scott preset carries `stepsPerFrame: 20`, chosen when the CPU kernel at the high grid managed a few frames a second, so twenty passes a frame kept the pattern developing. Since 2026-11-08 the sim steps GPU-resident at the display rate (`src/app/grayScottGpu.ts`, 8.3 ms frames at ultra), so the same presets now run about 2400 passes a second and Waves and Mitosis race; the handoff recorded this as a known note. The kernel default `GRAY_SCOTT_DEFAULT_STEPS_PER_FRAME` is already 1 (`src/sims/gray-scott/model.ts`).

Every interestingness measurement so far ran the CPU kernel at 128² (`docs/sweeps/gray-scott-interestingness.md`, the 2026-11-08 re-run and the Waves fine sweep). The shipped grid is now 1280² on the GPU, where the ring seeding puts many more origins in the frame and the pattern's cell-scale is a tenth of the canvas it was; the 128² rankings may not hold there.

## Objective

Set all six Gray-Scott presets to one step per frame, then measure the sim as it actually ships: at the ultra grid on the GPU path (`data-simulation-renderer="gpu-ping-pong"`), for each preset, how many iterations and seconds it takes to reach a developed pattern at 60 Hz and at 120 Hz, whether dt 0.5 or 0.25 changes the look, and a bounded F/k interestingness pass around each preset scored on the real field at the ultra grid. Hand the operator a ranked shortlist as research-bench trials, and change nothing else in production.

## Visual goal

Operator's words: "set the sim speed to 1" and "more tuning with gary scott now the rendering issue is sorted."

- Target: Waves at 1x on a fresh load forms visible rings over seconds (forming at 2 s, rings at 10 s, a full field at 30 s on a 60 Hz display), not in a blink; Mitosis divides visibly; every preset's Steps per frame control reads 1.
- Failure: a preset that reaches its final texture inside two seconds at 60 Hz, or one that has not formed anything in 60 s.

## Inputs (read these in your own context)

- `docs/UAT/uat.md`
- `docs/sweeps/2026-11-08-operator-rerun.md`
- `docs/sweeps/gray-scott-interestingness.md`
- `docs/audits/gpu-acceleration-audit.md`
- `src/app/presets.ts`
- `src/sims/gray-scott/model.ts`
- `src/sims/gray-scott/kernel.ts`
- `src/app/grayScottGpu.ts`
- `src/app/webglRenderer.ts`
- `src/app/trialPresets.ts`
- `e2e/gray-scott-gpu.spec.ts`
- `e2e/gray-scott-gpu.config.ts`
- `e2e/harness/metrics.ts`
- `e2e/sweep.spec.ts`
- `src/app/grayScottPresets.contract.test.cjs`
- `src/app/trialPresets.ts`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/app/presets.ts`: in the `gray-scott` block, `stepsPerFrame: 20` becomes `stepsPerFrame: 1` on all six presets; F, k, Du, Dv, ids, labels and order unchanged; the U-skate comment stays.
2. A measurement harness, in `e2e/` beside the GPU spec (a new spec and config on a dedicated port, or additions to `e2e/gray-scott-gpu.spec.ts`), that loads the app at the ultra grid on the GPU path, reads the field through the canvas's `grayScottReadState` hook, and (a) for each preset at steps per frame 1 records iterations and wall seconds to a developed pattern at 60 Hz and 120 Hz (define "developed" as the composite in `e2e/harness/metrics.ts` reaching 90% of its 30 s value, on a 128² box-downsample of the V channel, and say so), (b) repeats Waves and Mitosis at dt 0.5 and 0.25, (c) scores a bounded grid around each preset: F ±0.002 and ±0.004, k ±0.001 and ±0.002 (25 sets a preset, 150 in all, plus the six presets as references) at a fixed iteration count per preset taken from (a), ranked by the same composite. Output to `e2e/artifacts/gray-scott-ultra-2026-11-10/` (git-ignored): ranked JSON, per-set PNGs, and app screenshots of each preset at 2 s, 10 s and 30 s.
3. `src/app/trialPresets.ts`: up to three stage-160 trials from the shortlist (distinct from the six presets by at least one F or k step), named for their look, using the stage-aware rows card 157 introduced; none if the shortlist is empty, and say so.
4. `docs/sweeps/2026-11-10-gray-scott-ultra-tuning.md`: method; the timing table per preset at 60 and 120 Hz with `stepsPerFrame` 1 and the dt readings; the ranked shortlist at the 1280² grid with the six references; the trial ids; image file names; and a "Decisions for the operator" section (keep 1 step per frame or set a per-preset value, promote any trial, and the open question of a five-point stencil for speed on the CPU fallback). Mention the renderer attribute value `gpu-ping-pong`, the grid 1280 and quote seconds, since the frozen oracle looks for them.
5. `CLAUDE.md`: one sentence in the Gray-Scott paragraph recording the step-per-frame change and the report path.

## Constraints

- Work from `dev` in the run worktree; never push `main` or `publish`. No kernel, GPU shader, quality-profile, default or interface change. The CPU fallback path is untouched.
- `public/thumbnails/gray-scott.png` is byte-for-byte unchanged (it is rendered from kernel defaults, which already step once a frame).
- `e2e/gray-scott-gpu.spec.ts` and `e2e/gray-scott-gpu.config.ts` keep passing; the spec sets `stepsPerFrame` explicitly, so it is unaffected by the preset change. Do not loosen any of its assertions.
- The nine stage-144 trials and the stage-157 trial are unchanged; `TRIAL_CONTRACT=157 npx playwright test -c e2e/trial-157.config.ts` still passes after your trials are added.
- Do not edit the frozen block in `src/app/grayScottPresets.contract.test.cjs`. The card-150 and card-151 frozen oracles are historical; do not touch them.
- Measurements are on the GPU path; if `data-simulation-renderer` reads `cpu-kernel` at any point, stop and report the environment rather than measuring the CPU.
- No absolute home-directory paths in committed files. Author identity via `agent-whoami --model '<your model id>'`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0. Planning base at `b318892d6`: 480 tests, 429 pass, 0 fail, 51 skipped. Skips are not passes.
2. Worker and verifier: after `npm run build:test`, `GRAY_SCOTT_SPEED=1 node --test src/app/grayScottPresets.contract.test.cjs` passes all 4 tests with no skips. Planning base: 2 pass, 2 fail (every preset reads `stepsPerFrame: 20`; the report is missing), the intended red.
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0.
4. Worker and verifier: `npx playwright test -c e2e/gray-scott-gpu.config.ts e2e/gray-scott-gpu.spec.ts e2e/smoke.spec.ts -g "gray-scott-gpu|live route loads and runs: (gray-scott|kuramoto-oscillators)$"` passes 6 of 6 against a server started from the run worktree on 5181 (planning base, 2026-11-08: 6 of 6), and `TRIAL_CONTRACT=157 npx playwright test -c e2e/trial-157.config.ts` passes 3 of 3.
5. Verifier browser: with cleared storage open `#/gray-scott` on a display or headless context at 60 Hz; `data-simulation-renderer` reads `gpu-ping-pong` and Grid quality reads ultra. For Waves and Mitosis, the Steps per frame control reads 1, and screenshots at 2 s, 10 s and 30 s after Reset read as the Visual goal target (forming, rings, full field). The report's iterations-to-developed figure for each preset reproduces within 20% in your run. A preset that finishes inside two seconds, or one unformed at 60 s, is a FAIL.
6. Verifier: re-run the worker's measurement harness once; the ranked shortlist ordering of the top five is identical and every reference score matches within 1e-6 (GPU float stepping; the 2026-11-08 parity figures are 1.4e-6 after 200 passes, so this is the honest tolerance, not 1e-9). Any trial the worker added opens from its deep link at the stated F and k.
7. Verifier scope: the diff touches only `src/app/presets.ts` (the six `stepsPerFrame` lines), the new or extended harness files under `e2e/`, `src/app/trialPresets.ts`, the report and `CLAUDE.md`. Any kernel, shader, GPU-path or quality-profile change is a FAIL regardless of other evidence.
8. Operator, not judged or recorded by either seat: a look after a PASS lands the stage on `dev` (the verifier reports it as not applicable, never as FAIL); promotions from the shortlist and any per-preset speed other than 1 are separate decisions.

## Contract test

- **Test file:** src/app/grayScottPresets.contract.test.cjs
- **Oracle command:** `npm run build:test && GRAY_SCOTT_SPEED=1 node --test src/app/grayScottPresets.contract.test.cjs` (skips without the flag)
- **Assertions digest:** sha256:3dc962980e226b545850c217d286d2b6cea6f1b95bb870f0f8590484eefce5ec
- **Oracle proof:** On the unchanged base `b318892d6` on 2026-11-09: 2 pass (kernel defaults nine-point / dt 1 / 1 step unchanged; the thumbnail hash matches), 2 fail (all six presets carry `stepsPerFrame: 20` where 1 is frozen; `docs/sweeps/2026-11-10-gray-scott-ultra-tuning.md` missing). Without the flag all 4 skip. No throwaway reference: the preset assertion is a literal object.

## Out of scope

Any kernel or shader change (five-point stencil, step budget, pass cap), the CPU fallback preset, promotions to shipped presets, the Kuramoto thumbnail regeneration, the iteration-counter over-count under the 960-pass cap, and the stale 143 baseline re-run (operator runbook in `HANDOFF.md`).

## Budget

- **Worker wall-clock:** 240 minutes
- **Verifier wall-clock:** 90 minutes
- **Spend basis:** last 40 emergence-lab dispatches: worker median 3.20M, p95 13.39M; verifier median 1.75M, p95 5.02M cached-inclusive tokens. Plan two worker medians plus one verifier median, about 8.2M, for the open-ended measurement; the p95 pair of 18.4M is reserve, not permission. Preparation (orchestrator, 2026-11-09): reading the speed plumbing and the frozen oracle, inside the interactive session.

## Dispatch envelope

Return the exact commands and exits, the timing table, the shortlist with scores and images, the trial ids, the renderer attribute observed, and whatever did not reproduce. State PASS, FAIL or partial honestly. Stop at wall-clock or an unresolved evidence failure; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

Both roles need a browser with WebGL2 float render targets: headless Chromium with `--use-angle=metal --enable-gpu` on this machine (the configs pass them). The GPU spec's config reuses a server on 5181 if one is listening, so start Vite from the run worktree on 5181 yourself (with a Vite `cacheDir` outside a symlinked `node_modules`, as the config's comment says) before running it. Do not use another checkout's server on 5173. Codex roles are sandboxed; this card declares Requires GUI.

## Readiness review

Baselines ran on `b318892d6` on 2026-11-09: `npm run build:test` green, the frozen oracle 2 of 4 red for the stated reasons, 4 of 4 skipped without the flag; verify and the GPU spec figures carried from the 2026-11-08 runs on the same tree. The operator's decision is `docs/UAT/uat.md` notes 1 and 4, read as stated under Decided. Gated on card 157 because the trials reuse its stage-aware catalogue. No cross-family cold read before queueing; the next orchestration session may add one here. Serial dispatch: shares `src/app/presets.ts` with 158 and 159, `src/app/trialPresets.ts` with 157, and `e2e/` harness files with 157 and 158.

## Retired

- **Retired:** 2026-11-11 by the operator, in the orchestration chat.
- **Reason:** the card misread the operator's request. "Set the sim speed to 1" meant the Simulation speed slider, which already opens at 1x for Gray-Scott (`speedProfileFor("gray-scott").initial` in `src/app/savedPresets.ts`) and which no preset changes. The card instead set every preset's Steps per frame from 20 to 1. The operator's words: "it wasnt he steps per frame that i wanted to 1 it was the sim speed i think i got confused." They judged Gray-Scott on `dev`, at Simulation speed 1x with Steps per frame 20, and found it fine, so no production change is wanted.
- **Not a failure:** attempt 1 failed criterion 4 (a card error: the GPU spec needs `GS_GPU_PERF=1`) and criterion 5 (Mitosis takes about 84 s to start dividing at one step per frame). Both follow from the misread brief, not from the worker.
- **Kept:** attempt 1 is on `wip/160-gray-scott-speed-one-ultra-tuning-attempt-1` (`7babaa258`), including `docs/sweeps/2026-11-10-gray-scott-ultra-tuning.md` and the trial shortlist ("Honeycomb holes" F 0.033 k 0.056, "Churning foam" F 0.02 k 0.0467). If the operator likes either trial after a look, it becomes a new preset card; nothing on that branch lands from this card.

## Recovery log

- **Attempt 1:** dispatched 2026-11-10T22:59:50Z on base `380121efd`. Worker partial (11.2M tokens), verifier FAIL on criteria 4 and 5 (4.1M). Preserved at `7babaa258` on `wip/160-gray-scott-speed-one-ultra-tuning-attempt-1`. Retired 2026-11-11 on the operator's decision above; no further attempts.
