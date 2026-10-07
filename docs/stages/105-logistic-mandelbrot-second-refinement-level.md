# Stage card 105-logistic-mandelbrot-second-refinement-level: refine the cascade tails a second time, and let Tail refinement set the budget it spends

## Metadata

- **Authored:** 2026-10-07
- **Orchestrator:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Worker:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/105-logistic-mandelbrot-second-refinement-level
- **Worker effort:** xhigh
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** the change threads a new tier through both live builders, the planner, the boundary-detail gating and the hybrid parity block of a 4,400-line renderer that the same worker tier rewired in cards 103 and 104; that is an open-ended numerical and rendering brief for the strongest Anthropic tier. Sol verifies across the family boundary, literally and with the browser evidence in hand, as it did for 103 and 104 (`Requires GUI` widens the codex seat for Playwright). A Codex worker is not used: on card 104, Astra spent about 90% of a Codex five-hour window per fifteen minutes of work.

## Objective

Card 103 packed each cell's distinct points, which freed most of the point budget, and its audit found that the freed budget buys nothing: the live builders refine one level only, every level-1 tail fits at any Tail refinement setting above 0, and the slider changes nothing (`docs/audits/103-packed-cells.md`, "Layout by preset and setting" and "Boundary detail: refinement capacity"). The offline baker has always refined twice (`scripts/bake-orbit3d.mjs`, "refine L1" and "refine L2").

Add a second refinement level to both live builders, CPU and GPU: every level-1 sub-cell that is still a tail (period 0 or at least 16) is sampled again on a 3 by 3 sub-grid of its own, from its own coordinates. And make the slider govern the spend: refinement gets `refinementRowBudget(pointBudget, tailRefinement)` rows, level 1 first, level 2 the remainder, instead of every row the base tier leaves. After this card, raising Tail refinement from 0.3 to 0.6 measurably adds cascade-tail detail at `extreme` and `ultra`, the base grid and the plane are unchanged, and the shipped defaults render exactly as before.

Why the budget rule must change as well, measured at authoring (2026-10-07) with `sampleAttractorCell` over a 480 by 480 sweep of the sampler domain at 8 samples, warmup 1500 (base) and 2000 (refinement), scaled by 16 to the 1920 by 1920 `extreme` pool: bounded cells 926,976 (audit 103 measured 927,497), base rows 1.44M (audit 103: 1,446,432), level-1 demand 211,872 surviving sub-cells and 1.47M rows (audit 103 measured 244,790 sub-cells), level-2 demand 690,944 surviving sub-cells and 5.39M rows. The current rule grants refinement the 8.16M rows the base tier leaves at `extreme` (9.6M budget), which holds both levels whole at every setting, so a second level alone would leave the slider inert. Under the new rule, `extreme` grants 2.88M rows at 0.3 and 5.76M at 0.6, and `ultra` (4.8M budget, about 0.44 of `extreme`'s demand) 1.44M and 2.88M: level 2 is capacity-bound at both settings on both presets. These figures are derived estimates, not audit citations. If your measurement contradicts them so that criterion 2 cannot hold, stop and surface it as a blocker; do not weaken the criterion.

## Inputs (read these in your own context)

- `AGENTS.md`, `docs/INTERFACE.md` (read "Testing a pure src/app module")
- `src/app/orbitRefineLevels.ts` (the stub this card implements), `src/app/orbitRefineLevels.contract.test.cjs` (frozen)
- `src/app/orbitPacking.ts` (`SlotPacker`, `admissionOrder`, `distinctPointCount`), `src/app/orbitRefinement.ts` (`resolveOrbitRefinement`, `REFINE_BUDGET_FRACTION`)
- `docs/audits/103-packed-cells.md`: "Layout by preset and setting", "Boundary detail: refinement capacity", "Plane coverage", "Cost"
- `src/app/orbit3d.ts`, read by range; the file is about 4,400 lines: the refinement constants (about 700-750: `POINT_BUDGETS`, `REFINE_PERIOD_THRESHOLD`, `REFINE_SUBDIVISION`, `REFINE_POINT_WEIGHT`, the admission seeds), the CPU build's refinement pass (about 2120-2373, sub-cell coordinates at about 2262-2274), `applyLiveCloud` and the stats (about 3630), the boundary-detail gating (about 3864-3917, 4046-4075), `orbitCloudBuildPlan` (about 4237-4345, `candidateCapFor` at about 4289), the `Orbit3DStats` interface (about 1011-1023)
- `src/app/orbitSampler.ts`: `buildGpuOrbitCloud` (about 1079-1385), the `refineTier` closure (about 1184-1246), the baseline and raised tiers (about 1248-1274), `writeTier` (about 1293-1348), `sampleInBatches` (about 1391-1408), `isEscapeEdgeCell` and `reservoirSlot` (about 1427-1500)
- `src/app/webglRenderer.ts`: the orbit3d dataset attributes and diagnostic canvas hooks (about 1270-1290, 1620-1780), the rebuild key (about 3144)
- `src/sims/logistic-mandelbrot/kernel.ts`: the `tailRefinement` and `boundaryDetail` descriptors (about 165-190)
- `scripts/bake-orbit3d.mjs` (about 51-59, 200-216, 270-365): the baker's two levels, for reference only; do not edit it
- `e2e/packed-cells.spec.ts` and `e2e/harness/packedCells.ts` (the 103 suite: its pose, luma threshold and rectangles), `e2e/harness/insideOut.ts` (`openSim`, `gpuSample`), `e2e/inside-out-cycling.spec.ts` (the evidence pose method at c = -1.36 in card 104's tests)
- `docs/audits/100-inside-out-spread-colouring.md`, "Serving the baseline": the recipe for serving the unchanged tree on port 5174 from a detached tmux session
- `playwright.config.ts`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/app/orbitRefineLevels.ts`: implement the stub so the frozen block passes. `isRefineCandidate(period, level)`: false for an escaped cell (period -1), true for period 0, else period at least 8 at level 1 and at least 16 at level 2; any other level throws `RangeError`. `subCellCentres(re, im, width, height, s)`: `re + ((sx + 0.5) / s - 0.5) * width`, `im + ((sy + 0.5) / s - 0.5) * height`, interleaved, sub-row major, as a `Float64Array`. `refinementRowBudget(budget, f)`: `Math.floor(budget * clamp(f, 0, 0.6))`. `splitLevelRows(budget, level1Rows)`: level 1 is `min(budget, level1Rows)`, level 2 the rest; a negative or non-finite argument throws `RangeError`. `refinePointWeight(level)`: 0.15 or 0.06; any other level throws `RangeError`.

2. `src/app/orbit3d.ts` and `src/app/orbitSampler.ts`: the second level and the budget rule in both live builders.
   - Planner (`orbitCloudBuildPlan`): the refinement row budget is `refinementRowBudget(pointBudget, refineFraction)`, where `refineFraction` is `resolveOrbitRefinement`'s value (so 0 is still off on the GPU path and still the automatic 0.3 on the CPU path). The base tier keeps its row budget and its admission exactly as card 103 left them. Rows neither the base tier nor refinement spends are left unused; the point budget remains a ceiling, not a target. Candidate caps for each level derive from that level's rows the way `candidateCapFor` derives them today.
   - Level 1 is today's tails tier (3 by 3, `isRefineCandidate(p, 1)`), packed first, capped at the refinement row budget. Level 2 takes `splitLevelRows(budget, level1RowsPacked).level2` rows: its candidates are the level-1 sub-cells that sampled with `isRefineCandidate(p, 2)`; each is subdivided 3 by 3 with `subCellCentres` from the level-1 sub-cell's own centre and its own size (a third of the base cell on each axis). No builder computes a level-2 coordinate from a base-grid index.
   - When level 2's candidates exceed its rows, admit them in a spatially uniform order (`admissionOrder` with a new seed you name in the audit), never in sweep or row-major order. Level-2 sub-cells are packed with `SlotPacker` like every other tier, at warmup `refineWarmup`, with per-point weight `refinePointWeight(2)`; level 1 keeps `refinePointWeight(1)`, which equals today's `REFINE_POINT_WEIGHT`.
   - Each level-2 point's boundary distance is looked up the way level-1 points look theirs up today, from the base cell that contains it.
   - Boundary detail: when the raised tier is active and Tail refinement is above 0, levels 1 and 2 together form the detail-0 refinement in front of the raised tier, within the refinement row budget computed from the detail-0 point budget; `boundaryDetailBaseSlots` (`u_boundaryDetailBaseCellCount`) counts every slot below the raised tier, level 2 included, so a fully gated draw still submits the genuine detail-0 cloud. The raised tier's own candidates, subdivision, warmup and capacity are unchanged.
   - Hybrid geometry's live cloud and its parity block (`rebuildHybrid`, `overwriteLiveCloudSlot`) carry level-2 slots like any other tier.
   - Stats: `refinedSubCells` and `refinedRows` stay the sum over every refinement tier. New `Orbit3DStats` fields, published by deliverable 3: `refineRowBudget`, `refinedL1SubCells`, `refinedL1Rows`, `refinedL2SubCells`, `refinedL2Rows`, `refinedDetailSubCells` (the raised tier's sub-cells, 0 when inactive) and `detailBaseSlots` (the slot count below the raised tier, the value bound to `u_boundaryDetailBaseCellCount`; equal to the slot count when the raised tier is inactive).
   - If the GPU sampler's per-call limit caps level 2's jobs, batch the calls (`sampleInBatches`); do not drop jobs silently.

3. `src/app/webglRenderer.ts` (and `src/app/simView.ts` only if needed): publish the new stats as `data-orbit3d-refine-row-budget`, `-refined-l1-sub-cells`, `-refined-l1-rows`, `-refined-l2-sub-cells`, `-refined-l2-rows`, `-refined-detail-sub-cells`, `-detail-base-slots`; and a diagnostic canvas hook `orbit3dReadRefineJobs(level, count)` that returns `{ total, jobs }`: `total` is the number of jobs that level sampled in the last build, and `jobs` holds, for the first `min(count, total)` of them, each job's `(re, im)` and its parent's `(re, im)`, width and height, read from the arrays the builder actually sampled (never recomputed for the hook). The hook is absent unless the orbit cloud is live, like `orbit3dReadSampleIndices`.

4. `src/sims/logistic-mandelbrot/kernel.ts`: the `tailRefinement` info says the setting is the share of the point budget spent re-sampling cascade tails at two levels of detail, that 0 is off on the GPU path and automatic (0.3) on the CPU fallback, and that the base grid does not change with it. No default changes.

5. `e2e/refine-levels.spec.ts` (new), with any helpers under `e2e/harness/`: the tests criteria 2 to 8 name, using the `--grep` names given. Reuse card 103's harness, pose, luma threshold and rectangles where a criterion says so. Where a card 103 test in `e2e/packed-cells.spec.ts` asserted the old rule (refinement equal to everything the base tier leaves), update that assertion to the new rule and say which in the audit; do not delete a 103 test.

6. `docs/audits/105-second-refinement-level.md` (new): the rule as built, the seeds and constants; the authoring estimate against your measurement; for every resolution preset on the GPU path (boundary detail 0 and 1) and for `balanced`, `high` and `ultra` on the CPU path, a table at Tail refinement 0, 0.3 and 0.6 of base cells, refinement row budget, level-1 sub-cells and rows, level-2 candidates, sub-cells and rows, raised-tier sub-cells, points, and the served baseline's points and refined sub-cells at the same settings; build time, warm render time and build bytes against the baseline; each criterion's result with literal evidence paths under git-ignored `e2e/artifacts/refine-levels/`; a recommendation, with the measurements behind it, on whether Tail refinement's default should change (the default itself does not change in this card); unresolved limitations.

Supporting changes are allowed only where these deliverables need them: `tsconfig.test.json`, `e2e/harness/*.ts`, `e2e/packed-cells.spec.ts` (deliverable 5 only), `src/app/orbitRefinement.ts` (comments only).

## Constraints

- The frozen block in `src/app/orbitRefineLevels.contract.test.cjs` is not edited, and neither are the frozen blocks in `src/app/orbitPacking.contract.test.cjs` and `src/app/orbitHierarchy.contract.test.cjs`.
- The base tier, the packed layout, the shader contract, the point vertex and fragment shaders' colouring, Inside-out's hierarchical centre, the surface mesh, the camera, palettes, the tone map and every default are unchanged. Each refined point carries height, period, centre, boundary distance and weight exactly as a level-1 point does today.
- The ELPC v1 format, `scripts/bake-orbit3d.mjs` and the prebaked rendering are unchanged.
- At the shipped defaults on the GPU path (Tail refinement 0, boundary detail 1), the build is identical to the unchanged tree's: same tiers, same counts, same pixels within the tolerance criterion 5 states.
- The point budget is never exceeded, and CPU-side build arrays stay sized to the point budget, never to candidates times `sampleCount`. Peak CPU-side build memory at a given setting does not exceed the unchanged tree's at the same setting by more than the level-2 job arrays, and the audit states that excess.
- No expected value is fed into the production path that is meant to produce it. Probes read real shader inputs, real job arrays and real outputs.
- The public `SimKernel` contract in `docs/INTERFACE.md` and every other simulation are unchanged. If the public contract must change, stop and request a separate versioned card.
- Run every command in the foreground and wait for it to exit. Never use `run_in_background`, `&`, `nohup` or a monitor, and never end a turn while a command is outstanding; the baseline server runs in a detached tmux session as the audit 100 recipe shows. Keep context lean: read large files by range and do not dump full logs. Write the dispatch envelope as the final action; a partial result with an envelope is better than none.
- Browser checks run headless by default with the repo's GPU flags; go headed only for a criterion that needs a real display, and batch those into as few launches as possible. Use port 5173 for the tree under test and 5174 for the served baseline (`--strictPort`).
- No new packages, no commits by the worker, no queue mutations, no deployment.

## Acceptance criteria

The Sol verifier runs every command independently in the run worktree and judges all rows. A changing attribute or a green build alone cannot satisfy a rendered criterion. No required suite may pass with zero collected tests. Where a criterion names the served baseline, the unchanged tree is the dispatch base (`dev` as cut), served on port 5174 by the audit 100 recipe; a missing baseline fails that criterion.

1. **Regression and frozen contracts.** `npm run verify`; `scripts/check-contract-test-gate.sh --worktree` exits 0; `npm run build:test && ORBIT_LEVELS=1 node --test src/app/orbitRefineLevels.contract.test.cjs` (6 pass, 0 fail, 0 skipped); `ORBIT_PACKING=1 node --test src/app/orbitPacking.contract.test.cjs` (7 pass); `ORBIT_HIERARCHY=1 node --test src/app/orbitHierarchy.contract.test.cjs` (4 pass); `npx playwright test e2e/smoke.spec.ts --grep 'logistic-Mandelbrot|Logistic Mandelbrot|cyclic Magma|orbit camera' --workers=1`; `npx playwright test e2e/packed-cells.spec.ts --workers=1` and `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'spread|chaotic|controls and cache' --workers=1`, both with the baseline served; `INSIDE_OUT_CYCLING=1 npx playwright test e2e/inside-out-cycling.contract.spec.ts --workers=1` (4 pass). Before implementing, run the `ORBIT_LEVELS=1` command on the unchanged tree and keep its 6 failures as the red baseline.

2. **The slider spends a budget, and level 2 takes the remainder.** `npx playwright test e2e/refine-levels.spec.ts --grep 'budget' --workers=1` opens the sim in cloud geometry with auto-rotate off, waits for `data-orbit3d-build="complete"`, and reads the attributes at Tail refinement 0, 0.3 and 0.6: on the GPU path at `extreme` and `ultra` with boundary detail 0, and on the CPU path (`?orbit3dSampler=cpu`) at `ultra`. At each case: `data-orbit3d-base-cells` is the same at all three settings within 0.5%; `data-orbit3d-refine-row-budget` equals `floor(data-orbit3d-point-budget * t)` (CPU: t = 0.3 when the setting is 0); `-refined-l1-rows` plus `-refined-l2-rows` never exceeds it; on the GPU path at 0 both levels are 0; `-refined-l2-sub-cells` is above 0 at 0.3 and 0.6; on both GPU presets, `-refined-l1-rows` plus `-refined-l2-rows` is strictly larger at 0.6 than at 0.3, and `-refined-l2-sub-cells` is strictly larger at 0.6 than at 0.3; `data-orbit3d-points` never exceeds `data-orbit3d-point-budget`.

3. **Level 2 subdivides its own parents.** `--grep 'geometry'` builds GPU `balanced` and CPU `balanced` at Tail refinement 0.6, boundary detail 0, and reads `orbit3dReadRefineJobs(2, 4096)` and `orbit3dReadRefineJobs(1, 4096)`. Every level-2 job's parent width and height are one third of a level-1 job's parent width and height; every level-2 job lies inside its parent's rectangle; the offsets of any job (either level) from its parent's centre take exactly the values -1/3, 0 and 1/3 of the parent's size on each axis, within 1e-9 relative; and every level-2 parent's centre equals, within 1e-12, the position of some level-1 job in the level-1 list read with `count` at least that level's `total`.

4. **More tail detail where the tails are, the plane unchanged.** `--grep 'tail density'` renders with splat growth 0 on the GPU path at `extreme`, boundary detail 0. The pose is card 104's real-axis evidence pose (zoom to c = -1.36 at height 0.2, then the per-view drag), which frames the period-4 to period-8 cascade and the chaotic points beyond. The test measures the mean luminance inside a fixed rectangle over the cascade tails at Tail refinement 0, 0.3 and 0.6 on the tree under test, and at 0.6 on the served baseline (mean luminance, not a lit fraction, because a level-2 point's weight of 0.06 may stay under a lit threshold on its own). On the tree under test the mean at 0.6 exceeds the mean at 0.3, which exceeds the mean at 0, and the tree under test at 0.6 exceeds the baseline at 0.6. Card 103's plane-coverage measurement (its pose, rectangle and threshold) at 0 and 0.6 on the tree under test agrees within 2% relative. Record the rectangle, all means and fractions, and the ratios in the audit.

5. **Shipped defaults are unchanged.** `--grep 'defaults'` at the shipped defaults (Tail refinement 0, boundary detail 1) on the GPU path, in cloud and hybrid geometry, in Inside-out and Period colour modes, at the default view: `data-orbit3d-points`, `-base-cells`, `-refined-sub-cells` and `-slots` equal the served baseline's exactly; `-refined-l2-sub-cells` is 0; frame mean luminance is within 1% of the baseline's, three matched samples each, same browser and machine. Hybrid geometry also reports `data-orbit3d-band-points` and `data-orbit3d-hybrid-cloud-points` equal to the baseline's.

6. **Boundary detail keeps its tier and its gating.** `--grep 'boundary detail'` on the GPU path at `extreme`, boundary detail 1, Tail refinement 0.3: `data-orbit3d-boundary-detail` is `active`; `-refined-detail-sub-cells` equals the baseline's raised-tier count within 1%, where the baseline's raised-tier count is its `-refined-sub-cells` at these settings minus its `-refined-sub-cells` at the same settings with boundary detail 0 (record both and the difference in the audit); and `-detail-base-slots` equals `data-orbit3d-slots` read from the tree under test at the same settings with boundary detail 0, so the gate sits above level 2.

7. **The prebaked path is unchanged.** Bake `public/baked/lm-tiny.elpc` in the run worktree with `npm run build:test && node scripts/bake-orbit3d.mjs --points 2e5 --warmup 2000 --samples 8 --out public/baked/lm-tiny.elpc`; `--grep 'prebaked'` selects it through Model source and reads `data-orbit3d-sampler="prebaked"`, `data-orbit3d-layout="stacked"` and `data-orbit3d-points` equal to the bake's cell count times 8 at Plotted iterations 8, the same as on the served baseline.

8. **Cost and evidence for the operator.** `--grep 'cost'` records, three matched samples each against the served baseline, cloud build wall-clock to `data-orbit3d-build="complete"`, warm render time as the median of 90 `requestAnimationFrame` intervals with card 103's timing helper, and `data-orbit3d-build-bytes`, at the shipped defaults and at Tail refinement 0.6 (`extreme`, boundary detail 0). At the shipped defaults, build and warm render time are within 20% of the baseline's and build bytes equal. At 0.6 the test asserts no bar; it records all three with `data-orbit3d-points` on both trees, and the audit explains any rise against the added level-2 rows. `--grep 'evidence'` saves under `e2e/artifacts/refine-levels/` screenshots of criterion 4's pose at Tail refinement 0, 0.3 and 0.6 on the tree under test and at 0.6 on the baseline, and of the cardioid pose from card 103 at 0.6 on both trees. The verifier opens them and records, with literal paths, whether the cascade tails are visibly denser at 0.6 than at 0.3 on the tree under test and whether the plane shows gaps on either tree. Whether the result looks good is the operator's judgement and is not a criterion.

Run the whole new spec once as well: `npx playwright test e2e/refine-levels.spec.ts --workers=1`.

## Contract test

- **Test file:** src/app/orbitRefineLevels.contract.test.cjs
- **Assertions digest:** `sha256:43f900f4da030d4cbced9586a9fca3801d7fdc9910ec3ec145c791aeae59c81d`

The frozen block fixes the pure helpers: which cells each level refines, coordinate-based sub-cell centres and their two-level nesting into a uniform 9 by 9 lattice, the slider-to-row-budget rule, the level split (level 1 first, never starved), and the per-level point weights. It does not cover the builders, the planner wiring, the GPU sampler, the gating or the hybrid path; criteria 2 to 8 remain mandatory.

## Authoring verification

On dev at `19a8f4186`, 2026-10-07, with the stub module and the frozen test in the working tree: `npm test` passes (416 tests, 392 pass, 24 skipped, 0 fail). `ORBIT_LEVELS=1 node --test src/app/orbitRefineLevels.contract.test.cjs` fails all 6 with `card 105: ... is not implemented`. A throwaway reference implementation of the five helpers, written to the Deliverable 1 formulas and not committed, passes all 6. The demand figures in the Objective come from a 480 by 480 `sampleAttractorCell` sweep at 8 samples (warmup 1500 base, 2000 refinement, level-1 tails at period 0 or at least 8, level-2 tails at period 0 or at least 16, 3 by 3 at each level), scaled by 16.

## Out of scope

- Any default change, including Tail refinement's: the audit recommends, the operator decides.
- A third refinement level, a widening subdivision, or raising the resolution pool so the plane can exceed 1920 by 1920.
- The baker, the bake format, compacting a prebaked cloud at load.
- The raised boundary-detail tier's candidates, subdivision, warmup and capacity.
- Colouring, the surface mesh, the camera, palettes, other simulations, public interface changes, release or deployment.

## Budget

- **Worker wall-clock:** 600 minutes
- **Verifier wall-clock:** 240 minutes
- Planning evidence: card 103's worker spent 11.1M tokens on attempt 1 and its Sol verifier 2.5M; card 104's Fable worker resumed in about 40 minutes and its Sol verifier took about 16% of a Codex five-hour window. This card touches the same files at similar depth: plan 12M for the worker and 4M for the verifier. Serial.
- Stop with an explicit partial result if the remaining checks cannot be covered. A retry needs a re-brief.

## Verification

Verifier writes the schema-valid `state/verifiers/105-logistic-mandelbrot-second-refinement-level.json` with one result and literal evidence paths per numbered criterion. Overall PASS requires all eight.

## Family-specific notes

Both roles use the repo's subscription CLI routes; do not change auth routing to work around quota or browser failures. Headless Chromium needs the repo's existing GPU flags for WebGL2 (`playwright.config.ts`); `Requires GUI: true` widens the codex seat so it can launch the browser. The Claude worker runs browser checks headless through Playwright with the same config and needs no widening.
