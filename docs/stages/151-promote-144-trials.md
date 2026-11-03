# Stage card 151-promote-144-trials: Restless threads preset and a new Particle Life default

## Metadata

- **Authored:** 2026-11-03
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Verifier:** Claude Sonnet 5.5 <claude-sonnet-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/151-promote-144-trials
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** the diff is literal values, two test lines, one regenerated PNG and two doc appendices, so a coding-tier Codex worker suffices. Acceptance is partly visual (each regime must still read as the reviewed trial on fresh seeds), so the verifier is a Claude seat driving headless Chromium, the established cross-family pairing for preset promotions (cards 68, 69, 75). No frontier seat: the operator gives the final look.
- **Open decisions:** none
- **Readiness:** see Readiness review.

## Surfacing concern

Stage 150 shipped nine read-only stage-144 trials in the Presets library. The operator reviewed all nine live on 2026-11-03 (`docs/UAT/uat-preset-review.md`, committed with this card) and kept two: Physarum "Fine restless threads" ("best so far, favourite") and Particle Life "Eight-species attraction" ("good representation of atom / molecule like structures, much better than the last default"). The other seven were rejected (simplify too soon, too slow, or too busy); they stay in the trial catalogue as evidence and are not promoted. Boids produced no keeper and is carded separately as a follow-up sweep.

Sweep 144 itself proposed no promotion for either kernel because its instrument could not rank them robustly. The operator's visual sign-off overrides that on aesthetics, which is what sweep 144's "Proposed promotions" sections said the decision would need. Nothing here claims the scores support the change; the appendices must say so.

## Objective

Ship the two keepers, exactly as reviewed:

1. Physarum gains a fifth preset, **Restless threads** (id `restless-threads`), with the trial's parameters.
2. Particle Life's kernel default (the values a fresh load uses and the "Kernel default" entry of the Kernel preset select) becomes the Eight-species attraction row. Cells, Chasers and Gas clouds stay as presets, unchanged.

Both run on a fresh renderer seed each load, like every other shipped preset. The trials ran at seed 144; the operator accepted the seed difference on 2026-11-03.

## Visual goal

The verifier and the operator judge against the retained stage-144 app-renderer screenshots (real `Renderer`, shipped populations, 960×600, seed 144):

- Physarum target: `docs/images/sweeps-2026-10-30/144-app-physarum-144-physarum-evaporation0.975_depositAmount0.06_moveSpeed2.5_sensorDistance3_sensorAngle30-shipped-32000-t600-app.png` and the `-t1200-app.png` beside it. Fine, restless, thread-like trails that keep moving. Contrast: `144-app-physarum-144-current-root-mat-shipped-31500-t1200-app.png` (thicker sinuous strands).
- Particle Life target: `docs/images/sweeps-2026-10-30/144-app-particle-life-144-particle-life-friction0.97_species8_forceScale140_matrixBias0.35-shipped-6000-t600-app.png`. Discrete multi-colour clumps of several hundred particles, two or three dense, against sparse scatter. Contrast: `144-app-particle-life-144-current-cells-shipped-6000-t600-app.png` (near-uniform scatter; Cells is the closest retained reference, there is no retained frame of the old kernel default).

The operator's words for the Particle Life regime: "atom / molecule like structures". Live frames will not match the screenshots pixel for pixel (fresh seed, viewport); they must match in kind.

## Inputs (read these in your own context)

- `docs/UAT/uat-preset-review.md` — the operator decision record
- `src/app/presets.ts` — the `physarum` block (four entries) and the `particle-life` block (three entries)
- `src/sims/particle-life/kernel.ts` — the `DEFAULT_*` constants near the top and the `paramSchema` entries that read them; nothing else
- `src/sims/particle-life/kernel.test.cjs` — the schema test asserting the current defaults
- `src/app/trialPresets.ts` — read-only: the nine source rows, including the two being promoted
- `scripts/generate-thumbnails.mjs` — header comment and `STEPS_BY_SLUG`
- `docs/sweeps/physarum-interestingness.md` — "Promotion appendix — 2026-08-30" (appendix style) and the stage-144 supplement
- `docs/sweeps/particle-life-interestingness.md` — the stage-144 "Interpretation", "Proposed promotions" and supplement sections
- `docs/sweeps/data/2026-10-30/144/physarum.app-evidence.json` and `docs/sweeps/data/2026-10-30/144/particle-life.app-evidence.json` — the two `kind: finalist`, `population: shipped …` rows named below
- `src/app/shippedPresets.contract.test.cjs` — the frozen oracle (read, never edit)

## Deliverables

1. `src/app/presets.ts` — a fifth entry at the end of the `physarum` block: `id: "restless-threads"`, `label: "Restless threads"`, params exactly `agentCount: 32000, sensorAngle: 30, sensorDistance: 3, turnSpeed: 22.5, moveSpeed: 2.5, depositAmount: 0.06, evaporation: 0.975, stepsPerFrame: 1`. No `seed` key (the preset select applies schema keys only and drops anything else). A short comment names the source row `evaporation0.975_depositAmount0.06_moveSpeed2.5_sensorDistance3_sensorAngle30` and the 2026-11-03 operator decision. Every other entry in the file is byte-identical.
2. `src/sims/particle-life/kernel.ts` — the seven default constants become the trial row: `DEFAULT_PARTICLE_COUNT = 6000`, `DEFAULT_SPECIES = 8`, `DEFAULT_RMAX = 24`, `DEFAULT_RMIN = 12`, `DEFAULT_FORCE_SCALE = 140`, `DEFAULT_FRICTION = 0.97`, `DEFAULT_MATRIX_BIAS = 0.35`. `DEFAULT_POINT_SIZE` stays 3; every `min`, `max`, `step`, cap and the dynamics are untouched. A short comment names the source row `friction0.97_species8_forceScale140_matrixBias0.35` and the decision. (All seven values sit inside the current descriptor ranges: particleCount 100–20000, species 2–8, rmax 10–120, rmin 2–60, forceScale 1–160, friction 0–0.99, matrixBias −0.5–0.5.)
3. `src/sims/particle-life/kernel.test.cjs` — the two default assertions move with the kernel: `particleCount.default` 5901 → 6000, `species.default` 5 → 8. No other line changes; the "missing params use schema defaults" test must still pass unmodified.
4. `public/thumbnails/particle-life.png` — regenerated with `node scripts/generate-thumbnails.mjs` (it boots its own Vite on port 5177; check the port is free first and do not touch a server on 5173). Commit only this one PNG. If the run rewrote any other thumbnail, restore it from `dev` so the other 25 stay byte-identical. Look at the new PNG: it must show the clumped multi-colour regime, not a uniform scatter.
5. `docs/sweeps/physarum-interestingness.md` — a dated appendix `## Promotion appendix — 2026-11-03` after the stage-144 supplement: the operator decision and the UAT file; the shipped values; that the trial ran at seed 144 and the preset ships without a seed; that sweep 144 proposed no promotion and the scores are not the basis; the retained app-evidence row and its three screenshots; the verifier's retained screenshot path once known (or a plain statement that it was verified live).
6. `docs/sweeps/particle-life-interestingness.md` — a dated appendix `## Default appendix — 2026-11-03`: the old default (5901 particles, 5 species, rmax 77, rmin 45, forceScale 108, friction 0.8, bias 0.15), the new default, the UAT decision, the stage-144 fragility caveats (0.534 at 1200 steps in the 128² sweep; seeds 145/146 at 0.910/0.923; shipped-population score 0.02) stated honestly as known limitations the operator accepted on looks, that Cells/Chasers/Gas clouds are unchanged, and the thumbnail regeneration.

## Constraints

- Work from current `dev`. Additive except for the seven constants and the two test lines. `git diff --stat` against the base lists exactly the six paths above.
- `src/app/trialPresets.ts` and `src/app/presetLibrary.ts` stay untouched: the frozen stage-150 suite asserts nine trials and their exact source values, and the two promoted rows remain valid trials. The library's "candidates, not promoted defaults" sentence is left for a later UI card.
- No seed plumbing in `src/app/controls.ts`, `src/app/simView.ts` or the kernels. No `RETIRED_DEFAULTS` entry in `src/app/paramPersistence.ts`: stored values that differ from the old default survive as they are, and anyone who never changed a value simply gets the new default, which is the intent.
- No kernel-to-renderer interface change, no change to any other sim, no Boids work, no change to the seven rejected trials.
- No queue/budget/auth changes, deployment, `main` merge or publication.
- Browser verification uses an isolated owned port and stops only its own processes. Headless Chromium needs `--use-angle=metal --enable-gpu` for these WebGL2 sims.
- "At least 600 steps" in the criteria means the side-panel iteration counter reads 600 or more; the reference frames were fixed-step captures at t600, so a frame at a higher counter is acceptable, a lower one is not.
- Retained screenshots go under `e2e/artifacts/151-promote-144-trials/` (git-ignored, so outside the tracked diff) with their paths in the envelope; the verifier keeps its own under the same directory in its worktree and names them in its report.
- The thumbnail generator renders Particle Life for its 48-step default, which may be too early for clumps. If the regenerated PNG shows a uniform scatter, the worker may add exactly one line to `STEPS_BY_SLUG` in `scripts/generate-thumbnails.mjs` for `"particle-life"` (600 is the reference horizon) and regenerate; no other change to that script.
- Keep "session limit", "usage limit", "rate limit" and "429" out of any envelope prose.

## Acceptance criteria

1. Worker and verifier: `npm run verify` exits 0 (typecheck, kernel and app tests including the updated kernel test, production build).
2. Worker and verifier: after `npm run build:test`, `SHIPPED_PRESETS=1 node --test src/app/shippedPresets.contract.test.cjs` passes every test with no skips, and `scripts/check-contract-test-gate.sh --worktree` exits 0.
3. Verifier browser, Physarum: with cleared storage open `#/physarum`, choose Kernel preset "Restless threads", and read all eight control values; they equal deliverable 1 exactly. On three fresh loads run at least 600 steps at the default quality profile: every one of the three frames reads as fine, restless thread-like trails like the Visual goal target, not a honeycomb, a few thick walls, or a blank field; one load that does not is a FAIL. Retain one screenshot per load.
4. Verifier browser, Particle Life: with cleared storage open `#/particle-life`; the Kernel preset select shows "Kernel default" and the controls read 6000 / 8 / 24 / 12 / 140 / 0.97 / 0.35 / point size 3. On three fresh loads run at least 600 steps: every one of the three frames shows discrete multi-colour clumps against sparse scatter like the Visual goal target, not a near-uniform scatter (the Cells reference image shows that failure mode); one load that does not is a FAIL. Choose Cells, then Kernel default: the values return to the new default. Press "Reset to defaults" after changing a slider: same. Retain one screenshot per load.
5. Verifier persistence: on `#/particle-life` set rmax to 40 and reload: 40 survives. Clear storage and reload: 24. No stale value is inherited from the old default.
6. Verifier: `PRESET_CONTRACT=150 npx playwright test -c e2e/presets-150.config.ts` exits 0 on the run branch: the nine trials are unchanged, and opening the "Eight-species attraction" trial gives the same effective values as the new default.
7. Verifier thumbnail: `git diff --stat <base>..HEAD -- public/thumbnails` lists only `particle-life.png`; the verifier views the PNG and confirms it shows the clumped regime (the frozen test only proves the bytes changed); the gallery card renders it.
8. Verifier scope: the full diff touches only the six paths in Deliverables, plus at most one added `STEPS_BY_SLUG` line in `scripts/generate-thumbnails.mjs` under the thumbnail constraint. `git diff <base>..HEAD -- src/app/presets.ts` is a pure insertion of the new entry and its comment. Any other path or any changed line in an existing preset is a FAIL regardless of other evidence.

## Contract test

- **Test file:** src/app/shippedPresets.contract.test.cjs
- **Assertions digest:** `sha256:9e6e162f58475881b67ee587d016191b5020498a181f8d09762b1a6272d8ff6b`
- **Oracle proof:** On base `35a730ba3`, after `npm run build:test`, `SHIPPED_PRESETS=1 node --test src/app/shippedPresets.contract.test.cjs` ran 7 tests, 2 pass, 5 fail, 0 skipped. First failure: test 1 (physarum preset count 4, expected 5); then test 3 (`particleCount` default 5901, expected 6000), test 4 (a kernel given `{}` does not match the new defaults), test 6 (`particle-life.png` still at its base hash) and test 7 (no 2026-11-03 appendix). Tests 2 and 5 pass on base by design: they are the range and unchanged-preset constraints. Reference: a throwaway detached worktree with the six deliverables applied by script (literal edits, a one-byte change to the PNG, stub appendices with the required headings and phrases) compiled and passed 7/7 with no skips, and the updated `kernel.test.cjs` passed 12/12 there. Bad fixture: reverting one incumbent value (`root-mat` depositAmount 0.22 to 0.24) in the reference failed exactly test 1 and no other. The reference was not kept; nothing from it is on `dev`.

The frozen block covers the values and the "unchanged" constraints: the new Physarum entry and its exact values, the four incumbents value-for-value, the seven Particle Life defaults with unchanged ranges and point size, the three Particle Life presets value-for-value, the kernel still treating `{}` as its defaults, the Particle Life thumbnail at a hash other than the base's with the other 25 thumbnails at their base hashes, and both appendix headings and phrases present. It does not run `npm run verify` or the contract gate (criteria 1 and 2 are the seats' own commands), does not inspect the git diff (criterion 8 is a verifier git check; value-for-value comparison would not catch a textual edit that preserves values), and does not judge any frame or the thumbnail's look (criteria 3 to 7 are the verifier's browser and visual judgements). The frozen suite is not a substitute for any of those.

## Path claims

Implementation claims: `src/app/presets.ts`, `src/sims/particle-life/kernel.ts`, `src/sims/particle-life/kernel.test.cjs`, `public/thumbnails/particle-life.png`, `docs/sweeps/physarum-interestingness.md`, `docs/sweeps/particle-life-interestingness.md`; conditionally `scripts/generate-thumbnails.mjs` (one added `STEPS_BY_SLUG` line only, see Constraints). Evidence, untracked: `e2e/artifacts/151-promote-144-trials/`. Orchestrator-owned and already on the base: `src/app/shippedPresets.contract.test.cjs` (frozen), the `src/app/presets.ts` line in `tsconfig.test.json`, `docs/UAT/uat-preset-review.md`. Read-only: everything else, in particular `src/app/trialPresets.ts`, `src/app/presetLibrary.ts`, `src/app/controls.ts`, `src/app/simView.ts`, `src/app/paramPersistence.ts`, `e2e/**`, `docs/INTERFACE.md`.

## Operator decisions (2026-11-03, orchestration chat)

The UAT file records the aesthetic verdicts only. The decisions below were put to the operator as numbered questions with a recommended answer and accepted in the orchestration chat on 2026-11-03; this card is their record.

1. Seed: the shipped preset and the kernel default run on a fresh renderer seed each load (presets cannot carry a seed; the trials ran at seed 144). Accepted, with the three-load check in criteria 3 and 4.
2. Particle Life default: replace the kernel default values exactly with the Eight-species attraction row; keep Cells, Chasers and Gas clouds; add no extra named preset. Accepted.
3. Physarum label: "Restless threads" (house style) rather than the trial's "Fine restless threads". Accepted.
4. Boids: a separate follow-up sweep card after this card is queued. Accepted; out of scope here.
5. The stage-144 fragility caveats (seed and horizon sensitivity, shipped-population score 0.02) were put to the operator with the default question and accepted on looks; deliverable 6 records them.

## Out of scope

The Boids follow-up sweep (its own card); the seven rejected trials; the library's trial description text; seed plumbing for presets; `RETIRED_DEFAULTS`; README or registry prose; stage 145; `main`, labs and the public mirror.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 60 minutes
- **Spend basis:** cards 68 and 69 (the last preset promotions) ran 0.7–0.8M worker and 1.5–1.7M verifier tokens each; this card adds a thumbnail regeneration and three-load browser checks, so 2–5M cached-inclusive tokens for the pair. Preparation checkpoint 15 minutes of orchestrator time; actual preparation is recorded in Readiness review. No automatic retry.

## Escalation

If either regime on fresh seeds does not read like its Visual goal target on any load, record every screenshot taken and the control readings and stop: do not tune values to chase the look, that is a sweep, not a promotion. If `generate-thumbnails.mjs` cannot create a WebGL context on this machine, record the error and stop; do not hand-edit or copy a PNG. If any other thumbnail changes bytes, restore it from `dev` and say so in the envelope.

## Dispatch envelope

Report every command and its exit, the eight Physarum and eight Particle Life control readings, the screenshot paths for the six loads, the `git diff --stat` against the base, the thumbnail hashes before and after, and anything not done. Missing evidence is incomplete, not PASS. Never edit the frozen block.

## Verifier handoff

Re-run criteria 1 and 2, then drive your own headless Chromium (`--use-angle=metal --enable-gpu`) against your own Vite on an isolated port for criteria 3 to 6; read the control values from the DOM, not from the envelope. View the regenerated PNG. Judge the frames against the Visual goal images in kind, not pixel for pixel. The operator's aesthetic sign-off follows your verdict and is not yours to give.

## Readiness review

Baseline at `35a730ba3` (clean `dev`, stage 150 landed): `npm run verify` exit 0 reused from the stage-150 verifier at this head (406 pass, 38 opt-in skips, 2026-11-02T17:55Z); both kernel test files re-run today, 28 pass. `scripts/check-contract-test-gate.sh --worktree` exit 0 with the new frozen test present and the digest recorded. Port 5177 free; `playwright` resolves. Facts of record checked: the preset select applies schema keys only (`applyParams` in `src/app/controls.ts`), so a preset cannot carry a seed; the Kernel default option and Reset to defaults both read `defaultParamsFromSchema`; `src/app/paramPersistence.ts` stores only non-default values, so no `RETIRED_DEFAULTS` entry is needed; the frozen stage-150 suite asserts nine trials with exact source values, hence the trial catalogue is read-only here; `src/sims/particle-life/kernel.test.cjs` asserts the two old defaults, hence deliverable 3; `public/thumbnails/particle-life.png` is rendered from `{}` params by `scripts/generate-thumbnails.mjs`, hence deliverable 4 (its history shows single-PNG regenerations after default changes, e.g. `eeb60c2a4`).

Cold read: GPT-6.1 Sol via `codex exec --sandbox read-only` on 2026-11-03 (about 58k tokens). Findings and how they were folded in: the all-three-loads criterion conflicted with a two-of-three escalation threshold (made consistent: any failing load fails and stops); "600 steps" was undefined (now the side-panel iteration counter); screenshots had no home inside the six-path rule (now the git-ignored artifacts directory); the 48-step thumbnail default may show no clumps (one `STEPS_BY_SLUG` line now permitted and claimed); the oracle's coverage was overstated (Contract test paragraph rewritten to say what it does not cover and criterion 8 now checks the diff textually); Cells was described as the old default (corrected to the closest retained reference); the UAT file does not record the seed and fragility decisions (recorded in Operator decisions). No material finding remains unassigned.

Preparation spend: one orchestrator session of about 25 minutes including the interview, oracle authoring with red proof and a scripted reference, and the cold read; over the 15-minute checkpoint by the reference and cold read, both of which found or closed real defects. No production implementation was authored; the reference worktree was deleted.
