# Stage card 104-logistic-mandelbrot-hierarchical-centre: measure Inside-out distance from the parent cycle point, so bands leave every bulb

## Metadata

- **Authored:** 2026-10-06
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** GPT-6 Astra <gpt-6-astra@local>
- **Verifier:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/104-logistic-mandelbrot-hierarchical-centre
- **Worker effort:** xhigh
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** stage-completed: 103-logistic-mandelbrot-packed-cells
- **Dispatch:** serial
- **Pairing rationale:** the work is numerical (a divisor search over cycle heights carried identically through a float64 oracle, a GLSL sampler pass, a quantized prebaked derive and the sheet builder), so the frontier codex tier takes the worker seat; `Requires GUI` lets it run its own Playwright checks. Opus 5.5 verifies across the family boundary, where the judgement-heavy part is the rendered evidence. Worker families alternate with card 103 (Claude there, codex here). Serial and gated: this card edits `orbit3d.ts`, `orbitSampler.ts` and `prebakedCentre.ts` after card 103 has reshaped them.

## Objective

Inside-out colours each point by `fract(bands * |Re(z) - centre| - phase)`. Today the centre is the column's orbit mean (card 100), so a cycle born by period-doubling starts at its parent's distance instead of at zero: at c = -1.26 the four period-4 branches sit 0.63 to 0.79 from the column mean while the period-2 branches arrive at 0.70, so the period-4 bulb continues the period-2 bands, doubled, and the same happens at period 8 and at the period-6 satellite of the period-2 bulb. Only bulbs attached to the cardioid are born at distance zero. The operator decided on 2026-10-06 that each cycle point is measured against the parent cycle point it was born from, so bands leave every bulb's own root upward and downward. Primary bulbs, the period-2 bulb, period-1 sheets, chaotic columns and the ground are unchanged. Defaults do not change.

The rule, fixed by this card: for a cycle of period p with heights h_0..h_{p-1} (consecutive iterates, h = Re z), each divisor s >= 2 of p proposes a satellite multiplicity. The group of cycle index k is {k + j p/s mod p : j = 0..s-1}, its parent is the group's mean height, and the proposal's cost is the mean over k of (h_k - parent(k))². The proposal with the smallest cost wins; a tie within 1e-12 relative goes to the larger s. The per-sample centre of plotted sample i is the parent of cycle index i mod p, aligned so that sample 0 is cycle index 0. A prime period has only s = p, whose parents are all the column mean; period 1 reads its own height; a column with no detected period keeps the running-window mean. `src/app/orbitHierarchy.ts` holds this as `cycleHierarchy`, and every path applies that one function or its exact GLSL twin.

## Inputs (read these in your own context)

- `AGENTS.md`, `docs/INTERFACE.md` (read "Testing a pure src/app module")
- `src/app/orbitHierarchy.ts` (the stub this card implements), `src/app/orbitHierarchy.contract.test.cjs` (frozen)
- `src/app/orbitColour.ts`, `src/app/orbitSpread.contract.test.cjs` (frozen; must still pass unchanged)
- `src/sims/logistic-mandelbrot/model.ts`: `sampleAttractorCell`, `AttractorCellMeasure`, `periodDetectionWindow`, `estimatePeriod`
- `src/app/orbitSampler.ts`: the metadata pass (period detection, the centre and spread walk, `outMetadata`), `SampleTargets`, the readback into `OrbitSampleResult`, and the cloud assembly's `centres` writes
- `src/app/prebakedCentre.ts`, `src/app/prebakedCentre.test.cjs`
- `src/app/orbit3d.ts`, read by range: the CPU build's `centres` writes, `finaliseHybrid` and `writePointSite`, `overwriteLiveCloudSlot`, the `interiors` channel handed to `buildOrbitSurface`, `parsePrebaked`
- `src/app/orbitSurface.ts`: the sheet builder (about lines 640-800: ranks, sorted heights, `interiorValues`), `OrbitSurfaceSample`
- `src/app/webglRenderer.ts`: `ensureOrbit3dAttractionField` (reads the per-cell centre for the ground; stays on the column mean)
- `docs/audits/2026-10-02-orbit-spread-colouring.md`, section D (the period-2 symmetry and band-density reasoning) and `docs/audits/100-inside-out-spread-colouring.md`, "Numerical method"
- `docs/audits/103-packed-cells.md` (the layout card 103 landed; per-point attributes are per sample already)
- `e2e/inside-out-cycling.spec.ts`, `e2e/harness/insideOut.ts` (`gpuSample`, `probeShaderColours`, `openSim`), `e2e/inside-out-cycling.contract.spec.ts` (frozen)
- `src/sims/logistic-mandelbrot/kernel.ts` (`colourMode` and `cycleBands` info), `essays/logistic-mandelbrot.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/app/orbitHierarchy.ts`: implement `cycleHierarchy(heights, period)` to the rule above so the frozen block passes. `period` 0 throws; `heights` shorter than `period` throws.

2. `src/sims/logistic-mandelbrot/model.ts`: `AttractorCellMeasure` gains optional `sampleCentres: Float32Array`. When present and at least `sampleCount` long, `sampleAttractorCell` fills entry i with the per-sample centre of plotted sample i: for a detected period, `cycleHierarchy` over one cycle of heights aligned to sample 0 (the detection window already holds them); for no period, the running-window mean in every entry; for an escaped cell, zeros. `centre` and `spread` keep today's meaning and values (the frozen card 100 block must pass unchanged).

3. `src/app/orbitSampler.ts`: the GPU path produces the same per-sample centre for every detected period up to `MAX_DETECTABLE_PERIOD`, including periods longer than the plot window (the metadata pass already holds the detection window in-shader), and returns it as `OrbitSampleResult.sampleCentres` (sample-major, `sampleCount` by `cellCount`, like `samples`). Choose the mechanism (a per-sample target written alongside the samples texture, or an extra lane per batch) and record it and its measured cost in the audit. `centres` stays the column mean. The cloud assembly writes each point's `centres` entry from `sampleCentres`.

4. `src/app/orbit3d.ts`: the CPU build writes each point's centre from `measure.sampleCentres`; `finaliseHybrid`'s `writePointSite` and the parity block's `overwriteLiveCloudSlot` do the same from the surface sample's per-rank centres; the ground field is untouched. A diagnostic readback for tests: a method on the canvas (`orbit3dReadPoints(first, count)` on `Orbit3DDiagnosticCanvas`, or an equivalent you name) that returns the live cloud's positions, periods and centres for a point range through `getBufferSubData`, without keeping CPU copies alive.

5. `src/app/orbitSurface.ts`: `OrbitSurfaceSample` carries per-rank centres, and the sheet builder's `interiorValues` entry for each rank vertex is that rank's parent centre, mapped through the height sort it applies. The surface shader is unchanged (it already reads `a_centre`).

6. `src/app/prebakedCentre.ts`: `deriveQuantizedCentres` returns per-sample centres: for a cell whose period p is at most the bake's sample count, `cycleHierarchy` over the first p quantized heights (quantization is linear, so group means of quantized values are the quantized group means; round to u16); for a period above the sample count or none, the window mean as now. Update `prebakedCentre.test.cjs` accordingly; the ELPC format is unchanged.

7. `e2e/inside-out-cycling.spec.ts` and `e2e/harness/insideOut.ts`: `gpuSample` returns `sampleCentres`; add the tests criteria 2 to 6 name under a new `test.describe("hierarchy")`. Existing tests must still pass: the period-2 sheets over c = -1 still share a hue, the period-1 sheet still sits at distance zero, and the chaotic band is still coloured.

8. `src/sims/logistic-mandelbrot/kernel.ts` and `essays/logistic-mandelbrot.md`: describe the centre as the parent cycle point, with the column mean for primary bulbs and chaotic columns, in one or two sentences each.

9. `docs/audits/104-hierarchical-centre.md` (new): the rule as implemented, the GPU mechanism and its measured cost against the card 103 baseline, CPU/GPU agreement figures, each criterion's result with literal evidence paths under git-ignored `e2e/artifacts/hierarchical-centre/`, and limitations (the ground still reads the column spread; a bake's periods above its sample count fall back to the window mean).

Supporting changes are allowed only where these deliverables need them: `tsconfig.test.json`, `src/app/webglRenderer.ts` (the diagnostic hook only), `src/sims/logistic-mandelbrot/kernel.test.cjs`, `src/sims/logistic-mandelbrot/gpu-parity.test.cjs` scaffolding outside its frozen block.

## Constraints

- The rule in the Objective is the operator's decision. Do not substitute another grouping, weight the cost, smooth across neighbouring columns, or clamp the distance.
- Both frozen blocks are not edited: `src/app/orbitHierarchy.contract.test.cjs` and `src/app/orbitSpread.contract.test.cjs`. `e2e/inside-out-cycling.contract.spec.ts` stays byte-identical between its markers.
- `AttractorCellMeasure.centre`, `OrbitSampleResult.centres`, the ground field and its classification are unchanged in value.
- Card 103's layout contract is kept: a point's centre is a per-point attribute already; nothing about rows, slots, sample indices or energy changes here.
- Keep every default. Cycle, Period and Mono render exactly as before. No change to geometry, camera, refinement, warmup or sample defaults, the tone map, or any other simulation. No change to the public `SimKernel` contract; if it must change, stop and request a separate versioned card.
- No expected value is fed into the production path that is meant to produce it. References in tests are independent float64 iterations.
- Run every command in the foreground and wait for it to exit. Never use `run_in_background`, `&`, `nohup` or a monitor, and never end a turn while a command is outstanding; a served baseline runs in a detached tmux session as the audit 100 recipe shows. Keep context lean: read large files by range and do not dump full logs.
- Browser checks run headless by default with the repo's GPU flags; go headed only for a criterion that needs a real display, and batch those into as few launches as possible. Use port 5173 for the tree under test and 5174 for a served baseline (`--strictPort`).
- No new packages, no commits by the worker, no queue mutations, no deployment.

## Acceptance criteria

The Opus 5.5 verifier runs every command independently in the run worktree and judges all rows. A changing uniform or a green build alone cannot satisfy a rendered criterion. No required suite may pass with zero collected tests.

1. **Regression and frozen contracts.** `npm run verify`; `scripts/check-contract-test-gate.sh --worktree` exits 0; `npm run build:test && ORBIT_HIERARCHY=1 node --test src/app/orbitHierarchy.contract.test.cjs` (4 pass, 0 fail, 0 skipped); `ORBIT_SPREAD=1 node --test src/app/orbitSpread.contract.test.cjs` (7 pass); `ORBIT_PACKING=1 node --test src/app/orbitPacking.contract.test.cjs` (7 pass); `INSIDE_OUT_CYCLING=1 npx playwright test e2e/inside-out-cycling.contract.spec.ts --workers=1` (4 pass); `npx playwright test e2e/inside-out-cycling.spec.ts --workers=1` with the baseline served for its timing test; `npx playwright test e2e/packed-cells.spec.ts --grep 'base grid|shader contract|prebaked' --workers=1`. Before implementing, run the `ORBIT_HIERARCHY=1` command on the unchanged tree and keep its 4 failures as the red baseline.

2. **CPU and GPU agree on every per-sample centre.** `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'hierarchy: sampler' --workers=1` runs the production GPU sampler and the CPU oracle at warmup 1500 and 8 samples over c = -0.5 (period 1), -1 (period 2), -1.3 and -1.26 (period 4), -1.375 (period 8), -1.14 + 0.245i (period 6), -0.12 + 0.74i (period 3) and -1.9 (no period), and at 8 samples also over a cell whose detected period exceeds 8 (the test finds one on the real axis between -1.40 and -1.38 by the CPU oracle's period and asserts it is above 8). For every cell and sample index, the CPU per-sample centre is within 1e-3 of an independent float64 reference computed in the test from the rule (the reference iterates and groups by itself), and the GPU per-sample centre is within 1e-3 of the CPU's (0.1 for the no-period cell). At the period-4, period-8 and period-6 cells every sample's centre differs from `centre` by more than 0.3; at the period-1, period-2 and period-3 cells every sample's centre equals `centre` within 1e-3.

3. **The live cloud carries the per-sample centre.** `--grep 'hierarchy: cloud'` opens the sim on the GPU path at `balanced`, cloud geometry, Inside-out, and reads back points through the diagnostic of deliverable 4; it finds stored points whose c lies within half a cell of -1.3 on the real axis and asserts their centres are the pair means of their heights within 2e-3, and that points near -1 read a centre of -0.5 within 2e-3. It repeats the readback on the CPU path (`?orbit3dSampler=cpu`) with the same assertions.

4. **The sheets carry it too.** `--grep 'hierarchy: sheet'` opens hybrid geometry at surface opacity 1, reads the surface mesh's per-vertex centre buffer for vertices over c within half a cell of -1.3, and asserts the four rank centres are the two pair means (each twice) within 2e-3, while over c = -1 both ranks read -0.5 within 2e-3.

5. **Colour follows the parent distance, and nothing else moved.** `--grep 'hierarchy: colour'` feeds `probeShaderColours` with the production sampler's heights and per-sample centres for the period-4 cell at c = -1.3 and the period-2 cell at c = -1, at bands 1.5 and phase 0: each period-4 branch's colour equals the palette at `spreadPaletteCoordinate(height, parent, 1.5, 0)` within 2/255 per channel, and the two branches of each pair match each other; the period-2 branches both read the palette at `spreadPaletteCoordinate(0.5 distance)` as before. The existing "spread", "chaotic" and "phase and ground" tests pass unedited in substance, and the interior ground under c = -1.3 still reads `fract(bands * spread - phase)` from the column spread.

6. **Prebaked derive and cost.** `prebakedCentre.test.cjs` covers a period-4 and a period-6 cell with 64 baked samples (parents from `cycleHierarchy`), a period-2 cell (both centres -0.5), a chaotic cell (window mean) and a period above the sample count (window mean), and passes under `npm test`. `--grep 'hierarchy: cost'` records cloud build time and the attraction field build time, three matched samples each, against the card 103 tree served on port 5174: both within 20% of the baseline (plus the test's existing absolute slack); render time is unchanged by construction and is recorded. A sustained regression above 20% needs an explanation and verifier approval, never a hidden quality reduction.

7. **Evidence for the operator.** `--grep 'hierarchy: evidence'` saves ordered time sequences (at least four frames, forward then reverse, palette, bands and camera fixed) under `e2e/artifacts/hierarchical-centre/` for: a real-axis pose framing the period-2, period-4 and period-8 bulbs (c from about -1.42 to -1.2), in cloud and in hybrid geometry; the "Bifurcation curtain" preset; and a pose over the period-6 satellite of the period-2 bulb near c = -1.14 + 0.245i. It asserts from production values that forward and reverse move a fixed-distance colour in opposite directions. The verifier opens the sequences and records, with literal paths, whether bands leave the period-4 and period-8 bulbs at their own roots in forward mode (rather than continuing the period-2 bands), whether the period-2 bulb and the cardioid look as before, and whether the chaotic band still carries colour. Whether the result looks good is the operator's judgement and is not a criterion.

## Contract test

- **Test file:** src/app/orbitHierarchy.contract.test.cjs
- **Assertions digest:** `sha256:48ce1581670a687fdb79b2bfdc692bf543ded97a7ad6f516b44e2bdc01b38021`

The frozen block fixes the rule on reference cycles the test iterates itself (period-doubled cycles pick s = 2 and the pair means, the one-third satellite picks s = 3, prime primary bulbs and period 2 keep the column mean, period 1 reads its own height) and the CPU oracle's per-sample centre at c = -1.3, -1 and -1.9. It does not cover the GPU path, the cloud, the sheets, the prebaked derive or the render; criteria 2 to 7 remain mandatory.

## Authoring verification

On dev at `fad66fdaf`, 2026-10-06, with the stub module and the frozen test committed: `npm run verify` passes (408 tests, 390 pass, 18 skipped, 0 fail). `ORBIT_HIERARCHY=1 node --test src/app/orbitHierarchy.contract.test.cjs` fails all 4: three with `card 104: cycleHierarchy is not implemented` after their reference-cycle assertions pass (periods 4, 4, 8, 6, 3, 2 and 1 detected as expected), and the oracle test with `c = -1.3 sample 0 0 is not within 0.001 of -1.2241`, so the shipped oracle returns period 4 there and no per-sample centre. The numbers in the Objective come from an independent float64 iteration at authoring: at c = -1.26 the four heights are -1.2447, 0.2892, -1.1764, 0.1239 (column mean -0.5020; distances 0.74, 0.79, 0.67, 0.63; pair means -1.2105 and 0.2065), and at c = -1.24 the period-2 pair sits 0.70 from -0.5.

## Out of scope

- Changing the ground's scalar, smoothing centres across columns, a new bake format, or any default change.
- Card 103's layout, the surface mesh geometry, the camera, palettes, other simulations, public interface changes, release or deployment.

## Budget

- **Worker wall-clock:** 1440 minutes (operator 2026-10-06: no timebox; provider session limits bound spend)
- **Verifier wall-clock:** 1440 minutes (operator 2026-10-06: no timebox; provider session limits bound spend)
- Planning evidence, `state/cost-log.jsonl` read 2026-10-06: worker median 2.7M tokens, p95 14.4M; verifier median 2.0M, p95 6.7M. Plan 5M for the worker and 4M for the verifier; one p95 outlier on each side brings the pair to about 21M. With card 103's plan the two cards sit at about 42M against the 130M resting cap. Serial, gated on 103.
- Stop with an explicit partial result if the timebox cannot cover the remaining checks. A retry needs a re-brief.

## Dispatch envelope

Worker returns changed paths, commands with results, the GPU mechanism, measured costs, evidence paths and unresolved criteria in `state/envelopes/104-logistic-mandelbrot-hierarchical-centre.json` using the current dispatch template, written as the final action of the last turn. A partial result with a written envelope is better than none.

Verifier writes the schema-valid `state/verifiers/104-logistic-mandelbrot-hierarchical-centre.json` with one result and literal evidence paths per numbered criterion. Overall PASS requires all seven.

## Family-specific notes

Both roles use the repo's subscription CLI routes; do not change auth routing to work around quota or browser failures. The codex worker runs under the widened sandbox `Requires GUI: true` grants and launches headless Chromium through Playwright with the repo's GPU flags (`playwright.config.ts`); redirect stdin from `/dev/null` for any non-interactive subcommand. The Claude verifier needs no widening.

## Re-brief 1 (2026-10-07, attempt 2)

Attempt 1 (Astra) was stopped after about ten minutes by the operator's Codex
quota guard, not by a fault in the work: the Codex five-hour window reached
97%. Its tree is preserved at `75f4c241b8039db0d6146d0677ac58aa155b59c3` on
`wip/104-logistic-mandelbrot-hierarchical-centre-attempt-1`, unverified.
Its parent is `b6a4f9c6d`, so it already sits on card 103's packed layout.

Attempt 2 instructions, in addition to everything above:

1. Start from the preserved work: `git checkout 75f4c241b8039db0d6146d0677ac58aa155b59c3 -- .`
   in the run worktree, then restore this card to HEAD
   (`git checkout HEAD -- docs/stages/104-logistic-mandelbrot-hierarchical-centre.md`).
   Review the diff against `b6a4f9c6d` rather than re-deriving it.
2. Regenerate all evidence; do not cite attempt-1 paths.
3. Spend economically. The Codex window is the binding limit on this card:
   read files by range, avoid re-reading, and do not dump full logs. Write the
   dispatch envelope as the final action; a partial result with an envelope
   is better than none.

## Re-brief 2 (2026-10-07, attempt 3)

Attempt 2 was again stopped by the operator's Codex quota guard (five-hour
window at 91%), not by a fault in the work. Its tree is preserved at
`28d588c134d59b5264ced9d16ff31b091d4d8c0a` on
`wip/104-logistic-mandelbrot-hierarchical-centre-attempt-2`, unverified.

Attempt 3 instructions, in addition to everything above and Re-brief 1:
start from `git checkout 28d588c134d59b5264ced9d16ff31b091d4d8c0a -- .`, restore
this card to HEAD, review the diff against `75f4c241b` rather than
re-deriving it, and keep to Re-brief 1's economy rule. If the window is
likely to run out before the criteria are all checked, write a partial
envelope naming what is left rather than stopping without one.

## Re-brief 3 (2026-10-07, attempt 4)

Attempt 3 was stopped by the Codex quota guard (five-hour window at 91%)
after about sixteen minutes. Its tree is preserved at
`909dacedc0e27b91de87f5e39bc08db1d6756c77` on
`wip/104-logistic-mandelbrot-hierarchical-centre-attempt-3`, unverified.
Start from `git checkout 909dacedc0e27b91de87f5e39bc08db1d6756c77 -- .`,
restore this card to HEAD, review the diff against `28d588c13`, and follow
Re-briefs 1 and 2.
