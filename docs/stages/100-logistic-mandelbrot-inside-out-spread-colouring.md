# Stage card 100-logistic-mandelbrot-inside-out-spread-colouring: colour Inside-out by distance from each column's mean height

## Metadata

- **Authored:** 2026-10-02
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/100-logistic-mandelbrot-inside-out-spread-colouring
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** stage-completed: 99-logistic-mandelbrot-orbit-spread-analysis
- **Dispatch:** serial
- **Pairing rationale:** the operator asked for Anthropic allowance to carry the work and OpenAI to validate. Fable 5.1 implemented stage 98's Inside-out path and works the bounded change to it here, with every numerical decision fixed in advance by card 99's audit. Sol verifies across the family boundary, running the production shader and sampler checks and the browser evidence itself. Serial: this card and card 99 share no files, but it reads what 99 writes.

## Objective

Rebuild Logistic Mandelbrot's Inside-out colour mode on the orbit-spread scalar the operator chose on 2026-10-02: each point reads the palette at `fract(bands * |Re(z) - h0(c)| - phase)`, where h0(c) is the mean height of the orbit at that c. Colour bands leave each column's centre height and travel outwards, up and down, along the sheets. The chaotic band takes colour instead of stage 98's steady grey. Defaults do not change.

## Inputs (read these in your own context)

- `AGENTS.md`, `docs/INTERFACE.md`
- `docs/audits/2026-10-02-orbit-spread-colouring.md`: read `## Decisions for the implementation card` first, then sections A, B, E and G as needed. Its decisions are this card's numbers.
- `docs/audits/98-inside-out-cycling.md`, "Numerical method": how the current mode is wired (attraction field texture, ground compositing, cache keys)
- `src/app/orbitColour.ts`, `src/app/orbitColour.test.cjs`
- `src/app/orbitSpread.contract.test.cjs` (frozen)
- `src/sims/logistic-mandelbrot/model.ts`: `sampleAttractorCell`, `AttractorCellMeasure`
- `src/app/orbitSampler.ts`: period shader, metadata target, CPU packing
- `src/app/orbit3d.ts`: the `u_colourMode == 1` branches of the point and surface shaders, the ground shader's `u_interiorField == 2` branch, attribute plumbing for `a_interior`. Read by range; the file is 4,300 lines.
- `src/app/webglRenderer.ts`: `ensureOrbit3dAttractionField`, `ensureOrbit3dGround`, `palettePhase`. Read by range.
- `src/sims/logistic-mandelbrot/kernel.ts`: `colourMode` and `cycleBands` info strings
- `e2e/inside-out-cycling.spec.ts`, `e2e/harness/insideOut.ts`, `e2e/inside-out-cycling.contract.spec.ts` (frozen)
- `essays/logistic-mandelbrot.md`

## Deliverables

1. `src/sims/logistic-mandelbrot/model.ts`: `AttractorCellMeasure` gains `centre` and `spread`. For a cell with detected period q, `centre` is the mean of Re(z) over exactly one cycle of q iterates and `spread` is the RMS deviation about it over that cycle. For a bounded cell with no detected period, both come from 1024 iterates after the warmup. Plotted samples, period, escape classification and `interior` are unchanged.
2. `src/app/orbitSampler.ts`: the GPU path computes the same two values per cell and carries them to the renderer. The audit records that metadata channel w is free and channel z holds the escape flag; choose between moving the escape flag into the period channel and adding a render target, and record the choice and its measured cost.
3. `src/app/orbitColour.ts`: export `spreadPaletteCoordinate(height, centre, bands, phase)` and its GLSL twin, spliced into every shader that uses it so there is one definition. Remove what stage 98 left that nothing uses any more.
4. `src/app/orbit3d.ts` and `src/app/webglRenderer.ts`: Inside-out points and hybrid sheets read the palette at the spread coordinate of their own height. Bounded cells with no detected period are coloured the same way; the steady neutral is gone from this mode. The interior ground reads `fract(bands * spread(c) - phase)` from a cached per-cell field; escaped ground keeps escape-time colouring. Cache rules are stage 98's: rebuild numerical data only when domain or sampling inputs change, never for time, palette, reverse, exposure or bands; release replaced resources.
5. `e2e/inside-out-cycling.spec.ts`, `e2e/harness/insideOut.ts`, `src/app/orbitColour.test.cjs`: retire or rewrite the stage 98 tests the audit's section G lists as contradicted, and add the tests criteria 2 to 7 name. Tests the audit lists as still holding must still pass unedited in substance.
6. `src/sims/logistic-mandelbrot/kernel.ts` and `essays/logistic-mandelbrot.md`: describe the mode as it now is. `cycleBands` in this mode is palette laps per unit of height distance from the column's centre. Say plainly that a period-1 sheet sits at distance zero and so takes one colour that changes with the phase.
7. `docs/audits/100-inside-out-spread-colouring.md` (new): what was built, the channel decision, measured CPU/GPU agreement, sampler and render cost against the unchanged baseline, each criterion's result with literal evidence paths under git-ignored `e2e/artifacts/inside-out-spread/`, and unresolved limitations.

Supporting changes are allowed only where these deliverables need them: `src/app/simView.ts`, `src/app/controls.ts`, `tsconfig.test.json`, `src/sims/logistic-mandelbrot/kernel.test.cjs`, `src/sims/logistic-mandelbrot/gpu-parity.test.cjs`.

## Constraints

- The formula, the mean centre and the absolute (mirrored) distance are the operator's decisions. Do not substitute another scalar, add a multiplier term, or clamp the distance.
- Estimator, iterate count, band meaning, ground scalar and the treatment of escaped cells come from card 99's audit decisions 1 to 5. If the implementation shows one of them to be wrong, stop and report it in the envelope; do not improvise a replacement.
- Keep every default: colour mode `cycle`, Magma (cyclic), gamma 1.65, contrast 2.4, speed 0.1, `cycleBands` 1.5. The `inside-out` enum value stays valid.
- Cycle, Period and Mono render exactly as before. Do not change orbit geometry, camera, refinement, warmup or sample defaults, tone mapping, or any other simulation.
- Reverse changes the phase direction once and nothing else. At speed zero the phase is zero and the colour is still.
- Escaped cells are identified by the escape flag, never by their centre (a zero-filled window reads centre 0).
- Do not change the reviewed `SimKernel` contract shape in `docs/INTERFACE.md`. `AttractorCellMeasure` and renderer-internal texture layouts are internal. If the public contract must change, stop and request a separate versioned card.
- Both frozen contract files stay byte-identical between their markers: `src/app/orbitSpread.contract.test.cjs` and `e2e/inside-out-cycling.contract.spec.ts`. `e2e/harness/frame.ts` metric helpers are not weakened.
- No expected value may be fed into the production path that is meant to produce it. Probes read real shader inputs and outputs.
- Run every command in the foreground and wait for it to exit. Never use `run_in_background`, `&`, `nohup` or a monitor, and never end a turn while a command is outstanding. Keep context lean: read large files by range and do not dump full logs.
- No new packages, no commits by the worker, no queue mutations, no deployment.

## Acceptance criteria

The Sol verifier runs every command independently in the run worktree and judges all rows. A changing uniform or a green build alone cannot satisfy a rendered criterion. No required suite may pass with zero collected tests.

1. **Regression and frozen contracts.** `npm run verify`; `scripts/check-contract-test-gate.sh --worktree`; `npm run build:test && ORBIT_SPREAD=1 node --test src/app/orbitSpread.contract.test.cjs` (7 pass, 0 skipped, 0 fail); `INSIDE_OUT_CYCLING=1 npx playwright test e2e/inside-out-cycling.contract.spec.ts --workers=1` (4 pass); `npx playwright test e2e/smoke.spec.ts --grep 'logistic-Mandelbrot|cyclic Magma|Magma|magma' --workers=1`. Before implementing, run the `ORBIT_SPREAD=1` command on the unchanged tree and keep its failures as the red baseline.
2. **CPU and GPU agree on the centre.** `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'centre' --workers=1` reads centre and spread from the production GPU sampler at c = 0, -0.5, -1, -0.8 and the period-3 bulb centre, each within 1e-3 of the closed form or of an independent float64 one-cycle mean, and at c = -1.9 within 0.1 of a 10^6-iterate float64 reference. c = 1 reads escaped.
3. **Colour follows distance from the centre, mirrored.** `--grep 'spread'` runs the production point and surface shaders on controlled geometry and reads palette colour before lighting: it equals the palette at `spreadPaletteCoordinate` within 2/255 per channel; two points equally far above and below one centre match; changing the distance changes the coordinate; shifting height and centre together does not. In the real route the two sheets over c = -1 share a hue.
4. **Phase, reversal and ground.** `--grep 'phase and ground'` checks production renders at phases 0, 0.25, 0.5 and 1 in both directions for cloud, hybrid and interior ground. Phase 0 and 1 agree. Interior ground follows `fract(bands * spread - phase)` within 2/255, read at actual texel centres; under a period-1 cell it equals the palette at `fract(-phase)`. Exterior ground still depends on smooth escape time.
5. **The chaotic band is coloured.** `--grep 'chaotic'` shows that bounded cells with no detected period produce palette colours that vary with height and with phase in the point shader, and that no Inside-out pixel source is the old neutral constant.
6. **Controls, cache and cost.** `--grep 'controls and cache'` selects Inside-out through the controls, changes speed, reverses, changes palette and bands, switches geometry, returns to Cycle and resets: no point-cloud or field rebuild for colour-only changes, no console or WebGL error, defaults restored. Record cloud build time, field build time and warm render time against the unchanged baseline on the same browser and machine, three matched samples each. Card 99 predicts about 4.4% more sampler iterations. A sustained regression above 20% in build or render time needs an explanation and verifier approval, never a hidden quality reduction; a missing baseline fails the test.
7. **Evidence for the operator.** `--grep 'direction of travel'` saves ordered time sequences (at least four frames, forward then reverse, palette, bands and camera fixed) under `e2e/artifacts/inside-out-spread/` for: the default view in cloud and hybrid; the "Bifurcation curtain" preset; and a view showing the period-2 bulb with the ground. It asserts from production values that forward and reverse move a fixed-distance colour in opposite directions. The verifier opens the sequences and records, with literal paths, whether bands leave each column's centre height upward and downward in forward mode and return in reverse, whether the chaotic band carries colour, and whether the ground stays subdued. Whether the result looks good is the operator's judgement and is not a criterion.

Run the whole spec once as well: `npx playwright test e2e/inside-out-cycling.spec.ts --workers=1`.

## Contract test

- **Test file:** src/app/orbitSpread.contract.test.cjs
- **Assertions digest:** `sha256:c36f82c5b34c45cd3d88432045205ae688be04092d0c5c044aad5b414f750224`

The frozen block fixes the coordinate function and the CPU sampler's centre and spread at closed-form cells. It does not cover the GPU path, the shaders or the ground; criteria 2 to 7 remain mandatory.

## Authoring verification

On dev at `1b2ed1f47`, 2026-10-02, before card 99 landed (card 99 changed no production code): `npm test` collects the seven frozen tests and skips them (379 pass, 7 skipped, 0 fail). `ORBIT_SPREAD=1 node --test src/app/orbitSpread.contract.test.cjs` fails six of seven: `spreadPaletteCoordinate is not a function` twice, and `NaN is not within ...` for the centre at the period-1, period-2, period-3 and no-period cells. Each of those passed its period assertion first, so the periods the block expects (1, 2, 3, 0) are what the shipped sampler returns. The escaped-cell test passes. This is the intended red baseline.

The tolerances were checked against an independent float64 iteration at authoring: at c = -1.9 a 1024-iterate mean is within 0.005 of the 10^6 reference (tolerance 0.1), and at the period-3 centre the 8-sample plot-window mean is 0.033 away from the one-cycle mean (tolerance 0.001), so the block distinguishes the two estimators.

## Out of scope

- Making Inside-out the default; any palette, band or speed retune. The interestingness run that follows covers those.
- Smoothing or filtering the centre across neighbouring columns. The audit's crisis seams are recorded as a limitation, not repaired here.
- Lyapunov exponents, new geometry, raising the shipped sample count.
- Other simulations, public interface changes, release or deployment.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 60 minutes
- Planning evidence, `state/cost-log.jsonl` read 2026-10-02: stage 98, the nearest comparable, spent 21.2M (stalled attempt), 1.9M and 2.6M on the worker and 4.6M and 4.7M on the verifier. Plan about 12M for the pair; one stage-98-sized outlier brings it to about 33M, inside the repo's 130M resting daily cap. Serial.
- Stop with an explicit partial result if the timebox cannot cover the remaining checks. A retry needs a re-brief.

## Dispatch envelope

Worker returns changed paths, commands with results, the channel decision, measured costs, evidence paths and unresolved criteria in `state/envelopes/100-logistic-mandelbrot-inside-out-spread-colouring.json` using the current dispatch template, written as the final action of the last turn. A partial result with a written envelope is better than none.

Verifier writes the schema-valid `state/verifiers/100-logistic-mandelbrot-inside-out-spread-colouring.json` with one result and literal evidence paths per numbered criterion. Overall PASS requires all seven.

## Family-specific notes

Both roles use the repo's subscription CLI routes; do not change auth routing to work around quota or browser failures. Headless Chromium needs the repo's existing GPU flags for WebGL2 (`playwright.config.ts`); `Requires GUI: true` widens the codex seat so it can launch the browser.
