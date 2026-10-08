# Stage card 107-logistic-mandelbrot-extreme-pool: widen the extreme candidate pool so the plane gets denser inside the budget card 105 spends

## Metadata

- **Authored:** 2026-10-07
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/107-logistic-mandelbrot-extreme-pool
- **Worker effort:** xhigh
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** stage-completed: 106-logistic-mandelbrot-tail-refinement-default
- **Dispatch:** serial
- **Pairing rationale:** a numerical and performance brief across the planner, the GPU sweep's batching, build memory and the kernel's own grid arrays, with four suites from cards 103, 105 and 106 to re-point where the pool legitimately changes what they compare; that is the strongest Anthropic tier's work, as cards 103 to 105 were. Sol verifies across the family boundary with the browser evidence in hand (`Requires GUI` widens the codex seat for Playwright). The worker family alternates with card 106's Codex worker. Astra is not seated for an unattended run.

## Objective

Card 103's audit left one ceiling on the plane: the candidate pool is the `extreme` resolution target, 1920 by 1920 cells (`src/app/resolutionPreset.ts`), and at 8 samples the base tier packs about 15% of the 9.6M point budget (bounded cells 927,497 of 3,686,400 candidates, base rows 1,446,428: 1.56 rows per bounded cell). After cards 105 and 106 the shipped default spends, at boundary detail 0, about 1.44M rows on the base tier and 5.76M on refinement, and leaves about 2.4M rows unspent.

Raise `RESOLUTION_TARGETS.extreme` to 2560 by 2560: 1.78 times the candidates, so the lattice on the plane is 1.33 times finer on each axis and the base tier packs an estimated 2.57M rows (the 103 ratios scaled), under its cap of 3.84M at Tail refinement 0.6; refinement keeps the 5.76M rows the slider grants; the total stays under the budget. The base sweep already runs in calls of at most `MAX_SAMPLE_JOBS_PER_CALL` (4,194,304) jobs, so a 2560-by-2560 sweep is two calls. The desktop default preset is `extreme` (`src/app/qualityProfiles.ts`), so this changes what a desktop visitor sees and pays: candidate cells, sampler readback bytes and the base tier's rows all grow by 1.78, and at boundary detail 1 the raised tier's candidates grow with them. The card measures build time, frame time, build and sampler bytes, and states the kernel's own grid arrays; the audit recommends whether the wider pool should stay, and the operator decides. A PASS lands on `dev`, not on `main`, the labs deployment or the public mirror.

These figures are derived estimates, not audit citations. If your measurement contradicts them so that criterion 2 cannot hold, stop and surface it as a blocker; do not weaken the criterion.

## Inputs (read these in your own context)

- `AGENTS.md`, `docs/INTERFACE.md` (read "Testing a pure src/app module")
- `src/app/resolutionPreset.ts`, `src/app/resolutionPreset.contract.test.cjs` (frozen), `src/app/qualityProfiles.ts` (about 88-110)
- `src/app/orbit3d.ts`, read by range: the preset ceilings and `POINT_BUDGETS` (about 696-720), `pointBudgetFor` (about 4225-4235), `orbitCloudBuildPlan` (about 4237-4345) and the stats interface (about 1000-1025)
- `src/app/orbitSampler.ts`: `MAX_SAMPLE_JOBS_PER_CALL` (about 959), `buildGpuOrbitCloud` (about 1079-1385), `sampleInBatches` (about 1388-1408), the texture-size check (about 655)
- `src/sims/logistic-mandelbrot/kernel.ts`: `init` (about 359-407), for the kernel's own grid arrays
- `src/app/controls.ts` (about 73-78, the Extreme option label)
- `e2e/harness/packedCells.ts` (`PRESET_TARGETS`, `openPacked`, `cloudStats`, `litFraction`, `screenshot`, `dollyAt`, `topDown`, `median`), `e2e/packed-cells.spec.ts` (`cardioidPose` about 101, the plane-coverage test about 163-200, the cost test about 479-620)
- `e2e/refine-levels.spec.ts` and `e2e/tail-default.spec.ts` (the comparisons at `extreme` this card re-points, see Deliverable 4)
- `e2e/harness/insideOut.ts` (`frozenParams`, `openSim`), `e2e/inside-out-cycling.spec.ts` (the real-axis evidence pose at c = -1.36, about 1254)
- `docs/audits/103-packed-cells.md`: "Planner constants", "Layout by preset and setting", "Plane coverage", "Cost"; `docs/audits/105-second-refinement-level.md` and `docs/audits/106-tail-refinement-default.md`: their cost tables
- `docs/audits/100-inside-out-spread-colouring.md`, "Serving the baseline"
- `playwright.config.ts`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/app/resolutionPreset.ts`: `extreme` is `2560 * 2560`, the comment says what the pool feeds and why it is this size, and the frozen block passes. The other presets and `DEFAULT_RESOLUTION` are unchanged.

2. `src/app/orbit3d.ts` and `src/app/orbitSampler.ts`: only what the wider pool needs. The planner's candidate grid still reaches the whole pool at `extreme` (`candidateCells = min(pool, desiredCells)`), a 2560-by-2560 grid still classifies as `extreme` (`pointBudgetFor` and the surface grid size), the base sweep batches at `MAX_SAMPLE_JOBS_PER_CALL` without raising that limit and without dropping jobs, and the sampler's texture-size check still holds for each batch on this machine. If nothing needs to change in these two files, say so in the audit with the lines you checked.

3. `e2e/harness/packedCells.ts`: `PRESET_TARGETS` follows the production targets (import `RESOLUTION_TARGETS` from `src/app/resolutionPreset.ts`, a zero-dependency module) instead of restating them.

4. Re-point the comparisons the pool legitimately changes, and nothing else: card 105's `defaults` and `cost` tests (`e2e/refine-levels.spec.ts`) and card 106's `default` and `cost` tests (`e2e/tail-default.spec.ts`) compare the tree under test with the served baseline at `extreme` by exact count or tight ratio; after this card the two trees differ there by design. Change those comparisons to `ultra`, whose pool is unchanged, keep every assertion they make, and name the lines in the audit. This card's own suite carries the `extreme` comparisons.

5. `e2e/extreme-pool.spec.ts` (new): the tests criteria 2 to 8 name, using the `--grep` names given.

6. `docs/audits/107-extreme-pool.md` (new): a layout table at `extreme` on both trees, boundary detail 0 and 1, Tail refinement 0.6 (candidate cells, bounded cells, base cells, base rows, refinement row budget, level-1 and level-2 rows, raised-tier sub-cells, points, slots, build bytes, sampler bytes); the plane-coverage table; the cost table with the display-frame pacing each GPU frame time implies on this machine; the CPU-side bytes the kernel allocates for its own grid at both pools (`state` and `samples` in `init`), and whether the orbit3d renderer calls `init` with the full grid; the authoring estimates against your measurement; each criterion's result with literal evidence paths under git-ignored `e2e/artifacts/extreme-pool/`; a recommendation on whether the wider pool should stay the desktop default, with the measurements behind it; unresolved limitations.

Supporting changes are allowed only where these deliverables need them: `tsconfig.test.json`, `e2e/harness/*.ts`, `src/app/controls.ts` (the Extreme label only, and only if it should state the cost).

## Constraints

- The frozen block in `src/app/resolutionPreset.contract.test.cjs` is not edited, and neither are the frozen blocks in `src/app/paramPersistence.contract.test.cjs`, `src/app/orbitRefineLevels.contract.test.cjs`, `src/app/orbitPacking.contract.test.cjs`, `src/app/orbitHierarchy.contract.test.cjs` and `e2e/inside-out-cycling.contract.spec.ts`.
- The point budgets, the refinement rule, the packed layout, the shader contract, colouring, the surface mesh, the camera, palettes, the tone map and every kernel default are unchanged. The `performance`, `balanced`, `high` and `ultra` pools are unchanged, and the build at `ultra` is identical to the served baseline's.
- The point budget is never exceeded. CPU-side build arrays stay sized to the point budget, never to candidates times `sampleCount`.
- No expected value is fed into the production path that is meant to produce it.
- The public `SimKernel` contract in `docs/INTERFACE.md` and every other simulation are unchanged; `extreme` is surfaced only for the logistic-Mandelbrot sim (`showExtremeResolution`) and that stays so.
- Run every command in the foreground and wait for it to exit. Never use `run_in_background`, `&`, `nohup` or a monitor, and never end a turn while a command is outstanding; the baseline server runs in a detached tmux session as the audit 100 recipe shows. Keep context lean: read large files by range and do not dump full logs. Write the dispatch envelope as the final action; a partial result with an envelope is better than none.
- Browser checks run headless by default with the repo's GPU flags; go headed only for criterion 4's display-link interval, and batch those into one launch. Use port 5173 for the tree under test and 5174 for the served baseline (`--strictPort`).
- No new packages, no commits by the worker, no queue mutations, no deployment.

## Acceptance criteria

The Sol verifier runs every command independently in the run worktree and judges all rows. A changing attribute or a green build alone cannot satisfy a rendered criterion. No required suite may pass with zero collected tests. Where a criterion names the served baseline, the unchanged tree is the dispatch base (`dev` as cut), served on port 5174 by the audit 100 recipe; a missing baseline fails that criterion.

1. **Regression and frozen contracts.** `npm run verify`; `scripts/check-contract-test-gate.sh --worktree` exits 0; `npm run build:test && EXTREME_POOL=1 node --test src/app/resolutionPreset.contract.test.cjs` (3 pass, 0 fail, 0 skipped); `PARAM_PERSISTENCE=1 node --test src/app/paramPersistence.contract.test.cjs` (6 pass); `ORBIT_LEVELS=1 node --test src/app/orbitRefineLevels.contract.test.cjs` (6 pass); `ORBIT_PACKING=1 node --test src/app/orbitPacking.contract.test.cjs` (7 pass); `ORBIT_HIERARCHY=1 node --test src/app/orbitHierarchy.contract.test.cjs` (4 pass); `INSIDE_OUT_CYCLING=1 npx playwright test e2e/inside-out-cycling.contract.spec.ts --workers=1` (4 pass); `npx playwright test e2e/smoke.spec.ts --grep 'logistic-Mandelbrot|Logistic Mandelbrot|cyclic Magma|orbit camera' --workers=1`; and with the baseline served: `npx playwright test e2e/packed-cells.spec.ts --workers=1`, `npx playwright test e2e/refine-levels.spec.ts --workers=1`, `npx playwright test e2e/tail-default.spec.ts --workers=1`, and `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'spread|chaotic|controls and cache|hierarchy' --workers=1`. Before implementing, run the `EXTREME_POOL=1` command on the unchanged tree and keep its result (3 tests, 2 pass, 1 fail: the pool assertion) as the red baseline.

2. **The pool, the base tier and the budget.** `npx playwright test e2e/extreme-pool.spec.ts --grep 'layout' --workers=1`, GPU path, camera pinned, boundary detail 0, at Tail refinement 0.6 and 0, `extreme`, on both trees: `data-orbit3d-candidate-cells` is within 2% of 2560 by 2560 on the tree under test and of 1920 by 1920 on the served baseline; `data-orbit3d-base-cells` on the tree under test divided by the baseline's is between 1.72 and 1.84; `data-orbit3d-layout` is `packed`; at 0.6, `data-orbit3d-refine-row-budget` equals the baseline's exactly and `-refined-l1-rows` plus `-refined-l2-rows` is within 1% of the baseline's sum; `data-orbit3d-points` never exceeds `data-orbit3d-point-budget`. At `ultra`, Tail refinement 0.6 and 0, `data-orbit3d-candidate-cells`, `-base-cells`, `-refined-sub-cells`, `-points` and `-slots` equal the baseline's exactly.

3. **A denser plane.** `--grep 'plane'`: card 103's plane-coverage pose, rectangle and lit threshold (`cardioidPose`, 240 by 240 px at (520, 240) of a 1280 by 720 canvas, 8-bit luma 40), splat growth 0, GPU `extreme`, boundary detail 0, Tail refinement 0.6: the lit fraction on the tree under test exceeds the served baseline's by at least 15% relative (the baseline measured 0.3430 on card 103), and at `ultra` the two trees agree within 2% relative. Record every fraction and ratio in the audit.

4. **Cost at the desktop default.** `--grep 'cost'`, GPU `extreme`, boundary detail 1, Tail refinement 0.6 (the shipped default after card 106), camera pinned, with card 103's timing helper, three matched samples each on both trees: cloud build wall-clock to `data-orbit3d-build="complete"` on the tree under test is at most 2.2 times the baseline's median; GPU frame time (where `EXT_disjoint_timer_query_webgl2` is available) at most 1.5 times; `data-orbit3d-build-bytes` at most 1.5 times; `data-orbit3d-sampler-bytes` at most 1.9 times; the headed display-link `requestAnimationFrame` interval is recorded on both trees, no bar. The audit states the absolute values, whether the GPU frame time crosses a 16.7 ms display frame on this machine, and the kernel-array bytes of Deliverable 6.

5. **Boundary detail keeps its gating.** `--grep 'boundary detail'`, GPU `extreme`, boundary detail 1, Tail refinement 0.6: `data-orbit3d-boundary-detail` is `active`; `-detail-base-slots` equals `data-orbit3d-slots` read from the tree under test at the same settings with boundary detail 0; `-refined-detail-sub-cells` divided by the baseline's is between 1.5 and 1.9 (record both and the ratio).

6. **The CPU fallback at `extreme`.** `--grep 'cpu'`, `?orbit3dSampler=cpu`, `extreme`, no `tailRefinement` key (the default), boundary detail 0, camera pinned, test timeout 900 s: the build completes on the tree under test; `data-orbit3d-candidate-cells` is within 2% of 2560 by 2560; `data-orbit3d-refine-row-budget` equals `floor(data-orbit3d-point-budget * 0.3)`; the build wall-clock is recorded against the served baseline's, one sample each, no bar. The audit recommends whether the CPU fallback should cap its pool at `ultra`.

7. **The prebaked path is unchanged.** Bake `public/baked/lm-tiny.elpc` in the run worktree with `npm run build:test && node scripts/bake-orbit3d.mjs --points 2e5 --warmup 2000 --samples 8 --out public/baked/lm-tiny.elpc`; `--grep 'prebaked'` selects it through Model source and reads `data-orbit3d-sampler="prebaked"`, `data-orbit3d-layout="stacked"` and `data-orbit3d-points` equal to the bake's cell count times 8 at Plotted iterations 8, the same as on the served baseline.

8. **Evidence for the operator.** `--grep 'evidence'` saves under `e2e/artifacts/extreme-pool/` screenshots of card 103's cardioid pose and of card 104's real-axis pose (zoom to c = -1.36 at height 0.2, then the per-view drag) at the shipped defaults on both trees. The verifier opens them and records, with literal paths, whether the plane's lattice is visibly finer on the tree under test and whether either tree shows gaps, and quotes criterion 4's GPU frame times beside them. Whether the result looks good is the operator's judgement and is not a criterion.

Run the whole new spec once as well: `npx playwright test e2e/extreme-pool.spec.ts --workers=1`.

## Contract test

- **Test file:** src/app/resolutionPreset.contract.test.cjs
- **Assertions digest:** `sha256:5cb3426795a015421626a033cd2139bff50b99ae0870cb995cbfde02e0b2698f`

The frozen block fixes the pool decision and that nothing else about the presets moves. It does not cover the planner, the sweep, the suites or the measurements; criteria 2 to 8 remain mandatory.

## Authoring verification

On dev at `5b7e7806c`, 2026-10-07, with the frozen test in the working tree and `src/app/resolutionPreset.ts` added to `tsconfig.test.json`: `npm test` passes (425 tests, 392 pass, 33 skipped, 0 fail). `EXTREME_POOL=1 node --test src/app/resolutionPreset.contract.test.cjs` runs 3 tests, 2 pass, 1 fail (the pool assertion, `extreme` is still 1920 by 1920). The planner, the base sweep's batching (`sampleInBatches`, calls of at most 4,194,304 jobs) and the kernel's `init` were read at authoring; the estimates in the Objective scale card 103's measured ratios (25.2% bounded, 1.56 rows per bounded cell) to the wider pool.

## Out of scope

- The point budgets, a third refinement level, the refinement rule and every kernel default.
- The `performance`, `balanced`, `high` and `ultra` pools, and the tablet and phone caps in `qualityProfiles.ts`.
- The baker, the bake format, compacting a prebaked cloud at load.
- Colouring, the surface mesh, the camera, palettes, other simulations, public interface changes, release or deployment.

## Budget

- **Worker wall-clock:** 480 minutes
- **Verifier wall-clock:** 240 minutes
- Planning evidence: card 104's Fable worker spent 11.0M tokens in 40 minutes and card 103's 11.1M on its first attempt; the Sol verifiers spent 2.5M, 6.9M and 4.2M. This card changes less code than those but runs more `extreme` builds and re-points four tests: plan 12M for the worker and 5M for the verifier. Serial.
- Stop with an explicit partial result if the remaining checks cannot be covered. A retry needs a re-brief.

## Verification

Verifier writes the schema-valid `state/verifiers/107-logistic-mandelbrot-extreme-pool.json` with one result and literal evidence paths per numbered criterion. Overall PASS requires all eight.

## Family-specific notes

Both roles use the repo's subscription CLI routes; do not change auth routing to work around a refusal or a browser failure. Headless Chromium needs the repo's existing GPU flags for WebGL2 (`playwright.config.ts`); `Requires GUI: true` widens the codex seat so it can launch the browser. The Claude worker runs browser checks headless through Playwright with the same config and needs no widening.

## PROPOSED-AMENDMENT (2026-10-08, after 107-logistic-mandelbrot-extreme-pool attempt 2)

Criterion 4's cost bar (GPU frame-time ratio <=1.5 at the desktop default, detail 1 / tail 0.6) and the requirement that the widened extreme pool (2560x2560, 1.78x base cells) ship as the desktop default are in tension as currently written. Two independent runs (the worker's audit and the verifier's own matched re-measurement) found the same GPU-side threshold effect: resident point-attribute buffers below roughly 399MB cost about half as much per point as buffers above roughly 446MB; the detail-1 cloud under the wider pool measures 492MB, crossing the threshold, giving a GPU frame-time ratio of 2.53x against a 1.5x bar, even though build time (1.31x), build bytes (1.37x) and sampler bytes (1.56x) all clear their own bars. This is not an implementation shortfall: both trees pass identically on every other criterion (2, 3, 5, 6, 7, 8) and on criterion 1's gate/contract/smoke/packed-cells/cycling suites.

Propose one of: (a) relax criterion 4's GPU-frame-time bar specifically for the wider-pool default, citing the measured threshold; (b) scope this card to ship the wider pool at a detail level or tail setting that stays under the roughly 446MB threshold by default, with detail 1 at 0.6 as an opt-in rather than the shipped default (the audit names three capping options at docs/audits/107-extreme-pool.md); or (c) accept the regression as a documented tradeoff and amend the bar's applicability.

Separately, criterion 1 fails on three sub-assertions that are consequences of widening the pool interacting with earlier cards' fixed test expectations, not of this card's own named deliverables: refine-levels' card-105 budget test at tailRefinement 0.3 (level 1 now fills the whole share, leaving level 2 empty — e2e/refine-levels.spec.ts:143-150), the cycling frozen-contract's hybrid-default chroma floor (0.0146 measured vs required >0.02 — e2e/inside-out-cycling.spec.ts:382-393), and tail-default's own pre-106 legacy baseline assumption (e2e/tail-default.spec.ts:197-204, independent of this card). Making criterion 1 pass without editing those earlier cards' frozen blocks may not be possible from inside stage 107's scope. Worth deciding whether those three assertions need their own amendment too, or whether this card's cost/default-shipping tension is resolved first and the regressions are re-measured against the resolved version.

## Re-brief (attempt 2, 2026-10-08, after verifier FAIL on cost and three near-miss regressions)

Restore the preserved commit 50f3f0d8aa537a0fdb10bb171868dc1904353e6f (branch
wip/107-logistic-mandelbrot-extreme-pool-attempt-1) rather than starting over.
Six of eight criteria already pass cleanly on independent reruns and should
not be touched: the pool/base-tier/budget accounting (2), the denser plane
(3), boundary detail gating (5), the CPU fallback (6), the prebaked path (7),
and the operator evidence (8). Keep that work.

Two criteria failed and both are real, fixable implementation gaps, not
card-wording problems:

- **Criterion 4 (cost at the desktop default):** the GPU timer came in at
  65.261 ms current vs 25.771 ms baseline, a 2.532x ratio against a <=1.5x
  bar (build time 1.309x and both byte bars were within tolerance). The
  extreme-pool change is too expensive on the GPU path at the desktop
  default specifically; profile what the extra refinement work costs on the
  GPU timer and bring it back under 1.5x, even if that means trimming where
  the extra density is spent at that specific tier.
- **Criterion 1 (regression and frozen contracts):** three suites each
  missed by a small, specific margin — not broad regressions:
  - `e2e/refine-levels.spec.ts:143-150` — gpu extreme at tailRefinement 0.3
    produced `refinedL2SubCells=0` against the `>0` assertion.
  - `e2e/tail-default.spec.ts:197-204` — legacy baseline value was
    `undefined` against an expected `0`.
  - `e2e/inside-out-cycling.spec.ts:382-393` — sheet z=-1 chroma was
    0.014614 against a `>0.02` threshold.

  Also: the verifier flagged that the dirty tree touches
  `e2e/packed-cells.spec.ts` and `e2e/inside-out-cycling.spec.ts` beyond the
  four comparisons deliverable 4 names to re-point. Re-check that those
  touches are deliberate and scoped, not incidental fallout from the cost
  fix.

Re-run `npm run verify` and `scripts/check-contract-test-gate.sh --worktree`
after addressing both, plus the full extreme-pool e2e suite (note: its cost
case launches headed Chromium — that's fine for the worker; the verifier
reruns it headless-only).
