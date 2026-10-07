# Stage card 106-logistic-mandelbrot-tail-refinement-default: ship Tail refinement at its maximum, and let a moved default reach returning visitors

## Metadata

- **Authored:** 2026-10-07
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/106-logistic-mandelbrot-tail-refinement-default
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** stage-completed: 105-logistic-mandelbrot-second-refinement-level
- **Dispatch:** serial
- **Pairing rationale:** a bounded, mechanical brief (one default, one persistence rule behind a frozen contract, harness updates and measurements) suits the Codex frontier tier at a fraction of a Fable card's cost; Sol has driven this repo's Playwright harness before (card 102). Opus 5.5 verifies across the family boundary with the browser evidence in hand, as it did for card 102. The worker family alternates with cards 105 and 107 (Fable), so adjacent stages draw on different provider windows. Astra is not seated: on card 104 its spend per minute was too high for an unattended run. `Requires GUI` widens the codex worker seat so it can launch Chromium.

## Objective

Card 105 made the Tail refinement slider spend a budget, level 1 first and level 2 with the remainder. The operator has decided that the shipped default is the slider's maximum, 0.6. Two things stand between that decision and a visitor:

1. The kernel default is 0 (`src/sims/logistic-mandelbrot/kernel.ts`).
2. The values a returning browser remembers are applied over the defaults, and today the control panel stores every parameter (`saveValues(this.slug, this.params)` in `src/app/controls.ts`), so a visitor who never touched the slider keeps the 0 their first visit stored until they press Reset. The same defect hid the Inside-out, band-count and edge-glow defaults of 2026-10-06 from returning visitors.

After this card: the default is 0.6; the stored blob carries a format marker (`__format: 2`) and only the values that differ from the kernel defaults, so a later default change reaches every visitor who did not choose otherwise; a legacy blob (no marker) whose `tailRefinement` is 0 is treated as not having set it, and everything else in a legacy blob is kept; and the CPU fallback keeps spending the automatic share, 0.3, at every setting above 0, so this card changes nothing for a machine without WebGL2 (card 94 chose that share for cost; two levels at 0.6 would make the fallback's build several times longer). The build itself does not change: at Tail refinement 0.6, boundary detail 1 and `extreme`, the tree under test builds exactly what the served baseline builds at the same explicit settings.

The desktop default preset is `extreme` (`src/app/qualityProfiles.ts`), so this card changes what a desktop visitor sees and pays. The card measures the cost at the shipped defaults against the old default and the audit recommends whether 0.6 should stay; the operator decides. A PASS lands on `dev`, not on `main`, the labs deployment or the public mirror.

## Inputs (read these in your own context)

- `AGENTS.md`, `docs/INTERFACE.md` (read "Testing a pure src/app module")
- `src/app/paramPersistence.ts` (the stub this card implements), `src/app/paramPersistence.contract.test.cjs` (frozen)
- `src/app/persistence.ts` (`loadValues`, `saveValues`, `clearValues`, about 99-137), `src/app/controls.ts` (the two `saveValues` call sites, about 296-303 and 1055-1059; `restorePersistedParams`, about 1296-1340; the Reset handler, search for "Reset to defaults")
- `src/sims/logistic-mandelbrot/kernel.ts` (the `tailRefinement` descriptor, about 165-180), `src/app/orbitRefinement.ts`, `src/app/orbitRefinement.test.cjs`
- `src/app/qualityProfiles.ts` (about 88-110, the desktop default preset)
- `e2e/harness/insideOut.ts` (`frozenParams`, `openSim`, `setParam`, `paramSnapshot`), `e2e/harness/packedCells.ts` (`openPacked`, `cloudStats`, `screenshot`, `meanLuma`), `e2e/packed-cells.spec.ts` (the cost test, about 479-620: the timing helper and matched sampling), `e2e/palette-sweep.spec.ts` (`openSim`, about 61-70), `e2e/inside-out-cycling.spec.ts` (the `measure` helper, about 965-975; the hierarchy tests that pass `tailRefinement: 0`, about 1190-1215), `e2e/inside-out-cycling.contract.spec.ts` (read only, frozen)
- `e2e/refine-levels.spec.ts` and the helpers card 105 added under `e2e/harness/` (its CPU budget expectation and any storage injection)
- `docs/audits/105-second-refinement-level.md` (the cost table and the default recommendation), `docs/audits/103-packed-cells.md` "Cost" (the timing helper), `docs/audits/100-inside-out-spread-colouring.md` "Serving the baseline" (the recipe for serving the unchanged tree on port 5174 from a detached tmux session)
- `README.md` and `src/app/about.ts`: search for "Tail refinement" and "tailRefinement"
- `playwright.config.ts`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/app/paramPersistence.ts`: implement the stub so the frozen block passes. `encodeStoredValues(params, schema)`: an object whose first key is `__format` with value 2, followed by each schema descriptor's key, in schema order, whose value in `params` is defined and differs (`!==`) from the descriptor's `default`; a descriptor without a default stores any defined value; keys the schema does not name are dropped. `isLegacyStoredValues(stored)`: true unless `stored.__format === 2`. `migrateLegacyStoredValues(stored, retiredDefaults)`: for a legacy blob, a new object without the keys whose value `===` the retired default for that key; for a blob with the current marker, an equal shallow copy; the input is never mutated. `RETIRED_DEFAULTS` is exactly `{ "logistic-mandelbrot": { tailRefinement: 0 } }`.

2. `src/app/controls.ts`: both save sites store `encodeStoredValues(this.params, this.paramSchema)`; `restorePersistedParams` applies `migrateLegacyStoredValues(loaded, RETIRED_DEFAULTS[slug] ?? {})` to a legacy blob before applying values, and never treats the marker as a parameter; Reset still clears the blob (`clearValues`). `src/app/persistence.ts` and the other storage keys (`el:resolution`, `el:bounds`, `el:sections`) are unchanged.

3. `src/sims/logistic-mandelbrot/kernel.ts`: `tailRefinement` default 0.6; its `info` says the default is the maximum, that 0 turns refinement off on the GPU path, and that the CPU fallback spends the automatic share (0.3) at any setting above 0. `src/app/orbitRefinement.ts`: when the GPU sampler is unavailable, a finite setting above 0 resolves to `Math.min(setting, REFINE_BUDGET_FRACTION)`; 0 still resolves to `REFINE_BUDGET_FRACTION`; the GPU path and the real-slice rule are unchanged. Update `src/app/orbitRefinement.test.cjs` for the capped rule and add the 0.6-on-CPU case. No other default changes.

4. Harness: `frozenParams` in `e2e/harness/insideOut.ts` pins `tailRefinement: 0` as it pins `cycleBands`, so every existing suite keeps the settings it was written against. Every e2e injection of `el:values:<slug>` outside a frozen contract block writes the blob with the marker (`__format: 2`): `openPacked` in `e2e/harness/packedCells.ts`, `openSim` in `e2e/harness/insideOut.ts`, `openSim` in `e2e/palette-sweep.spec.ts`, the `measure` helper in `e2e/inside-out-cycling.spec.ts`, and any injection card 105 added under `e2e/`. The served baseline ignores the marker as an unknown key, so the comparison suites keep working on both origins. Frozen contract blocks are not edited; `e2e/inside-out-cycling.contract.spec.ts` injects no Tail refinement value and needs no change. In `e2e/refine-levels.spec.ts`, the CPU-path expectation for `data-orbit3d-refine-row-budget` changes to the capped rule (`t = 0.3` at settings 0 and 0.6, `0.3` at 0.3); every other assertion in that suite stays as card 105 left it, and the audit names the lines changed.

5. `e2e/tail-default.spec.ts` (new), with helpers under `e2e/harness/` if needed: the tests criteria 2 to 6 name, using the `--grep` names given. Comparisons against the served baseline follow card 103's matched-sample method.

6. `docs/audits/106-tail-refinement-default.md` (new): the rules as built (storage format, migration, CPU cap); each criterion's result with literal evidence paths under git-ignored `e2e/artifacts/tail-default/`; the cost table of criterion 5 in three columns (tree under test at its default; served baseline at explicit 0.6; served baseline at its own default 0) with the display-frame pacing each GPU frame time implies on this machine; a recommendation on whether 0.6 should stay the desktop default, with the measurements behind it; unresolved limitations.

7. `README.md` and `src/app/about.ts`: any prose that states the Tail refinement default or the CPU rule is updated; nothing else in them changes.

Supporting changes are allowed only where these deliverables need them: `tsconfig.test.json`, `e2e/harness/*.ts`.

## Constraints

- The frozen block in `src/app/paramPersistence.contract.test.cjs` is not edited, and neither are the frozen blocks in `src/app/orbitRefineLevels.contract.test.cjs`, `src/app/orbitPacking.contract.test.cjs`, `src/app/orbitHierarchy.contract.test.cjs` and `e2e/inside-out-cycling.contract.spec.ts`.
- The builders, the planner, the packed layout, the shader contract, colouring, the surface mesh, the camera, palettes, the tone map, the resolution presets and every default other than `tailRefinement` are unchanged. The point budget is never exceeded.
- No expected value is fed into the production path that is meant to produce it. The legacy blob of criterion 3 is captured from the served baseline, not typed from memory.
- The public `SimKernel` contract in `docs/INTERFACE.md` and every other simulation are unchanged (the persistence change is in `src/app`, shared by every sim, and must not alter what any other sim restores from a blob that carries no retired default).
- Run every command in the foreground and wait for it to exit. Never use `run_in_background`, `&`, `nohup` or a monitor, and never end a turn while a command is outstanding; the baseline server runs in a detached tmux session as the audit 100 recipe shows. Keep context lean: read large files by range and do not dump full logs. Write the dispatch envelope as the final action; a partial result with an envelope is better than none.
- Browser checks run headless by default with the repo's GPU flags; go headed only for criterion 5's display-link interval, and batch those into one launch. Use port 5173 for the tree under test and 5174 for the served baseline (`--strictPort`).
- No new packages, no commits by the worker, no queue mutations, no deployment.

## Acceptance criteria

The Opus verifier runs every command independently in the run worktree and judges all rows. A changing attribute or a green build alone cannot satisfy a rendered criterion. No required suite may pass with zero collected tests. Where a criterion names the served baseline, the unchanged tree is the dispatch base (`dev` as cut), served on port 5174 by the audit 100 recipe; a missing baseline fails that criterion.

1. **Regression and frozen contracts.** `npm run verify`; `scripts/check-contract-test-gate.sh --worktree` exits 0; `npm run build:test && PARAM_PERSISTENCE=1 node --test src/app/paramPersistence.contract.test.cjs` (6 pass, 0 fail, 0 skipped); `ORBIT_LEVELS=1 node --test src/app/orbitRefineLevels.contract.test.cjs` (6 pass); `ORBIT_PACKING=1 node --test src/app/orbitPacking.contract.test.cjs` (7 pass); `ORBIT_HIERARCHY=1 node --test src/app/orbitHierarchy.contract.test.cjs` (4 pass); `INSIDE_OUT_CYCLING=1 npx playwright test e2e/inside-out-cycling.contract.spec.ts --workers=1` (4 pass); `npx playwright test e2e/smoke.spec.ts --grep 'logistic-Mandelbrot|Logistic Mandelbrot|cyclic Magma|orbit camera' --workers=1`; and with the baseline served: `npx playwright test e2e/packed-cells.spec.ts --workers=1`, `npx playwright test e2e/refine-levels.spec.ts --workers=1`, and `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'spread|chaotic|controls and cache|hierarchy' --workers=1`. Before implementing, run the `PARAM_PERSISTENCE=1` command on the unchanged tree and keep its result (6 tests, 1 pass, 5 fail) as the red baseline.

2. **The shipped default is the maximum, and the build is the same build.** `npx playwright test e2e/tail-default.spec.ts --grep 'default' --workers=1`, GPU path, `el:resolution:logistic-mandelbrot` set to `extreme`. (a) With `el:values:logistic-mandelbrot` absent: `paramSnapshot` reads `tailRefinement` "0.6" and `boundaryDetail` "1"; the kernel descriptor read from `/src/sims/logistic-mandelbrot/kernel.ts` through `page.evaluate` import has `default` 0.6 and `max` 0.6; after "Reset to defaults" the snapshot still reads "0.6". (b) With a marked blob that pins the camera and animation (`__format: 2`, `autoRotate: false`, `continuousSpin: false`, `cascadeReveal: false`, `realAxisSweep: false`, `cycleSpeed: 0`) and no `tailRefinement` key on the tree under test, against the same blob plus `tailRefinement: 0.6` on the served baseline (the baseline ignores the marker): `data-orbit3d-points`, `-base-cells`, `-refined-l1-sub-cells`, `-refined-l2-sub-cells`, `-refined-sub-cells`, `-slots` and `-refine-row-budget` are equal exactly, and the frame mean luminance at the default view is within 1% of the baseline's, three matched samples each, same browser and machine.

3. **A returning visitor gets the new default, and choices survive.** `--grep 'legacy'`, GPU path at `balanced` so the builds stay short. (a) Capture a legacy blob from the served baseline: open it with no stored values, set Colour bands to 1.5 through the control (`setParam`), read the stored `el:values:logistic-mandelbrot` string, and assert it holds `tailRefinement: 0` and no `__format` key; inject that string unchanged on the tree under test: after load the snapshot reads `tailRefinement` "0.6" and `cycleBands` "1.5". (b) A legacy blob with `tailRefinement: 0.3`: reads "0.3". (c) A marked blob `{ "__format": 2, "tailRefinement": 0 }`: reads "0" (an explicit choice of off survives). (d) After changing exactly one control on the tree under test from a clean start, the stored string parses to an object whose `__format` is 2 and whose keys are exactly the marker and that control's key, and whose value for it differs from the kernel default. (e) After "Reset to defaults" the stored string is null and the snapshot reads the kernel defaults.

4. **The CPU fallback keeps its share.** `--grep 'cpu'`, `?orbit3dSampler=cpu`, `balanced`, `boundaryDetail: 0`, camera pinned: with no `tailRefinement` key (the default) and at explicit 0.3 and 0.6, `data-orbit3d-refine-row-budget` equals `floor(data-orbit3d-point-budget * 0.3)`; at 0.1 it equals `floor(data-orbit3d-point-budget * 0.1)`; `data-orbit3d-base-cells` is the same across these within 0.5%; `data-orbit3d-points` never exceeds `data-orbit3d-point-budget`; and the build wall-clock at the default is within 20% of the served baseline's at its own default (0, which resolves to 0.3 there), median of three matched samples each.

5. **Cost at the shipped defaults, for the operator.** `--grep 'cost'`, GPU `extreme`, boundary detail 1, camera pinned, with card 103's timing helper, three matched samples each: cloud build wall-clock to `data-orbit3d-build="complete"`, GPU frame time where `EXT_disjoint_timer_query_webgl2` is available, the headed display-link `requestAnimationFrame` interval, `data-orbit3d-build-bytes` and `data-orbit3d-points`, on the tree under test at its default (no `tailRefinement` key), on the served baseline at explicit 0.6, and on the served baseline at its own default. The test asserts only that the tree under test and the baseline at explicit 0.6 agree: build and GPU frame time within 10% (medians), bytes and points equal. The third column is recorded, not judged; the audit states what the new default costs against the old one and whether the GPU frame time crosses a 16.7 ms display frame on this machine.

6. **Evidence for the operator.** `--grep 'evidence'` saves under `e2e/artifacts/tail-default/` screenshots at the default view, camera pinned, on the tree under test at its default and on the served baseline at its old default and at explicit 0.6, and the card 104 real-axis pose (zoom to c = -1.36 at height 0.2, then the per-view drag) on the tree under test at its default and the baseline at its old default. The verifier opens them and records, with literal paths, whether the cascade tails are visibly denser at the new default than at the old one and whether the plane shows gaps. Whether the result looks good is the operator's judgement and is not a criterion.

Run the whole new spec once as well: `npx playwright test e2e/tail-default.spec.ts --workers=1`.

## Contract test

- **Test file:** src/app/paramPersistence.contract.test.cjs
- **Assertions digest:** `sha256:53f219df7948d3e22165319c34784784562963c36cb65dd055ecaa56bf8f7b42`

The frozen block fixes the pure rules: the marker, what a stored blob holds, which blobs are legacy, what a legacy migration drops and keeps, and the one retired default. It does not cover the control panel wiring, the kernel default, the CPU rule, the harness or the measurements; criteria 2 to 6 remain mandatory.

## Authoring verification

On dev at `5b7e7806c`, 2026-10-07, with the stub module and the frozen test in the working tree: `npm test` passes (425 tests, 392 pass, 33 skipped, 0 fail). `PARAM_PERSISTENCE=1 node --test src/app/paramPersistence.contract.test.cjs` runs 6 tests, 1 pass, 5 fail: the three helpers throw `card 106: ... is not implemented` and only the retired-defaults constant, which the stub already carries, passes. A throwaway reference implementation of the three helpers, written to the Deliverable 1 rules and not committed, passes all 6. The persistence call sites, the e2e injection points and the frozen contract spec's injected blob were read at authoring; the blob in the frozen spec carries no `tailRefinement`, so the migration leaves it untouched.

## Out of scope

- Any default other than `tailRefinement`, including the resolution preset (card 107 widens the `extreme` pool).
- The builders, the planner and the second refinement level (card 105).
- Migrating legacy blobs of other simulations; `RETIRED_DEFAULTS` carries one entry.
- The baker, the bake format, deployment, `main`, the labs build and the public mirror.

## Budget

- **Worker wall-clock:** 240 minutes
- **Verifier wall-clock:** 120 minutes
- Planning evidence: card 102's Sol worker spent 16.9M tokens over two hours on a sweep; this card is mechanical with short builds at `balanced` and three `extreme` cost samples: plan 6M for the worker and 3M for the Opus verifier (card 102's Opus verifier used 1.8M). Serial.
- Stop with an explicit partial result if the remaining checks cannot be covered. A retry needs a re-brief.

## Verification

Verifier writes the schema-valid `state/verifiers/106-logistic-mandelbrot-tail-refinement-default.json` with one result and literal evidence paths per numbered criterion. Overall PASS requires all six.

## Family-specific notes

Both roles use the repo's subscription CLI routes; do not change auth routing to work around a refusal or a browser failure. Headless Chromium needs the repo's existing GPU flags for WebGL2 (`playwright.config.ts`); `Requires GUI: true` widens the codex worker seat so it can launch the browser. The Claude verifier takes the CLI transport (`.autometta.local.yaml`) and runs browser checks headless through Playwright with the same config.
