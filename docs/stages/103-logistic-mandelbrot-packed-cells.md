# Stage card 103-logistic-mandelbrot-packed-cells: store each periodic cell's distinct points once, so refinement stops thinning the plane

## Metadata

- **Authored:** 2026-10-06
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/103-logistic-mandelbrot-packed-cells
- **Worker effort:** xhigh
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** the change rewires the point layout through a 4,400-line renderer, two live builders and the hybrid path, with a shader contract that every path must honour; that is an open-ended brief for the strongest Anthropic tier, which also landed stages 98, 100 and 101 in this code. Sol verifies across the family boundary, literally and with the browser evidence in hand (`Requires GUI` widens the codex seat for Playwright). Serial: the card that follows (104) edits the same files and reads what this one writes.

## Objective

The orbit cloud stores `sampleCount` points for every bounded cell, but a cell with detected period p has only min(p, sampleCount) distinct heights. At the shipped 8 samples, 76.9% of bounded cells are period 1 and seven of every eight points on the cardioid sheet are copies stacked on one location. Tail refinement takes its share of the point budget out of that base grid (`orbitCloudBuildPlan`, `baseSlotCap`), so raising it opens gaps in the plane: at `extreme` resolution the base grid falls from 1920² to about 1477² at 0.6. Store each cell's distinct points once, keep the sample-major stride so the shader contract survives, and let the budget the copies no longer spend go to the cascade tails. After this card the base grid covers the whole candidate pool at every tail-refinement setting on both live paths, refinement capacity rises, and no default changes.

Measured on a 384×256 sweep of the sampler domain at warmup 1500 (2026-10-06): bounded cells need 1.56 rows each at 8 samples, 1.75 at 16, 2.57 at 64, against 8, 16 and 64 stacked. Bounded share 25.2%.

## Inputs (read these in your own context)

- `AGENTS.md`, `docs/INTERFACE.md` (read "Testing a pure src/app module")
- `src/app/orbitPacking.ts` (the stub this card implements), `src/app/orbitPacking.contract.test.cjs` (frozen)
- `src/app/orbitRefinement.ts`, `src/app/orbitRefinement.test.cjs`
- `src/app/orbit3d.ts`, read by range; the file is 4,400 lines: the point vertex shader (`POINT_VERTEX_SHADER`, about lines 53-215: `cellId`, `v_energy`, `u_boundaryDetailBaseCellCount`), `setPlottedIterations`, `configurePointAttributes` and `applyPrebaked` (about 1585-1690), `rebuild` and the CPU build (about 1690-2125), `finaliseHybrid` and the live-cloud parity block of `rebuildHybrid` (about 2960-3290), `applyLiveCloud` and `refreshPointCount` (about 3294-3350), the point draw (about 3480-3570), `pointBudgetFor` and `orbitCloudBuildPlan` (about 3874-3975), the `Orbit3DStats` interface (about 960-1000)
- `src/app/orbitSampler.ts`: `OrbitCloudBuffers`, `GpuOrbitCloudOptions`, `OrbitSampleResult`, `buildGpuOrbitCloud` (about 306-990)
- `src/app/webglRenderer.ts`: the orbit3d dataset attributes and `setPlottedIterations` (about 1540-1760)
- `src/app/simView.ts`: how `modelSource` options and the canvas dataset reach the renderer (grep `orbit3d`; read only what you need)
- `src/sims/logistic-mandelbrot/kernel.ts`: the `tailRefinement`, `boundaryDetail`, `sampleCount` and `plottedIterations` descriptors
- `src/sims/logistic-mandelbrot/model.ts`: `sampleAttractorCell`, `RE_MIN`/`RE_MAX`/`IM_MIN`/`IM_MAX`, `SAMPLE_CLIP`
- `e2e/smoke.spec.ts` (the logistic-Mandelbrot tests), `e2e/harness/insideOut.ts` (`openSim`, `probeShaderColours`, `gpuSample`), `e2e/inside-out-cycling.spec.ts` (the "controls and cache" tests, including the timing test against a served baseline)
- `docs/audits/100-inside-out-spread-colouring.md`, "Serving the baseline": the recipe for serving the unchanged tree on port 5174 from a detached tmux session
- `README.md`, "Baking a local point cloud"; `scripts/bake-orbit3d.mjs` (to bake a tiny cloud for the prebaked check; do not edit it)
- `playwright.config.ts`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/app/orbitPacking.ts`: implement the stub so the frozen block passes. `distinctPointCount(p, S)` is min(p, S) for p > 0 and S for p = 0. `estimatePackedRowsPerCell(S)` is a planner estimate inside the frozen bounds; `min(S, 1.45 + S / 48)` satisfies them, another formula inside them is fine. `SlotPacker` is an online best-fit packer over slots of `rowsPerSlot` rows: a cell of n rows goes to the open slot with the smallest free run that still fits it, else a new slot; a cell never spans two slots; `place` refuses sizes outside 1..rowsPerSlot and non-integers. `admissionOrder(cellCount, seed)` is a deterministic permutation (a seeded shuffle is fine) whose prefixes are spatially uniform.

2. `src/app/orbit3d.ts` and `src/app/orbitSampler.ts`: the packed layout in both live builders, CPU and GPU, in every tier (base, baseline refinement, boundary detail). The layout contract, which the shader, the draw and all three cloud sources share:
   - The stride stays sample-major: `sampleCount` rows by `slotCount` slots, point index `row * slotCount + slot`. A cell occupies `distinctPointCount(period, sampleCount)` consecutive rows of one slot (its orbit samples 0..n-1 in order); periodic cells share slots through `SlotPacker`; a cell with no detected period fills a slot alone. Rows nothing occupies are hidden, never drawn.
   - New per-point attribute `a_sampleIndex`: the orbit sample index of the point within its cell (0..sampleCount-1); hidden rows carry `sampleCount`. The point program gains `u_visibleIterations` and hides a point when `a_sampleIndex >= u_visibleIterations`. A packed cloud submits every row to the draw; Plotted iterations acts in the shader.
   - Energy: a packed cloud gives each point energy `a_weight` times its tier opacity, with no `period / sampleCount` factor, because nothing stacks. A stacked cloud keeps the factor. A per-cloud uniform (`u_stackedEnergy` or an equivalent you name in the audit) selects.
   - Stacked clouds may remain: the prebaked path (`applyPrebaked`) and the hybrid fallback cloud `finaliseHybrid` builds when the GPU sampler is unavailable. They bind a constant `a_sampleIndex` of 0 (disabled attribute array), keep today's draw-range prefix for Plotted iterations, and declare stacked energy. Their rendering is unchanged.
   - Point density culls per slot (`cellId = gl_VertexID mod slotCount` stays); a packed slot's periodic cells go together, which keeps every culled cell's orbit whole. Say so in the shader comment.
   - Boundary-detail gating keeps its slot-index threshold (`u_boundaryDetailBaseCellCount` becomes the slot count of the tiers below the raised one) and its per-row draw ranges.
   - Planner (`orbitCloudBuildPlan`): the base tier's row budget is `(1 - refineFraction) * pointBudget` (CPU path: `resolveOrbitRefinement` unchanged, so 0 still means 0.3); the candidate grid is sized from `estimatePackedRowsPerCell(sampleCount)` and `SURVIVING_CELL_ESTIMATE`, capped at the resolution pool as now. Every slot the base tier leaves goes to refinement, and the refinement candidate caps derive from that remainder. Refined sub-cells are packed the same way.
   - Admission: candidate cells are sampled as now; bounded cells are admitted into the base tier in `admissionOrder` until the base row budget is exhausted. No reservoir replacement of packed cells. CPU-side build arrays stay sized to the point budget, never to candidates times `sampleCount`; `boundaryDistanceField` is still applied per cell after the sweep.
   - Hybrid live-cloud parity (`rebuildHybrid`): the coarse-period rewrite is per point, a slot is replaceable only when every row it holds is periodic, and `overwriteLiveCloudSlot` writes all `sampleCount` rows with sample indices 0..sampleCount-1. `bandPointCount` and `hybridCloudPointCount` keep counting sites times `sampleCount`.
   - Stats: `pointCount` is the number of points submitted to the draw. New `Orbit3DStats` fields, published by deliverable 3: `candidateCells` (sampleWidth times sampleHeight), `boundedCandidates`, `baseCells` (bounded cells stored in the base tier), `baseRows`, `slotCount`, `refinedSubCells` (sub-cells stored across both refinement tiers), `visiblePoints` (points not hidden by Plotted iterations, from the per-sample-index counts at upload), `layout` (`"packed"` or `"stacked"`), `buildBytes` (bytes of the CPU-side typed arrays the build allocated).
   - If the GPU sampler's target size caps a single `sample` call below the refinement job count, batch the calls; do not drop jobs silently.

3. `src/app/webglRenderer.ts` and `src/app/simView.ts`: publish the new stats as `data-orbit3d-candidate-cells`, `-bounded-candidates`, `-base-cells`, `-base-rows`, `-slots`, `-refined-sub-cells`, `-visible-points`, `-layout`, `-build-bytes`; and a diagnostic override that forces the CPU sampling path for a build, read from the page URL as `?orbit3dSampler=cpu` and reported as `data-orbit3d-sampler="cpu-sampled"`. The override is inert when absent and changes nothing else.

4. `src/sims/logistic-mandelbrot/kernel.ts`: the `tailRefinement` info says its share caps the base tier and the rest of the budget refines the tails, so the base grid no longer thins; `sampleCount` no longer says more samples means fewer cells covered, since only chaotic and high-period cells cost more rows; `plottedIterations` keeps its meaning.

5. `e2e/packed-cells.spec.ts` (new), with any helpers under `e2e/harness/`: the tests criteria 2 to 9 name. In `e2e/inside-out-cycling.spec.ts`, the timing test's `cur.points[0] === base.points[0]` equality is retired (a packed cloud submits a different count by design) and replaced by `cur.points[0] <= base.points[0]`; its timing thresholds stay.

6. `docs/audits/103-packed-cells.md` (new): the layout as built and the uniform names; the planner constants; for every resolution preset on the GPU path and for `balanced`, `high` and `ultra` on the CPU path, a table of candidate cells, bounded candidates, base cells, base rows, slots and refined sub-cells at tail refinement 0, 0.3 and 0.6, with the unchanged tree's point count at the same settings; build time, warm render time and build bytes against the served baseline; each criterion's result with literal evidence paths under git-ignored `e2e/artifacts/packed-cells/`; unresolved limitations (the bake stays stacked; the resolution pool still caps the plane).

7. `README.md`: one paragraph under "Baking a local point cloud" saying the live build packs each cell's distinct points while a bake stays stacked and draws as before.

Supporting changes are allowed only where these deliverables need them: `tsconfig.test.json`, `e2e/harness/*.ts`, `src/app/orbitRefinement.ts` (comments only), `docs/INTERFACE.md` (a note under the testing section if the harness convention changes).

## Constraints

- The frozen block in `src/app/orbitPacking.contract.test.cjs` is not edited.
- The ELPC v1 format, `scripts/bake-orbit3d.mjs` and the prebaked rendering are unchanged: same point count, same Plotted iterations behaviour, same brightness.
- Each point keeps its height, period, centre, boundary distance and weight. Only how many points a cell stores and where they sit changes. Inside-out, Cycle, Period and Mono read exactly what they read today per point.
- A distinct sheet location's summed energy is unchanged: a period-p cell stacked sampleCount/p deep at p/sampleCount each is one point at 1 now.
- The surface mesh (`orbitSurface*.ts`), camera, palette, tone map, every default, the public `SimKernel` contract in `docs/INTERFACE.md` and every other simulation are unchanged. If the public contract must change, stop and request a separate versioned card.
- When the base row budget cannot hold every bounded candidate cell, the kept set is spatially uniform (`admissionOrder`), never a row-major truncation.
- Peak CPU-side build memory does not exceed the unchanged tree's at the same settings.
- No expected value is fed into the production path that is meant to produce it. Probes read real shader inputs and outputs.
- Run every command in the foreground and wait for it to exit. Never use `run_in_background`, `&`, `nohup` or a monitor, and never end a turn while a command is outstanding; the baseline server runs in a detached tmux session as the audit 100 recipe shows. Keep context lean: read large files by range and do not dump full logs.
- Browser checks run headless by default with the repo's GPU flags; go headed only for a criterion that needs a real display, and batch those into as few launches as possible. Use port 5173 for the tree under test and 5174 for the served baseline (`--strictPort`).
- No new packages, no commits by the worker, no queue mutations, no deployment.

## Acceptance criteria

The Sol verifier runs every command independently in the run worktree and judges all rows. A changing attribute or a green build alone cannot satisfy a rendered criterion. No required suite may pass with zero collected tests. Where a criterion names the served baseline, the unchanged tree is the dispatch base (`dev` as cut), served on port 5174 by the audit 100 recipe; a missing baseline fails that criterion.

1. **Regression and frozen contract.** `npm run verify`; `scripts/check-contract-test-gate.sh --worktree` exits 0; `npm run build:test && ORBIT_PACKING=1 node --test src/app/orbitPacking.contract.test.cjs` (7 pass, 0 fail, 0 skipped); `npx playwright test e2e/smoke.spec.ts --grep 'logistic-Mandelbrot|Logistic Mandelbrot|cyclic Magma|orbit camera' --workers=1`; `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'spread|chaotic|controls and cache' --workers=1` with the baseline served; `INSIDE_OUT_CYCLING=1 npx playwright test e2e/inside-out-cycling.contract.spec.ts --workers=1` (4 pass). Before implementing, run the `ORBIT_PACKING=1` command on the unchanged tree and keep its 7 failures as the red baseline.

2. **The base grid no longer thins.** `npx playwright test e2e/packed-cells.spec.ts --grep 'base grid' --workers=1` opens the sim in cloud geometry with auto-rotate off and boundary detail 0, waits for `data-orbit3d-build="complete"`, and reads the attributes at tail refinement 0, 0.3 and 0.6: on the GPU path at `extreme` and `ultra`, and on the CPU path (`?orbit3dSampler=cpu`, `data-orbit3d-sampler="cpu-sampled"`) at `balanced` and `ultra`. At each preset: `data-orbit3d-base-cells` is the same at all three settings within 0.5% and equals `data-orbit3d-bounded-candidates`; `data-orbit3d-candidate-cells` is within 2% of the preset's target (1920², 1280² or 640²); `data-orbit3d-refined-sub-cells` is non-decreasing from 0 to 0.3 to 0.6 and larger at 0.6 than at 0.3; `data-orbit3d-layout` is `packed`; `data-orbit3d-points` never exceeds `data-orbit3d-point-budget`.

3. **The plane keeps its density.** `--grep 'plane coverage'` renders a fixed camera pose over the cardioid interior with splat growth 0, on the GPU path at `extreme` and on the CPU path at `ultra`, at tail refinement 0 and 0.6 (CPU: 0.3 and 0.6), and measures the fraction of pixels above a luminance threshold inside a fixed rectangle. The pose is chosen so the fraction at the lower setting lies between 0.15 and 0.6, so the lattice is resolved; the test asserts that. The fraction at 0.6 is within 2% (relative) of the lower setting's on the tree under test. The same measurement on the served baseline gives a ratio below 0.8, which the test asserts, so the comparison is shown to detect the thinning it claims to remove. Record the pose and both ratios in the audit.

4. **Refinement capacity rises.** `--grep 'refinement capacity'` at `extreme` on the GPU path with boundary detail 1 and tail refinement 0 reads `data-orbit3d-refined-sub-cells` on the tree under test, and derives the baseline's refined sub-cell count from the served baseline as `points(boundary detail 1) / 8 - points(boundary detail 0) / 8` at the same settings. The tree under test holds at least 1.3 times the baseline's count. The audit tabulates the before and after figures for all five presets.

5. **Plotted iterations and density keep their meaning.** `--grep 'plotted'` on the GPU path at `extreme`, cloud geometry, boundary detail 0, tail refinement 0.3: at plotted iterations 1, `data-orbit3d-visible-points` equals `data-orbit3d-base-cells` plus `data-orbit3d-refined-sub-cells` (one point per stored cell); at 8 it equals `data-orbit3d-base-rows` plus the refined rows; the lit fraction of the cardioid rectangle from criterion 3 is the same at plotted 1 and 8 within 1%, while the lit fraction of a rectangle over the chaotic band near the real axis is at least 30% lower at 1 than at 8. Point density is culled in the shader and leaves `data-orbit3d-visible-points` unchanged; the test asserts that at density 0.5.

6. **Shader contract.** `--grep 'shader contract'` runs the production point shader through `probeShaderColours` (or a sibling helper) on controlled points and reads pixels: a point with `a_sampleIndex` at or above `u_visibleIterations` draws nothing; below it draws; with stacked energy off, two points of periods 1 and 4 at equal weight read the same luminance; with stacked energy on, the period-4 point reads about half the period-1 point's (period over 8 samples, within 5%); and a packed cloud's `a_sampleIndex` buffer, read back with `getBufferSubData` over the first 4096 points of a GPU `balanced` build, holds only values in 0..8 with every slot's occupied rows contiguous from row 0 and its hidden rows reading 8.

7. **Brightness and geometry modes.** `--grep 'brightness'` at the default view with boundary detail 0 and tail refinement 0 (GPU), plotted iterations 8, in cloud and in hybrid geometry, in Inside-out and Period colour modes: frame mean luminance on the tree under test is within 5% of the served baseline's, three matched samples each, same browser and machine. Hybrid geometry also reports `data-orbit3d-band-points` and `data-orbit3d-hybrid-cloud-points` equal to the baseline's.

8. **The prebaked path is unchanged.** Bake `public/baked/lm-tiny.elpc` in the run worktree with `npm run build:test && node scripts/bake-orbit3d.mjs --points 2e5 --warmup 2000 --samples 8 --out public/baked/lm-tiny.elpc`; `--grep 'prebaked'` selects it through Model source and reads `data-orbit3d-sampler="prebaked"`, `data-orbit3d-layout="stacked"`, `data-orbit3d-points` equal to the bake's cell count times 8 at plotted 8 and times 1 at plotted 1, and a lit fraction above 0.1 over the cardioid rectangle at both.

9. **Cost and evidence for the operator.** `--grep 'cost'` records, three matched samples each against the served baseline at the shipped defaults (boundary detail 1): cloud build wall-clock to `data-orbit3d-build="complete"`, warm render time as the median of 90 `requestAnimationFrame` intervals, and `data-orbit3d-build-bytes` against the baseline's point budget times 24 bytes. Warm render time is within 20% of the baseline's; build bytes do not exceed the baseline's; build time is reported together with the refined sub-cell ratio from criterion 4, and a rise larger than that ratio needs an explanation and verifier approval, never a hidden quality reduction. `--grep 'evidence'` saves under `e2e/artifacts/packed-cells/` screenshots of the cardioid pose at tail refinement 0 and 0.6 on both trees, and of the "Bifurcation curtain" preset at tail refinement 0.6 on both trees. The verifier opens them and records, with literal paths, whether the plane shows gaps at 0.6 on each tree and whether the cascade tails are denser on the tree under test. Whether the result looks good is the operator's judgement and is not a criterion.

Run the whole spec once as well: `npx playwright test e2e/packed-cells.spec.ts --workers=1`.

## Contract test

- **Test file:** src/app/orbitPacking.contract.test.cjs
- **Assertions digest:** `sha256:44c8391d3b7669c02bed0134d3d0ce202e13b646104aa01b6b72395a1bfad440`

The frozen block fixes the pure layout helpers: distinct rows per cell, the planner estimate's bounds against the measured rows per cell, best-fit packing that never splits or overlaps a cell, and a deterministic, spatially uniform admission order. It does not cover the renderer, the builders, the shader or the hybrid path; criteria 2 to 9 remain mandatory.

## Authoring verification

On dev at `fad66fdaf`, 2026-10-06, with the stub module and the frozen test committed: `npm run verify` passes (408 tests, 390 pass, 18 skipped, 0 fail; production build green). `ORBIT_PACKING=1 node --test src/app/orbitPacking.contract.test.cjs` fails all 7 with `card 103: ... is not implemented`. The rows-per-cell figures in the frozen bounds come from `sampleAttractorCell` over a 384×256 grid of the sampler domain at warmup 1500, run at authoring: 1.56 at 8 samples, 1.75 at 16, 2.57 at 64; periods 1 (76.9%), 2 (12.9%), 3 (3.7%), none (1.7%), 4 (1.5%).

## Out of scope

- Compacting a prebaked cloud at load, a new bake format, or raising the resolution pool so the plane can exceed 1920² (both are follow-ups the audit may recommend).
- The hierarchical Inside-out centre (card 104).
- Any default change, the surface mesh, the camera, palettes, other simulations, public interface changes, release or deployment.

## Budget

- **Worker wall-clock:** 1440 minutes (operator 2026-10-06: no timebox; provider session limits bound spend)
- **Verifier wall-clock:** 1440 minutes (operator 2026-10-06: no timebox; provider session limits bound spend)
- Planning evidence, `state/cost-log.jsonl` read 2026-10-06: worker median 2.7M tokens, p95 14.4M; verifier median 2.0M, p95 6.7M. This card is larger than stage 100 (worker 1.9M to 2.6M, verifier 4.6M), so plan 6M for the worker and 5M for the verifier; one p95 outlier on each side brings the pair to about 21M, inside the repo's 130M resting daily cap with 65M already spent in this window. Serial.
- Stop with an explicit partial result if the timebox cannot cover the remaining checks. A retry needs a re-brief.

## Dispatch envelope

Worker returns changed paths, commands with results, the uniform and attribute names, measured costs, evidence paths and unresolved criteria in `state/envelopes/103-logistic-mandelbrot-packed-cells.json` using the current dispatch template, written as the final action of the last turn. A partial result with a written envelope is better than none.

Verifier writes the schema-valid `state/verifiers/103-logistic-mandelbrot-packed-cells.json` with one result and literal evidence paths per numbered criterion. Overall PASS requires all nine.

## Family-specific notes

Both roles use the repo's subscription CLI routes; do not change auth routing to work around quota or browser failures. Headless Chromium needs the repo's existing GPU flags for WebGL2 (`playwright.config.ts`); `Requires GUI: true` widens the codex seat so it can launch the browser. The Claude worker runs browser checks headless through Playwright with the same config and needs no widening.

## Re-brief 1 (2026-10-06, attempt 2)

Attempt 1 (Fable 5.1) is preserved at `4bc8e7d82a7e44414541cfac0de4faec3dfd503d`
on `wip/103-logistic-mandelbrot-packed-cells-attempt-1`, with its audit at
`docs/audits/103-packed-cells.md`. The Sol verifier passed criteria 1, 3, 5, 7
and 8 and failed 2, 4, 6 and 9. Three of those four failures are card errors;
one is a real defect. The packed layout itself is accepted: the plane no longer
thins (criterion 3: baseline 0.343 to 0.207 at tail 0.6, tree under test
unchanged).

Card amendments, which supersede the criteria text above where they differ:

- **Criterion 2.** Withdraw "and larger at 0.6 than at 0.3". The card assumed
  the unchanged tree was capacity-bound; attempt 1 measured that it refines
  every candidate cell at every preset, so freed budget cannot raise the count.
  Refined sub-cells must still be non-decreasing from 0 to 0.3 to 0.6, and every
  other clause of criterion 2 stands.
- **Criterion 4.** Replace the 1.3 times bar with: the tree under test holds at
  least as many refined sub-cells as the baseline at every preset (ratio at
  least 1.00), and the audit keeps the five-preset table and the
  candidate-bound finding. Do not add a second refinement level or widen the
  subdivision: making tail refinement spend capacity is a follow-up card and an
  operator decision.
- **Criterion 6.** The sentence "the period-4 point reads about half the
  period-1 point's" contradicts its own rule. The rule is energy = period over
  8 samples: with stacked energy on, period 1 reads 1/8 and period 4 reads 4/8
  of full, so period 4 reads four times period 1, within 5%. Attempt 1's
  measured [32, 128] satisfies the corrected criterion; keep that test.

Attempt 2 instructions, in addition to everything above:

1. Start from the preserved work: `git checkout 4bc8e7d82a7e44414541cfac0de4faec3dfd503d -- .`
   in the run worktree, then restore this card to HEAD
   (`git checkout HEAD -- docs/stages/103-logistic-mandelbrot-packed-cells.md`).
   Do not re-implement the layout. Update the base-grid and refinement-capacity
   assertions in `e2e/packed-cells.spec.ts` to the amended criteria 2 and 4.
2. **Criterion 9 is the work of this attempt.** Sol measured warm render at
   1.72 times the baseline's (attempt 1 measured 1.25 to 1.56) and build time at
   1.39 times with a refined ratio of 1.00. Profile and fix the render
   regression until warm render is within 20% of the baseline's. The
   candidates attempt 1 listed are the per-vertex hide branch at the top of
   the point shader, the per-frame dataset writes, and whether the baseline's
   53.4 ms is a pacing floor. If you conclude the gap is a measurement artefact,
   show it with a second independent timing on both trees (GPU time through
   `EXT_disjoint_timer_query_webgl2` where available, or a fixed-frame-count
   draw loop) and record both; the verifier judges. Then either bring build
   time within 20% of the baseline's or explain the rise in the audit for
   verifier approval, as the criterion already says.
3. The evidence under ignored `e2e/artifacts/packed-cells/` was lost with the
   attempt-1 worktree (a copy is kept outside the run for the operator).
   Serve the baseline on 5174 yourself by the audit 100 recipe and regenerate
   every artifact this attempt cites; do not cite attempt-1 paths.
4. Run the whole spec once, `npx playwright test e2e/packed-cells.spec.ts --workers=1`,
   which attempt 1 did not reach, and update the audit's numbers from this
   attempt's runs.
5. Run every command in the foreground and wait for it to exit. Never end a
   turn while a command is outstanding. Write the dispatch envelope as the
   final action; a partial result with an envelope is better than none.
6. Budget: attempt 1 spent 11.1M worker tokens. Keep context lean: read files
   by range and do not dump full logs.

## Re-brief 2 (2026-10-06, attempt 3)

Attempt 2 was killed after its headless worker process hung (main thread
blocked in `openat`, all sockets closed, no transcript writes for 15 minutes);
the hang is a harness fault, not a fault in the work. Its tree is preserved at
`1fe55a6f10b7ec9bf0ef00cd821643d60d48516a` on
`wip/103-logistic-mandelbrot-packed-cells-attempt-2`. By its own notes it had
rewritten the GPU base-tier builder, rebaked `lm-tiny.elpc` (26,015 cells),
rewritten the frame-timing helper in the shared harness, and had the contract
gate and `npm run verify` clean. Its last cost run read warm render 9.3 to 9.6 ms
on the tree under test against 52.1 to 52.5 ms on the baseline, and build 606 to
613 ms against 644 to 677 ms. Those figures are unverified.

Attempt 3 instructions, in addition to everything above and Re-brief 1:

1. Start from the preserved work: `git checkout 1fe55a6f10b7ec9bf0ef00cd821643d60d48516a -- .`
   in the run worktree, then restore this card to HEAD
   (`git checkout HEAD -- docs/stages/103-logistic-mandelbrot-packed-cells.md`).
   Review the diff against `4bc8e7d82` rather than re-deriving it.
2. The rewritten timing helper must measure both trees the same way. In the
   audit, state what changed in it and why, and show that the baseline's
   figure is not merely a pacing floor the tree under test escapes by a
   different method (for example, the same helper on the baseline at a
   lighter preset). A 5x render improvement needs that explanation for the
   verifier to accept it.
3. Re-run every criterion's command, then the whole spec once, and update the
   audit from this attempt's runs. Regenerate all evidence; do not cite paths
   from earlier attempts.
4. Keep the session short: no exploratory re-reading of files already
   understood from the diff. Write the dispatch envelope as the final action.
