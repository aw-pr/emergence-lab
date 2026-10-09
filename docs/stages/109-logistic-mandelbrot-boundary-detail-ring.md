# Stage card 109-logistic-mandelbrot-boundary-detail-ring: widen the raised tier's escape-edge ring at extreme so the 20M boundary-detail ceiling has candidates to spend

## Metadata

- **Authored:** 2026-10-09
- **Orchestrator:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/109-logistic-mandelbrot-boundary-detail-ring
- **Worker effort:** xhigh
- **Verifier effort:** max
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Supersedes:** 108-logistic-mandelbrot-boundary-detail-budget
- **Pairing rationale:** card 108's worker built the 20M ceiling, the raised-tier cap and the byte diagnostics, then stopped on the card's own blocker: the raised tier ran out of candidates. This card keeps that work and adds one bounded rule change in the candidate selection, so it stays with the Sol worker that knows the code, on the subscription CLI route. Fable is out on quota and Astra is not seated for an unattended run. Opus 5.5 verifies across the family boundary on the Claude subscription, with the browser evidence in hand. `Requires GUI` widens the codex worker seat so it can launch Playwright.

## Objective

Card 108 raised the boundary-detail ceiling at `extreme` from 16,000,000 to 20,000,000 points and capped the raised tier at `MAX_DRAW_BOUND_BYTES` (400,000,000 bytes, 12,500,000 points). Its worker measured at the desktop default (`extreme`, boundary detail 1, Tail refinement 0.6) that the 20M plan permits 176,694 raised-tier candidates, but the candidate rule finds only 81,380 eligible parents, which the 16M plan already admitted. Both trees therefore held 7,002,192 raised points and the density ratio was 1.000 against the required 1.45 (`docs/audits/108-boundary-detail-budget.md`, `e2e/artifacts/boundary-budget/blocker.json` on the preserved attempt).

Today a base cell is a raised-tier candidate when it is a cascade tail (`isRefineCandidate(period, 1)`) or lies on the escape edge (`isEscapeEdgeCell`, `src/app/orbitSampler.ts` about 1626: an 8-neighbour of a cell with the other escape state, on either side). That edge is one cell wide. This card widens it at `extreme` only:

1. **Restore card 108's implementation** from the preserved commit `23f5e8ae8` (`wip/108-logistic-mandelbrot-boundary-detail-budget-attempt-1`) as the starting point, and finish its unfinished criteria.
2. **A ring of R cells at `extreme`.** A base cell is in ring k when its Chebyshev distance (8-neighbour steps) to the nearest base cell of the other escape state is k, on either side of the edge; ring 1 is exactly today's `isEscapeEdgeCell`. At `extreme` the raised tier's candidates become the tails plus rings 1 to R; at every other tier R is 1 and the rule is exactly today's. R is one constant, chosen by you as the smallest integer from 2 to 6 for which criterion 2's density ratio holds, and recorded with the measurement that chose it.
3. **Priority admission.** Today's candidates (tails and ring 1, the "core") are admitted first, in the existing reservoir order; ring cells 2 to R fill only the candidate slots the core leaves, nearer rings first, in a deterministic order within each ring. A ring cell never displaces a core candidate. When the core alone exceeds the candidate cap, the build is exactly today's.

Estimate (derived, not measured): about 118,000 candidates at about 86 raised points each reach the 1.45 ratio (about 10.15M raised points); the 20M plan leaves about 11.6M for the raised tier and the cap allows 12.5M, so admission should not bind at the default. Ring cells inside smooth bulbs have low periods and carry few distinct rows, and ring cells on the escaped side mostly escape, so R may need to be 3 or more. If no R up to 6 reaches the ratio, stop and surface it as a blocker with the per-ring counts; do not widen the rule further, change the tail threshold, or weaken the criterion.

The audit recommends whether the 20M ceiling and ring R should stay the desktop default, and the operator decides. A PASS lands on `dev`, not on `main`, the labs deployment or the public mirror.

## Inputs (read these in your own context)

- `AGENTS.md`, `docs/INTERFACE.md` (read "Testing a pure src/app module")
- `docs/stages/108-logistic-mandelbrot-boundary-detail-budget.md` (the superseded card: its deliverables 1 to 4, constraints and criteria carry into this card as restated below)
- The preserved commit: `git show --stat 23f5e8ae8`, and `docs/audits/108-boundary-detail-budget.md` from it
- `src/app/orbitPointBudgets.ts` and `src/app/orbitPointBudgets.contract.test.cjs` (frozen)
- `src/app/orbitSampler.ts`: the candidate pass in `buildGpuOrbitCloud` (about 1237-1266), `refineTier` (about 1269), the raised-tier admission (about 1413), `isEscapeEdgeCell` (about 1626), `boundaryDistanceField` and `reservoirSlot` (about 1649-1700)
- `src/app/orbit3d.ts`, read by range: `orbitCloudBuildPlan` and the boundary-detail candidate cap (about 4624-4740 on dev), the stats interface (about 1018-1065), the three `orbitCloudBuildPlan` call sites
- `src/app/webglRenderer.ts` (about 1630-1800, where `data-orbit3d-*` attributes are written and cleared)
- `e2e/boundary-budget.spec.ts` from the preserved commit, `e2e/harness/packedCells.ts`, `e2e/harness/insideOut.ts`
- `docs/audits/107-extreme-pool.md`: "Serving the baseline"
- `playwright.config.ts`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

0. **Restore.** First action: `git checkout 23f5e8ae8 -- src/app/orbitPointBudgets.ts src/app/orbit3d.ts src/app/orbitSampler.ts src/app/webglRenderer.ts e2e/boundary-budget.spec.ts e2e/harness/packedCells.ts`, then `git reset -q`, so the files are uncommitted changes on the run branch. Do not restore `docs/audits/108-boundary-detail-budget.md`; your audit is a new file.

1. `src/app/orbitPointBudgets.ts`: as restored (the frozen block passes on it). Add nothing here unless the ring constant belongs beside the budgets; if it does, keep the frozen helpers' behaviour unchanged.

2. `src/app/orbitSampler.ts`: the ring rule and the priority admission of the Objective, items 2 and 3. Ring distances come from one pass over the escape mask per build (a Chebyshev distance transform, or `isEscapeEdgeCell` generalised to radius R; your call, stated in the audit), never per candidate. Memory for it is one byte or one 16-bit value per base cell. The raised tier's cap from card 108 still applies after admission. The batching at `MAX_SAMPLE_JOBS_PER_CALL` and the per-batch texture-size check are unchanged.

3. `src/app/orbit3d.ts`: R reaches the sampler through the build plan; R is 1 unless the tier is `extreme` and boundary detail is above 0. The hybrid path's call site follows the same plan. Card 108's planner and upload changes stay as restored.

4. `src/app/webglRenderer.ts` and the stats interface: card 108's three attributes (`data-orbit3d-main-bound-bytes`, `data-orbit3d-detail-bound-bytes`, `data-orbit3d-detail-points`), plus `data-orbit3d-detail-ring` (R in effect, 0 when the raised tier is off), `data-orbit3d-detail-core-candidates` (core candidates seen), `data-orbit3d-detail-ring-candidates` (ring 2 to R candidates seen) and `data-orbit3d-detail-candidates-admitted` (candidates admitted to subdivision), each cleared where the other `data-orbit3d-*` attributes are cleared.

5. `e2e/boundary-budget.spec.ts`: as restored, completed so the tests criteria 2 to 7 name exist under the `--grep` names given.

6. Repairs to earlier suites, only where criterion 1 needs them, exactly as card 108's deliverable 6 permits: an assertion in `e2e/packed-cells.spec.ts`, `e2e/refine-levels.spec.ts`, `e2e/tail-default.spec.ts` or `e2e/inside-out-cycling.spec.ts` that compares raised-tier or total point counts with the served baseline at `extreme` and boundary detail above 0 may be re-pointed to `ultra` or restated as the rule it checks, keeping every other assertion it makes. Nothing else in those files changes.

7. `docs/audits/109-boundary-detail-ring.md` (new): how ring distances are computed and where admission enforces the priority; a per-ring table at the desktop default (for k = 1 to 6: cells in ring k, of them bounded, and raised points the ring contributes when admitted), and the R chosen with the measurement that chose it; a layout table at `extreme` on both trees at boundary detail 1 and Tail refinement 0.6, 0.3 and 0 (point budget, ring R, core and ring candidates, candidates admitted, lower-tier points, raised-tier sub-cells, raised-tier points, total points, slots, main and detail bound bytes, build bytes, sampler bytes, build ms); whether the served baseline's raised tier crosses 12,500,000 points or 400,000,000 bytes at any of those settings; the cost table with the display-frame pacing each GPU frame time implies on this machine; each repair under deliverable 6 with file, lines, test and why; each criterion's result with literal evidence paths under git-ignored `e2e/artifacts/boundary-ring/`; the authoring estimates against your measurement; a recommendation on whether the 20M ceiling with ring R should stay the desktop default; unresolved limitations.

Supporting changes are allowed only where these deliverables need them: `e2e/harness/*.ts`.

## Constraints

- The frozen block in `src/app/orbitPointBudgets.contract.test.cjs` is not edited, and neither are the frozen blocks in `src/app/resolutionPreset.contract.test.cjs`, `src/app/paramPersistence.contract.test.cjs`, `src/app/orbitRefineLevels.contract.test.cjs`, `src/app/orbitPacking.contract.test.cjs`, `src/app/orbitHierarchy.contract.test.cjs` and `e2e/inside-out-cycling.contract.spec.ts`.
- The tier point budgets (apart from card 108's 20M ceiling at `extreme`), the resolution pools, the level-1 and level-2 refinement rule and their row budgets, the tail threshold, the packed layout, the boundary-detail subdivision, warmup and point weight, the show and hide distances, the shader contract, colouring, the surface mesh, the camera, palettes, the tone map and every kernel default are unchanged.
- At boundary detail 0, every tier builds exactly what the served baseline builds. At every tier other than `extreme`, a build whose baseline raised tier holds at most 12,500,000 points builds exactly what the baseline builds.
- No point draw ever binds more than `MAX_DRAW_BOUND_BYTES`. The point budget is never exceeded. CPU-side build arrays stay sized to the point budget, never to candidates times `sampleCount`.
- The CPU fallback has no raised tier and is unchanged.
- No expected value is fed into the production path that is meant to produce it; R is a constant, not tuned at run time toward the ratio.
- The public `SimKernel` contract in `docs/INTERFACE.md` and every other simulation are unchanged.
- `e2e/extreme-pool.spec.ts` compares against a pool the dispatch base no longer has. Do not run it as a regression suite and do not edit it.
- Run every command in the foreground and wait for it to exit. Never use `run_in_background`, `&`, `nohup` or a monitor, and never end a turn while a command is outstanding; the baseline and current servers run in detached tmux sessions as the audit 107 recipe shows. Keep context lean: read large files by range and do not dump full logs. Write the dispatch envelope as the final action; a partial result with an envelope is better than none.
- Browser checks run headless by default with the repo's GPU flags; go headed only for criterion 4's display-link interval, and batch those into one launch. Use port 5173 for the tree under test and 5174 for the served baseline (`--strictPort`).
- No new packages, no commits by the worker, no queue mutations, no deployment.

## Acceptance criteria

The verifier runs every command independently in the run worktree and judges all rows. A changing attribute or a green build alone cannot satisfy a rendered criterion. No required suite may pass with zero collected tests. Where a criterion names the served baseline, the unchanged tree is the dispatch base (`dev` as cut), served on port 5174 by the audit 107 recipe; a missing baseline fails that criterion.

1. **Regression and frozen contracts.** `npm run verify`; `scripts/check-contract-test-gate.sh --worktree` exits 0; `npm run build:test && POINT_BUDGETS=1 node --test src/app/orbitPointBudgets.contract.test.cjs` (5 pass, 0 fail, 0 skipped); `EXTREME_POOL=1 node --test src/app/resolutionPreset.contract.test.cjs` (3 pass); `PARAM_PERSISTENCE=1 node --test src/app/paramPersistence.contract.test.cjs` (6 pass); `ORBIT_LEVELS=1 node --test src/app/orbitRefineLevels.contract.test.cjs` (6 pass); `ORBIT_PACKING=1 node --test src/app/orbitPacking.contract.test.cjs` (7 pass); `ORBIT_HIERARCHY=1 node --test src/app/orbitHierarchy.contract.test.cjs` (4 pass); `INSIDE_OUT_CYCLING=1 npx playwright test e2e/inside-out-cycling.contract.spec.ts --workers=1` (4 pass); `npx playwright test e2e/smoke.spec.ts --grep 'logistic-Mandelbrot|Logistic Mandelbrot|cyclic Magma|orbit camera' --workers=1`; and with the baseline served: `npx playwright test e2e/packed-cells.spec.ts --workers=1`, `npx playwright test e2e/refine-levels.spec.ts --workers=1`, `npx playwright test e2e/tail-default.spec.ts --workers=1`, and `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'spread|chaotic|controls and cache|hierarchy' --workers=1`. The verifier checks that every deliverable 6 repair is listed in the audit and is of the kind deliverable 6 permits.

2. **The budget, the ring and the cap.** `npx playwright test e2e/boundary-budget.spec.ts --grep 'budget' --workers=1`, GPU path, camera pinned at the opening pose, `extreme`, on both trees: at boundary detail 1 and Tail refinement 0.6, `data-orbit3d-point-budget` reads 20,000,000 on the tree under test and 16,000,000 on the baseline; `data-orbit3d-detail-ring` reads R (at least 2) on the tree under test; every core candidate is admitted (`data-orbit3d-detail-candidates-admitted` is at least `data-orbit3d-detail-core-candidates`, and the core count is recorded beside the 81,380 card 108's attempt measured); `data-orbit3d-refined-detail-sub-cells` on the tree under test is at least the baseline's (the baseline exposes this attribute; it shows no core cell was displaced); and `data-orbit3d-detail-points` on the tree under test is at least 1.45 times the baseline's. At boundary detail 1 and Tail refinement 0.6, 0.3 and 0, on the tree under test, `data-orbit3d-detail-points` is at most 12,500,000, `data-orbit3d-detail-bound-bytes` and `data-orbit3d-main-bound-bytes` are each at most 400,000,000, and `data-orbit3d-points` never exceeds `data-orbit3d-point-budget`. At boundary detail 0 and Tail refinement 0.6, `data-orbit3d-points`, `-slots`, `-base-cells` and `-refined-sub-cells` equal the baseline's exactly. At `ultra`, boundary detail 1 and Tail refinement 0.6, `data-orbit3d-point-budget` reads 16,000,000 on both trees, `data-orbit3d-detail-ring` reads 1, and either `data-orbit3d-points`, `-slots`, `-base-cells` and `-refined-sub-cells` equal the baseline's exactly, or the baseline's raised tier held more than 12,500,000 points and the tree under test's holds exactly the cap's value (record which).

3. **Boundary detail keeps its gating.** `--grep 'gating'`, GPU `extreme`, boundary detail 1, Tail refinement 0.6: `data-orbit3d-boundary-detail` is `active`; at the opening pose `data-orbit3d-boundary-detail-opacity` reads 0 and the frame's mean absolute per-channel 8-bit difference from the same tree at boundary detail 0 (same `frozenParams`, same pose) is at most 1.0; after dollying inside the show distance (card 104's real-axis pose via `realAxisPose`), the opacity reaches 1.

4. **Cost.** `--grep 'cost'`, GPU `extreme`, boundary detail 1, Tail refinement 0.6, with card 103's timing helper, three matched samples each on both trees: at the opening pose, the GPU frame time (where `EXT_disjoint_timer_query_webgl2` is available) is within 5% of the baseline's median; cloud build wall-clock to `data-orbit3d-build="complete"` at most 1.6 times the baseline's median; `data-orbit3d-build-bytes` at most 1.5 times; `data-orbit3d-sampler-bytes` at most 1.5 times. At card 104's real-axis pose (tier shown) and at a second pose with the tier shown and the whole cardioid in frame (camera distance between 2.0 and 2.8, chosen and recorded by you), the GPU frame time is at most 1.5 times the baseline's median at the same pose. The headed display-link `requestAnimationFrame` interval is recorded at all three poses on both trees, no bar. The audit states the absolute values and whether each GPU frame time crosses a 16.7 ms display frame on this machine.

5. **The CPU fallback and the prebaked path are unchanged.** `--grep 'unchanged'`: with `?orbit3dSampler=cpu`, `balanced`, no `tailRefinement` key, boundary detail 1, camera pinned, `data-orbit3d-point-budget`, `-points`, `-slots` and `-refine-row-budget` equal the baseline's exactly and `data-orbit3d-detail-points` is 0. Bake `public/baked/lm-tiny.elpc` in the run worktree with `npm run build:test && node scripts/bake-orbit3d.mjs --points 2e5 --warmup 2000 --samples 8 --out public/baked/lm-tiny.elpc`; selected through Model source it reads `data-orbit3d-sampler="prebaked"` and `data-orbit3d-points` equal to the bake's cell count times 8 at Plotted iterations 8, the same as on the served baseline.

6. **The hybrid path builds.** `--grep 'hybrid'`, GPU `extreme`, Geometry `hybrid`, boundary detail 1, Tail refinement 0.6: the build completes, `data-orbit3d-points` does not exceed `data-orbit3d-point-budget`, and no point draw binds more than 400,000,000 bytes by the new attributes. Record its counts beside the baseline's.

7. **Evidence for the operator.** `--grep 'evidence'` saves under `e2e/artifacts/boundary-ring/` screenshots at the two tier-shown poses of criterion 4 at the shipped defaults on both trees. The verifier opens them and records, with literal paths, whether the boundary regions are visibly denser or wider on the tree under test, whether either tree shows gaps, and whether the widened ring reads as a visible halo or step at its outer edge, and quotes criterion 4's GPU frame times beside them. Whether the result looks good is the operator's judgement and is not a criterion.

Run the whole new spec once as well: `npx playwright test e2e/boundary-budget.spec.ts --workers=1`.

## Contract test

- **Test file:** src/app/orbitPointBudgets.contract.test.cjs
- **Assertions digest:** `sha256:b3a2247b5379ee3c0f6e07698c224fb15b9015378a36dfa7ee0e85dd9cc9aec1`

Card 108's frozen block, unchanged: the budgets, the 20M ceiling at `extreme` only, the interpolation by boundary detail level, the 400 MB per-draw ceiling and the raised-tier cap. It passes on the preserved implementation. It does not cover the ring, the admission order, the attributes, the suites or the measurements; criteria 2 to 7 remain mandatory.

## Authoring verification

On dev at `07cc5cca8`, 2026-10-09: the preserved commit `23f5e8ae8` holds card 108's implementation of the four helpers, the planner wiring (`gpuPointBudget` through `orbitCloudBuildPlan` and both GPU call sites), the raised-tier slot cap from `raisedTierPointCap` in `buildGpuOrbitCloud`, the three byte and point attributes, and a partial `e2e/boundary-budget.spec.ts` (537 lines). Its worker reported the frozen block at 5/5 and the contract gate passing. The candidate pass reviewed for this card is `src/app/orbitSampler.ts` 1237-1266 on dev: core candidates are tails or `isEscapeEdgeCell`, reservoir-capped by `boundaryDetailCandidateCap`. The estimates in the Objective scale card 108's measured 7,002,192 raised points over 81,380 candidates; no ring count was measured in authoring.

## Out of scope

- A third refinement level, the level-1 and level-2 refinement rule and the tail threshold, and every kernel default.
- A ring wider than 1 at any tier other than `extreme`.
- The tablet and phone caps in `qualityProfiles.ts`.
- The CPU fallback's budget, the baker, the bake format.
- Colouring, the surface mesh, the camera, palettes, other simulations, public interface changes, release or deployment.

## Budget

- **Worker wall-clock:** 420 minutes
- **Verifier wall-clock:** 240 minutes
- Planning evidence: card 108's Sol worker spent about 7.0M tokens reaching its blocker; card 106's spent about 18.6M (about 98% cached); the Claude verifiers on 103 to 107 spent up to 6.9M. Plan 15M for the worker and 6M for the verifier. Serial.
- Stop with an explicit partial result if the remaining checks cannot be covered. A retry needs a re-brief.

## Verification

Verifier writes the schema-valid `state/verifiers/109-logistic-mandelbrot-boundary-detail-ring.json` with one result and literal evidence paths per numbered criterion. Overall PASS requires all seven.

## Family-specific notes

Both roles use the repo's subscription CLI routes; do not change auth routing to work around a refusal or a browser failure. Headless Chromium needs the repo's existing GPU flags for WebGL2 (`playwright.config.ts`); `Requires GUI: true` widens the codex worker seat so it can launch the browser. The Claude verifier runs browser checks headless through Playwright with the same config and needs no widening. Codex worker: run every command in the foreground and write the envelope as your final action.

## Re-brief 1 (2026-10-09, operator decision after attempt 1)

Attempt 1 stopped correctly on the ring-sweep stop condition and is preserved at `e754c8297d041658c183162efd5f673c21a5c02b` (`wip/109-logistic-mandelbrot-boundary-detail-ring-attempt-1`). Its sweep (`docs/audits/109-boundary-detail-ring.md`, "Ring sweep at the desktop default") measured raised-point ratios of 1.0984, 1.1942, 1.2991, 1.3017 and 1.3017 at R = 2 to 6: from R = 5 the 176,694-candidate cap is full and outer rings add about 22 points per candidate. The 1.45 bar was an authoring estimate, not a product requirement. The operator has accepted about 1.3 and wants the card finished so the result can be seen. These amendments override the card text where they conflict:

1. **Restore from attempt 1, not card 108.** Deliverable 0 becomes: `git checkout e754c8297 -- src/app/orbitPointBudgets.ts src/app/orbit3d.ts src/app/orbitSampler.ts src/app/webglRenderer.ts e2e/boundary-budget.spec.ts e2e/harness/packedCells.ts docs/audits/109-boundary-detail-ring.md`, then `git reset -q`. Revise the restored audit in place rather than starting a new one; keep its ring-sweep table as measured.
2. **R is fixed at 4.** Objective item 2's "smallest integer from 2 to 6" rule and its stop condition are withdrawn. R is the constant 4 at `extreme` with boundary detail above 0, and 1 everywhere else. Do not re-run the R = 2 to 6 sweep; cite attempt 1's table as the evidence for the choice.
3. **Criterion 2's density bar is 1.25, not 1.45.** At `extreme`, boundary detail 1 and Tail refinement 0.6, `data-orbit3d-detail-points` on the tree under test is at least 1.25 times the baseline's, and `data-orbit3d-detail-ring` reads 4. Every other clause of criterion 2 is unchanged.
4. **Criteria 1 and 3 to 7 are now mandatory** and were not run on attempt 1; run all of them, and the whole new spec once, as the card states. Evidence goes under `e2e/artifacts/boundary-ring/`.
5. The audit's recommendation section must state, from criterion 4's frame times and criterion 7's screenshots, whether the 20M ceiling with R = 4 is worth keeping as the desktop default, given a raised-point gain of about 30% rather than the 45% first planned.

Verifier effort is raised to `max` for the judgement in criteria 4 and 7. Nothing else in the card changes.
