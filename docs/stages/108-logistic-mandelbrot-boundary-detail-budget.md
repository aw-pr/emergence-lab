# Stage card 108-logistic-mandelbrot-boundary-detail-budget: raise the boundary-detail ceiling at extreme to 20M points, and hold the raised tier under one draw's byte ceiling at every setting

## Metadata

- **Authored:** 2026-10-09
- **Orchestrator:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Worker:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/108-logistic-mandelbrot-boundary-detail-budget
- **Worker effort:** xhigh
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** a budget and GPU-cost brief through the planner, the GPU builder's raised tier, the split upload card 107 introduced and the hybrid path that shares the plan, with suites from cards 103 to 107 that compare against a served baseline; that is the strongest Anthropic tier's work, as cards 103 to 107 were. Sol verifies across the family boundary with the browser evidence in hand (`Requires GUI` widens the codex seat for Playwright). Astra is not seated for an unattended run.

## Objective

The desktop default (`extreme`, boundary detail 1, Tail refinement 0.6) builds about 15.36M of a 16,000,000-point ceiling (`docs/audits/107-extreme-pool.md`, "Layout at `extreme`": lower tiers 8,361,936 points, raised tier 7,002,192). Card 107 found that on this machine (Apple M2 Max, ANGLE on Metal) every rasterised point costs about twice as much once more than about 415 to 446 MB of attribute buffers are bound to one point draw, at 32 bytes a point, and split the raised tier into its own buffers and draw so the opening pose binds the lower tiers' 268 MB alone ("Why the GPU frame doubled, and the fix"). The raised tier is hidden at the opening pose and drawn only within the show distance (2.8).

That leaves room in one place: the raised tier's own draw, at 224 MB, is a little over half the ceiling. This card:

1. Raises the boundary-detail ceiling at `extreme` from 16,000,000 to 20,000,000 points. Every other tier keeps 16,000,000, so every comparison earlier cards re-pointed to `ultra` keeps comparing like with like.
2. Caps the raised tier at `MAX_DRAW_BOUND_BYTES` (400,000,000 bytes, 12,500,000 points) at every tier and every setting. Today nothing caps it: at Tail refinement 0 the lower tiers at `extreme` hold about 2.6M points, so the raised tier may grow toward 13.4M points (about 429 MB), inside the measured threshold band. Whether it actually does is unmeasured; this card measures it on the served baseline and records it.

Estimate (derived, not measured): at the desktop default the raised tier grows from about 7.0M to about 11.6M points (about 372 MB in its own draw), total points from about 15.4M to about 20.0M, the opening-pose frame is unchanged because the raised tier is not drawn there, and the close-up frame, build time and sampler readback grow. The audit recommends whether 20M should stay the desktop default, and the operator decides. A PASS lands on `dev`, not on `main`, the labs deployment or the public mirror.

If your measurement contradicts these estimates so that a criterion cannot hold (for instance, the raised tier cannot find enough boundary candidates to use the extra budget), stop and surface it as a blocker; do not weaken the criterion.

## Inputs (read these in your own context)

- `AGENTS.md`, `docs/INTERFACE.md` (read "Testing a pure src/app module")
- `src/app/orbitPointBudgets.ts` (the committed stub) and `src/app/orbitPointBudgets.contract.test.cjs` (frozen)
- `src/app/orbit3d.ts`, read by range: the preset ceilings and `POINT_BUDGETS` (about 705-718), the boundary-detail constants (about 757-812), the stats interface (about 1018-1065), `applyLiveCloud` and `uploadPointBlock` (about 3933-4025), the draw's `detailStoredApart` branch (about 4240-4300), the show and hide distances (about 4445-4465), `pointBudgetFor` and `orbitCloudBuildPlan` (about 4624-4740), and the three `orbitCloudBuildPlan` call sites (about 2143, 2244, 2730)
- `src/app/orbitSampler.ts`: `MAX_SAMPLE_JOBS_PER_CALL` (about 1030), `buildGpuOrbitCloud` (about 1165), `sampleInBatches` (about 1590), the texture-size check in `createTargets` (about 726)
- `src/app/webglRenderer.ts` (about 1630-1800, where `data-orbit3d-*` attributes are written and cleared)
- `e2e/extreme-pool.spec.ts` (`buildInContext`, `buildInFreshContext`, the cost test), `e2e/harness/packedCells.ts` (`openPacked`, `cloudStats`, `cardioidPose`, `realAxisPose`, `dollyAt`, `median`), `e2e/harness/insideOut.ts` (`frozenParams`, `gpuSample`, `frameTiming`)
- `docs/audits/107-extreme-pool.md`: "Why the GPU frame doubled, and the fix", "Layout at `extreme` on both trees", "Cost at the desktop default", "Serving the baseline"
- `playwright.config.ts`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/app/orbitPointBudgets.ts`: implement the stub so the frozen block passes. `POINT_BUDGETS` here becomes the single source of the tier budgets; `orbit3d.ts` imports it and drops its own copy, including the `boundaryDetail: 16_000_000` entry.

2. `src/app/orbit3d.ts`: `orbitCloudBuildPlan` takes its boundary-detail budget from `gpuPointBudgetFor(pointBudget, boundaryDetailLevel)`, and the raised tier never holds more than `raisedTierPointCap(gpuPointBudget, lowerTierPoints)` points, where `lowerTierPoints` is what the lower tiers actually packed in this build. The cap is enforced where the raised tier is admitted (its candidate cap, its slots, or both: your call, stated in the audit), not by truncating after the fact. The hybrid path's call site follows the same plan. The upload split, the show and hide distances, the fade and the lower tiers are unchanged.

3. `src/app/orbitSampler.ts`: only what the larger raised tier needs. The raised sweep still batches at `MAX_SAMPLE_JOBS_PER_CALL` without raising it and without dropping jobs, and the texture-size check holds for each batch on this machine. If nothing needs to change here, say so in the audit with the lines you checked.

4. `src/app/webglRenderer.ts` and the stats interface: two new canvas attributes, `data-orbit3d-main-bound-bytes` and `data-orbit3d-detail-bound-bytes`, the byte sizes actually allocated to the main and the raised-tier attribute buffer sets (sums of the `bufferData` sizes, not points times 32), cleared where the other `data-orbit3d-*` attributes are cleared; and `data-orbit3d-detail-points`, the points the raised tier holds (0 when it is not stored apart).

5. `e2e/boundary-budget.spec.ts` (new): the tests criteria 2 to 7 name, using the `--grep` names given.

6. Repairs to earlier suites, only where criterion 1 needs them: an assertion in `e2e/packed-cells.spec.ts`, `e2e/refine-levels.spec.ts`, `e2e/tail-default.spec.ts` or `e2e/inside-out-cycling.spec.ts` that compares raised-tier or total point counts with the served baseline at `extreme` and boundary detail above 0 may be re-pointed to `ultra` or restated as the rule it checks, keeping every other assertion it makes. Nothing else in those files changes.

7. `docs/audits/108-boundary-detail-budget.md` (new): where and how the cap is enforced; a layout table at `extreme` on both trees at boundary detail 1 and Tail refinement 0.6, 0.3 and 0 (point budget, lower-tier points, raised-tier sub-cells, raised-tier points, total points, slots, main and detail bound bytes, build bytes, sampler bytes, build ms); whether the served baseline's raised tier crosses 12,500,000 points or 400,000,000 bytes at any of those settings; the cost table with the display-frame pacing each GPU frame time implies on this machine; each repair under Deliverable 6 with file, lines, test and why; each criterion's result with literal evidence paths under git-ignored `e2e/artifacts/boundary-budget/`; the authoring estimates against your measurement; a recommendation on whether 20M should stay the desktop default; unresolved limitations.

Supporting changes are allowed only where these deliverables need them: `e2e/harness/*.ts`.

## Constraints

- The frozen block in `src/app/orbitPointBudgets.contract.test.cjs` is not edited, and neither are the frozen blocks in `src/app/resolutionPreset.contract.test.cjs`, `src/app/paramPersistence.contract.test.cjs`, `src/app/orbitRefineLevels.contract.test.cjs`, `src/app/orbitPacking.contract.test.cjs`, `src/app/orbitHierarchy.contract.test.cjs` and `e2e/inside-out-cycling.contract.spec.ts`.
- The tier point budgets, the resolution pools, the refinement rule and its row budgets, the packed layout, the boundary-detail subdivision, warmup and point weight, the show and hide distances, the shader contract, colouring, the surface mesh, the camera, palettes, the tone map and every kernel default are unchanged.
- At boundary detail 0, every tier builds exactly what the served baseline builds. At `ultra`, a build whose baseline raised tier holds at most 12,500,000 points builds exactly what the baseline builds.
- No point draw ever binds more than `MAX_DRAW_BOUND_BYTES`. The point budget is never exceeded. CPU-side build arrays stay sized to the point budget, never to candidates times `sampleCount`.
- The CPU fallback has no raised tier and is unchanged.
- No expected value is fed into the production path that is meant to produce it.
- The public `SimKernel` contract in `docs/INTERFACE.md` and every other simulation are unchanged.
- `e2e/extreme-pool.spec.ts` compares the tree under test with a baseline built on the 1920 by 1920 pool, which the dispatch base no longer has. Do not run it as a regression suite and do not edit it.
- Run every command in the foreground and wait for it to exit. Never use `run_in_background`, `&`, `nohup` or a monitor, and never end a turn while a command is outstanding; the baseline and current servers run in detached tmux sessions as the audit 107 recipe shows. Keep context lean: read large files by range and do not dump full logs. Write the dispatch envelope as the final action; a partial result with an envelope is better than none.
- Browser checks run headless by default with the repo's GPU flags; go headed only for criterion 4's display-link interval, and batch those into one launch. Use port 5173 for the tree under test and 5174 for the served baseline (`--strictPort`).
- No new packages, no commits by the worker, no queue mutations, no deployment.

## Acceptance criteria

The Sol verifier runs every command independently in the run worktree and judges all rows. A changing attribute or a green build alone cannot satisfy a rendered criterion. No required suite may pass with zero collected tests. Where a criterion names the served baseline, the unchanged tree is the dispatch base (`dev` as cut), served on port 5174 by the audit 107 recipe; a missing baseline fails that criterion.

1. **Regression and frozen contracts.** `npm run verify`; `scripts/check-contract-test-gate.sh --worktree` exits 0; `npm run build:test && POINT_BUDGETS=1 node --test src/app/orbitPointBudgets.contract.test.cjs` (5 pass, 0 fail, 0 skipped); `EXTREME_POOL=1 node --test src/app/resolutionPreset.contract.test.cjs` (3 pass); `PARAM_PERSISTENCE=1 node --test src/app/paramPersistence.contract.test.cjs` (6 pass); `ORBIT_LEVELS=1 node --test src/app/orbitRefineLevels.contract.test.cjs` (6 pass); `ORBIT_PACKING=1 node --test src/app/orbitPacking.contract.test.cjs` (7 pass); `ORBIT_HIERARCHY=1 node --test src/app/orbitHierarchy.contract.test.cjs` (4 pass); `INSIDE_OUT_CYCLING=1 npx playwright test e2e/inside-out-cycling.contract.spec.ts --workers=1` (4 pass); `npx playwright test e2e/smoke.spec.ts --grep 'logistic-Mandelbrot|Logistic Mandelbrot|cyclic Magma|orbit camera' --workers=1`; and with the baseline served: `npx playwright test e2e/packed-cells.spec.ts --workers=1`, `npx playwright test e2e/refine-levels.spec.ts --workers=1`, `npx playwright test e2e/tail-default.spec.ts --workers=1`, and `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'spread|chaotic|controls and cache|hierarchy' --workers=1`. Before implementing, run the `POINT_BUDGETS=1` command on the unchanged tree and keep its result (5 tests, 1 pass, 4 fail) as the red baseline. The verifier checks that every Deliverable 6 repair is listed in the audit and is of the kind Deliverable 6 permits.

2. **The budget and the cap.** `npx playwright test e2e/boundary-budget.spec.ts --grep 'budget' --workers=1`, GPU path, camera pinned at the opening pose, `extreme`, on both trees: at boundary detail 1 and Tail refinement 0.6, `data-orbit3d-point-budget` reads 20,000,000 on the tree under test and 16,000,000 on the baseline, and `data-orbit3d-detail-points` on the tree under test is at least 1.45 times the baseline's (the baseline read 7,002,192 on card 107); at boundary detail 1 and Tail refinement 0.6, 0.3 and 0, on the tree under test, `data-orbit3d-detail-points` is at most 12,500,000, `data-orbit3d-detail-bound-bytes` and `data-orbit3d-main-bound-bytes` are each at most 400,000,000, and `data-orbit3d-points` never exceeds `data-orbit3d-point-budget`; at boundary detail 0 and Tail refinement 0.6, `data-orbit3d-points`, `-slots`, `-base-cells` and `-refined-sub-cells` equal the baseline's exactly. At `ultra`, boundary detail 1 and Tail refinement 0.6, `data-orbit3d-point-budget` reads 16,000,000 on both trees, and either the counts above equal the baseline's exactly, or the baseline's raised tier held more than 12,500,000 points and the tree under test's holds exactly the cap's value (record which).

3. **Boundary detail keeps its gating.** `--grep 'gating'`, GPU `extreme`, boundary detail 1, Tail refinement 0.6: `data-orbit3d-boundary-detail` is `active`; at the opening pose `data-orbit3d-boundary-detail-opacity` reads 0 and the frame's mean absolute per-channel 8-bit difference from the same tree at boundary detail 0 (same `frozenParams`, same pose) is at most 1.0; after dollying inside the show distance (card 104's real-axis pose via `realAxisPose`), the opacity reaches 1.

4. **Cost.** `--grep 'cost'`, GPU `extreme`, boundary detail 1, Tail refinement 0.6, with card 103's timing helper, three matched samples each on both trees: at the opening pose, the GPU frame time (where `EXT_disjoint_timer_query_webgl2` is available) is within 5% of the baseline's median; cloud build wall-clock to `data-orbit3d-build="complete"` at most 1.6 times the baseline's median; `data-orbit3d-build-bytes` at most 1.5 times; `data-orbit3d-sampler-bytes` at most 1.5 times. At card 104's real-axis pose (tier shown) and at a second pose with the tier shown and the whole cardioid in frame (camera distance between 2.0 and 2.8, chosen and recorded by you), the GPU frame time is at most 1.5 times the baseline's median at the same pose. The headed display-link `requestAnimationFrame` interval is recorded at all three poses on both trees, no bar. The audit states the absolute values and whether each GPU frame time crosses a 16.7 ms display frame on this machine.

5. **The CPU fallback and the prebaked path are unchanged.** `--grep 'unchanged'`: with `?orbit3dSampler=cpu`, `balanced`, no `tailRefinement` key, boundary detail 1, camera pinned, `data-orbit3d-point-budget`, `-points`, `-slots` and `-refine-row-budget` equal the baseline's exactly and `data-orbit3d-detail-points` is 0. Bake `public/baked/lm-tiny.elpc` in the run worktree with `npm run build:test && node scripts/bake-orbit3d.mjs --points 2e5 --warmup 2000 --samples 8 --out public/baked/lm-tiny.elpc`; selected through Model source it reads `data-orbit3d-sampler="prebaked"` and `data-orbit3d-points` equal to the bake's cell count times 8 at Plotted iterations 8, the same as on the served baseline.

6. **The hybrid path builds.** `--grep 'hybrid'`, GPU `extreme`, Geometry `hybrid`, boundary detail 1, Tail refinement 0.6: the build completes, `data-orbit3d-points` does not exceed `data-orbit3d-point-budget`, and no point draw binds more than 400,000,000 bytes by the new attributes. Record its counts beside the baseline's.

7. **Evidence for the operator.** `--grep 'evidence'` saves under `e2e/artifacts/boundary-budget/` screenshots at the two tier-shown poses of criterion 4 at the shipped defaults on both trees. The verifier opens them and records, with literal paths, whether the boundary regions are visibly denser on the tree under test and whether either tree shows gaps, and quotes criterion 4's GPU frame times beside them. Whether the result looks good is the operator's judgement and is not a criterion.

Run the whole new spec once as well: `npx playwright test e2e/boundary-budget.spec.ts --workers=1`.

## Contract test

- **Test file:** src/app/orbitPointBudgets.contract.test.cjs
- **Assertions digest:** `sha256:b3a2247b5379ee3c0f6e07698c224fb15b9015378a36dfa7ee0e85dd9cc9aec1`

The frozen block fixes the budgets, the 20M ceiling at `extreme` only, the interpolation by boundary detail level, the 400 MB per-draw ceiling and the raised-tier cap. It does not cover the planner wiring, the admission, the attributes, the suites or the measurements; criteria 2 to 7 remain mandatory.

## Authoring verification

On dev at `a3e1c198b`, 2026-10-09, with the stub, the frozen test and the `tsconfig.test.json` entry in the working tree: `npm run build:test` passes; `POINT_BUDGETS=1 node --test src/app/orbitPointBudgets.contract.test.cjs` runs 5 tests, 1 pass, 4 fail (each failing helper throws "card 108: ... is not implemented"); without `POINT_BUDGETS` all 5 skip. The expected values in the frozen block were checked under IEEE doubles with `Math.floor(p + (c - p) * clamp(level, 0, 1))`. A live load of the default on this machine read `gpu-sampled`, boundary detail `active`, point budget 16,000,000 and 15,348,680 points. The estimates in the Objective scale card 107's measured layout at 32 bytes a point.

## Out of scope

- The tier point budgets, the resolution pools, a third refinement level, the refinement rule and every kernel default.
- The tablet and phone caps in `qualityProfiles.ts`.
- The CPU fallback's budget, the baker, the bake format.
- Colouring, the surface mesh, the camera, palettes, other simulations, public interface changes, release or deployment.

## Budget

- **Worker wall-clock:** 420 minutes
- **Verifier wall-clock:** 240 minutes
- Planning evidence: card 107's Fable worker and Sol verifier on a similar-sized brief over two attempts; card 104's Fable worker spent 11.0M tokens, and the Sol verifiers on 103 to 105 spent 2.5M to 6.9M. Plan 12M for the worker and 6M for the verifier. Serial.
- Stop with an explicit partial result if the remaining checks cannot be covered. A retry needs a re-brief.

## Verification

Verifier writes the schema-valid `state/verifiers/108-logistic-mandelbrot-boundary-detail-budget.json` with one result and literal evidence paths per numbered criterion. Overall PASS requires all seven.

## Family-specific notes

Both roles use the repo's subscription CLI routes; do not change auth routing to work around a refusal or a browser failure. Headless Chromium needs the repo's existing GPU flags for WebGL2 (`playwright.config.ts`); `Requires GUI: true` widens the codex seat so it can launch the browser. The Claude worker runs browser checks headless through Playwright with the same config and needs no widening.
