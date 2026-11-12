# Stage card 165-sandpile-device-pixel-fit: the sandpile opens one cell per device pixel with the pile fitted to the screen

## Metadata

- **Authored:** 2026-11-11
- **Orchestrator:** Claude Fable 5.2 <claude-fable-5-2@local>
- **Worker:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Verifier:** Claude Sonnet 5.5 <claude-sonnet-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/165-sandpile-device-pixel-fit
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Recovery attempt:** 1
- **Gate:** stage-completed: 164-sandpile-gpu-stepping
- **Dispatch:** serial
- **Pairing rationale:** the worker family alternates after card 164's Claude worker. The work is a default-grid change, one new kernel param with its control and presets, a pile-size rule, and performance work on the GPU pass card 164 built; the outcomes are pinned by a frozen contract with exact counts, so the Codex coding tier at high effort is the right worker, and it needs the browser for the thumbnail. The cross-family verifier is a Claude seat at high effort driving headless Chromium at a device-pixel ratio of 2, as for cards 158, 161 and 163; it reads the diff, runs the contract and measures the settle time. No frontier seat: the look is the operator's after landing.
- **Open decisions:** none
- **Decided:** by the operator on 2026-11-11. Asked how sharp the sandpile should open, given that sharper means more grains and a longer settle, they chose "Sharpest by default": one cell per device pixel, roughly 4 million grains on their Retina display, about a minute of watching it grow. Asked how the opening pile should be sized, they chose "Auto-fit to the screen": about 85 per cent of the short side, computed from the grid, with the Initial pile slider and the presets' fixed piles still available.

## Surfacing concern

After card 163 the sandpile opens on Mandala (2^18 grains, 375 cells across) at the Balanced grid, each cell about 1.8 CSS pixels, about 4 device pixels on the operator's Retina display: "I notice that the image is quite pixelated, can we work on that so we can have more defined images?" Definition needs more grains on a finer grid. Card 164 moved the stepping to the GPU, which makes that affordable.

Measured by the orchestrator on 2026-11-11 (headless Chromium, ANGLE Metal, Apple M2 Max, a throwaway WebGL2 page, stepping only, nothing presented): a settled pile is about 0.73 times the square root of its grain count across (375 at 2^18, 747 at 2^20, 1489 at 2^22) and needs about 0.19 synchronous rounds per grain (49,232 at 2^18, about 800,000 at 2^22). On a 2880 x 1800 grid a full-grid round ran at about 4,000 a second, so 2^22 grains took 203 s; with the pass scissored to an 1,601-cell square round the pile it ran at 11,700 a second and took 68 s. Small grids run about 30,000 rounds a second and are bound by draw calls, not by cells. So this card needs the pass limited to where the pile is, and it needs the rounds per frame held to what a frame can afford, or the page drops to a few frames a second.

The grid is set by `computeGridSize` in `src/app/renderer.ts`: CSS pixels times the profile's `computeScale`, capped by the Grid quality's cell budget (`RESOLUTION_TARGETS`: Balanced 640^2, Extreme 2560^2). Extreme is offered only for the logistic map today (`showExtremeResolution` in `src/app/simView.ts`), its label reads "Extreme (slowest, huge point cloud)", and it is a floor as well as a ceiling: a small window is scaled up to the budget. `qualityProfileFor` in `src/app/qualityProfiles.ts` already supports a default that assumes GPU stepping with a `cpuFallbackPreset`, as Gray-Scott uses.

After this card the frozen oracles of cards 163 and 164 go red in part under their own flags, as intended: 163's pins the kernel defaults, the Balanced grid and the thumbnail; 164's test 5 pins the Balanced opening and its test 7 pins the kernel file, the presets and the grid. 164's tests 1 to 4 and 6 must stay green.

## Objective

On a desktop with GPU stepping, a fresh load of the sandpile opens at one cell per device pixel with a pile sized to fill about 85 per cent of the grid's short side, and it settles in about a minute at a usable frame rate. Presets keep their fixed piles. The CPU fallback, tablets and phones keep the Balanced grid. The gallery thumbnail shows the fitted pile.

## Visual goal

Operator's words: "more defined images"; "Sharpest by default".

- Target: at 1440 x 900 on a Retina display with cleared storage, `#/abelian-sandpile` opens with Grid quality Extreme and "Fit pile to screen" on; a single pile grows from the centre and settles into the four-fold mandala filling about 85 per cent of the canvas height, with single-device-pixel cells and fine fractal detail that the Balanced grid could not show. It stays responsive while it grows.
- Failure: visible blocky cells on a Retina display; a pile that clips the canvas edge or fills under 80 per cent of the short side; a page that stutters at a few frames a second while settling; a settle beyond 150 s; a preset whose pile changed; a thumbnail of an unsettled or empty pile.

## Inputs (read these in your own context)

- `docs/stages/164-sandpile-gpu-stepping.md`
- `src/sims/abelian-sandpile/kernel.ts`
- `src/sims/abelian-sandpile/kernel.test.cjs`
- `src/app/webglRenderer.ts` (the sandpile wiring from card 164)
- `src/app/renderer.ts` (`computeGridSize`, `resolutionScale`, the step loop)
- `src/app/qualityProfiles.ts`
- `src/app/qualityProfiles.test.cjs`
- `src/app/simView.ts` (`showExtremeResolution`, the `cpuFallbackPreset` block)
- `src/app/controls.ts` (the Grid quality options, the boolean param control, preset selection and "Kernel default" matching, "Reset to defaults")
- `src/app/presets.ts`
- `scripts/generate-thumbnails.mjs`
- `e2e/sandpile-definition.contract.spec.ts`
- `e2e/sandpile-definition.config.ts`
- `e2e/sandpile-gpu.contract.spec.ts`

Card 164 creates three more files you must read once it has landed: the sandpile's model module beside its kernel, the GPU simulation module in the app directory, and the 2026-11-11 sandpile GPU write-up under the sweeps directory. Their paths are in card 164's deliverables.

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/sims/abelian-sandpile/model.ts`: export `sandpileFitPile(width: number, height: number): number`, exactly `Math.floor((0.85 * Math.min(width, height) / 0.73) ** 2)`. `sandpileRoundsPerStep` keeps its values.
2. `src/sims/abelian-sandpile/kernel.ts`: a fifth param after the existing four, `fitPile`, boolean, default `true`, label "Fit pile to screen", with an info line saying it sizes the opening pile to about 85 per cent of the view and that Initial pile applies when it is off. With it on, `init` drops `sandpileFitPile(width, height)` grains (the kernel may carry its own copy of the formula; it has no imports today) and ignores `initialPile`; with it off, behaviour is as today. The four existing defaults do not change. Update the "Topples per step" info to say that on the GPU it sets the rounds per step.
3. `src/sims/abelian-sandpile/kernel.test.cjs`: the schema test expects the fifth param; add a test that the default fits and that `fitPile: false` honours `initialPile`.
4. `src/app/sandpileGpu.ts` and, as needed, `src/app/webglRenderer.ts`: the GPU path honours `fitPile` identically. Limit each round to the cells that can hold grains (for example a scissor rectangle that tracks the pile and grows with it; it must also cover impulses and stay correct when the pile reaches the grid edge), and hold the rounds run per frame to what a frame can afford at large grids. `sandpileRoundsPerStep` stays the ceiling and stays exact wherever a frame is not over budget, so card 164's step-for-step tests keep passing at their small grids. Say in the envelope how the limit and the governor work.
5. `src/app/presets.ts`: each of the five sandpile presets gains `fitPile: false`; no other value changes.
6. `src/app/qualityProfiles.ts` and `src/app/qualityProfiles.test.cjs`: the sandpile's desktop default becomes Extreme with `cpuFallbackPreset` Balanced; tablet and phone stay Balanced with no fallback. No other sim's profile changes.
7. `src/app/renderer.ts`, `src/app/simView.ts`, `src/app/controls.ts`: for the sandpile at Extreme the grid is exactly the canvas's device-pixel size (`data-render-size` equals `data-display-size`), capped by the Extreme cell budget and the texture limit, and never scaled up past it (the floor behaviour stays for the logistic map only). The sandpile offers Extreme in Grid quality with a label that fits it, for example "Extreme (one cell per screen pixel)"; the logistic map's label is unchanged. The `fitPile` control shows as a checkbox; choosing any preset shows its fixed pile with fitting off; "Kernel default" and "Reset to defaults" show fitting on and Grid quality Extreme (Balanced on the CPU fallback).
8. `scripts/generate-thumbnails.mjs` only if the step count needs to change, and `public/thumbnails/abelian-sandpile.png` regenerated with `node scripts/generate-thumbnails.mjs`; then restore every other file in `public/thumbnails/` from `HEAD` so their bytes are unchanged. Say in the envelope how you confirmed the still is settled.
9. `docs/sweeps/2026-11-11-sandpile-gpu.md`: append a section with the measured settle time and frame rate of the fitted pile at a device-pixel ratio of 2, and of Sandstorm at the Extreme grid.

## Constraints

- Work from `dev` in the run worktree, after card 164 has landed; never push `main` or `publish`.
- Counts stay exact: the settled fitted pile holds exactly `sandpileFitPile(width, height)` grains and is four-fold symmetric; Mandala still settles to 262,144 grains, 375 cells across.
- The five presets keep their four existing values. No palette, colour-default, legend or glow change. No other sim's defaults, profile, grid behaviour, Grid quality options or thumbnail change.
- Card 164's contract tests 1 to 4 and 6 stay green; Gray-Scott and Kuramoto GPU stepping is untouched.
- Do not edit the frozen block in `e2e/sandpile-definition.contract.spec.ts`, `e2e/sandpile-definition.config.ts`, or any earlier card's frozen oracle or card. If you believe an assertion is wrong, stop and say so in the envelope with the evidence.
- No absolute home-directory paths in committed files. Author identity via `agent-whoami --model '<your model id>'`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0 (planning base `3e157582e` with both oracles present: 512 tests, 429 pass, 0 fail, 83 skipped; the counts rise with card 164's and this card's unit tests). Skips are not passes.
2. Worker and verifier: `SANDPILE_DEFINITION=165 npx playwright test -c e2e/sandpile-definition.config.ts` passes all 6 tests with no skips (the config starts its own server on 127.0.0.1:5189 at a device-pixel ratio of 2 and refuses an existing one). Planning base, before card 164: 6 fail, the intended red; without the flag all 6 skip.
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0.
4. Worker and verifier: `SANDPILE_GPU=164 npx playwright test -c e2e/sandpile-gpu.config.ts -g "rounds per step|bit-identical|fed pile|impulse|switched off"` passes 5 of 5. Tests 5 and 7 of that file are expected red after this card and are not run.
5. Verifier: `npx playwright test --config e2e/gray-scott-gpu.config.ts e2e/gray-scott-gpu.spec.ts` reports 3 passed and 1 skipped.
6. Verifier browser, headless Chromium at 1440 x 900 and a device-pixel ratio of 2 with cleared storage, on a Vite server started from the run worktree: open `#/abelian-sandpile`; record the seconds until `sandpileReadGrains()` holds no cell of 4 or more (expected about a minute; over 150 s is a FAIL) and, over the first 20 s, the frames counted by `requestAnimationFrame` (report the rate; under 15 a second is a FAIL). Retain a full-resolution screenshot of the settled canvas: single-device-pixel cells, the pile about 85 per cent of the canvas height, nothing clipped. Choose Sandstorm: it runs, the frame counter keeps rising, report the rate. Choose Mandala: Initial pile reads 262144 and the small classic pile settles. Uncheck and recheck "Fit pile to screen" on Kernel default: the pile follows. Open `#/` and retain a screenshot of the sandpile gallery card: a settled fitted pile.
7. Verifier browser, same server, a context with a coarse pointer and an 820 x 1180 viewport (tablet tier): `#/abelian-sandpile` opens at Grid quality Balanced on the GPU path with the fitted pile, and settles.
8. Verifier: `npx playwright test e2e/smoke.spec.ts e2e/sandpile-palettes.spec.ts` passes on a server on 5173 started from the run worktree. Afterwards `git checkout HEAD -- e2e/fixtures` if a suite rewrote fixtures.
9. Verifier scope: the diff touches only the paths named in deliverables 1 to 9. Any other path is a FAIL regardless of other evidence, unless the envelope gives a reason the verifier accepts as necessary.
10. Operator, not judged or recorded by either seat: a look after a PASS lands the stage on `dev` (the verifier reports it as not applicable, never as FAIL).

## Contract test

- **Test file:** e2e/sandpile-definition.contract.spec.ts
- **Oracle command:** `SANDPILE_DEFINITION=165 npx playwright test -c e2e/sandpile-definition.config.ts` (skips without the flag)
- **Assertions digest:** sha256:0dc1600b698c313d34d66965d4ab0bb84f52fa30c0a337c0c7c7b23e44fe59db
- **Oracle proof:** On the unchanged base `3e157582e` on 2026-11-11, before card 164, the command ran 6 tests and all 6 failed: test 1 at the import of `src/sims/abelian-sandpile/model.ts`; test 2 at the schema defaults (no `fitPile`); test 3 at the preset list; tests 4 and 5 at `data-simulation-renderer`; test 6 at the unchanged sandpile thumbnail. Without the flag all 6 skip. Once card 164 lands, test 5 is expected to pass up to the `fitPile` checkbox and tests 1 and 4 to fail later, at `sandpileFitPile` and at Grid quality. The literals were computed independently: the fit values from the formula in node; 71 cells across for 8,677 grains on a 96 x 80 grid from the queue-ordered reference in card 164's oracle, which the shipped kernel matches; 375 across for 2^18 grains and the 0.8 to 0.9 band from the orchestrator's WebGL measurements (1489 of 1800 is 0.83 at 2^22). No reference implementation was built: this card depends on code card 164 has not written yet, so every test past its first assertion is unproven against a passing tree. A harness defect the worker finds is reported in the envelope, not worked round; the standing recovery policy covers a demonstrated harness correction.

## Out of scope

The CPU kernel's toppling rule; a pile larger than the fit; changing the fit fraction; smoothing or any palette work; a legend of the four grain colours; `webglcontextlost` handling; Grid quality options for any other sim; republishing the lab into promo-flow; the Presets-section layout; orchestration changes.

## Budget

- **Worker wall-clock:** 150 minutes
- **Verifier wall-clock:** 75 minutes
- **Spend basis:** last 40 emergence-lab dispatches: worker median 3.18M, p95 13.39M; verifier median 1.69M, p95 6.92M cached-inclusive tokens. Plan one pair at about the p95, 20M, with 30M as the outlier. Preparation (orchestrator, 2026-11-11, same session as card 164): the large-grid throughput measurements, the fit literals, the oracle and its red run.

## Dispatch envelope

Return the exact commands and exits; how the round limit and the frame governor work; the measured settle time and frame rate of the fitted pile and of Sandstorm at a device-pixel ratio of 2; the thumbnail step count and how settling was confirmed; the thumbnail files the generator touched and that were restored; the screenshot paths; and any file outside the deliverables with the reason. State PASS, FAIL or partial honestly. Stop at wall-clock or an unresolved evidence failure; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

Both roles need a browser. Codex roles are sandboxed and this card declares Requires GUI. The contract config starts its own Vite server on 127.0.0.1:5189; card 164's uses 5188, Gray-Scott's 5181, smoke 5173. Check `lsof -nP -iTCP:5173 -sTCP:LISTEN` first: if another checkout's server is listening, stop and report rather than checking the wrong tree. The operator may have a look server on 5174 from the primary checkout; leave it alone. Stop only the servers you started. In a run worktree whose `node_modules` is a symlink to another checkout, start Vite with a `cacheDir` outside that `node_modules`. Headless Chromium needs `--use-angle=metal --enable-gpu` for WebGL2 on this machine; the Playwright configs already pass them. Reading back a device-pixel grid is about 20 MB a call; poll it every few seconds, not every frame. Frame timing in an automated browser is noisy on this machine: criterion 6's floor of 15 frames a second is deliberately loose.

## Readiness review

Baselines on `3e157582e` on 2026-11-11: the frozen oracle 6 of 6 red for the stated reasons and 6 skipped without the flag; the contract gate exits 0 with both new oracles in the tree; `npm run verify` green at 512 tests, 429 pass, 83 skipped; criteria 4 to 8 cannot be baselined before card 164 lands and are recorded as such. Claims closure: `RESOLUTION_TARGETS.extreme` and the floor branch in `computeGridSize` are read only by the renderer and exist for the logistic map, so the sandpile needs its own no-floor path; `showExtremeResolution` is set in `simView.ts` for the logistic map or a saved Extreme choice; `ULTRA_DEFAULTS` and the Gray-Scott `cpuFallbackPreset` block in `qualityProfiles.ts` are the pattern for deliverable 6, and `qualityProfiles.test.cjs` pins profiles; presets are matched against params by the Kernel preset select, so a new param key must be handled there or "Kernel default" will not show after a reset (the smoke test "reset restores the kernel preset select: abelian-sandpile" covers it); `thumbnail.ts` passes schema defaults to `setGrid`, so the thumbnail fits its own 640 x 400 grid (216,926 grains, about 41,000 rounds, inside the 2,000 steps already set). On the CPU fallback the fitted pile at Balanced is about 347,000 grains and takes longer to settle than Mandala did (roughly 80 s); accepted, the fallback is rare. No cross-family cold read was run on cards 164 and 165: the operator asked for the run to start unattended, and the cross-family verifier reads each card cold.

## Re-brief (2026-11-12, attempt 2)

Attempt 1 (GPT-6.1 Sol) implemented deliverables 1 to 7 and part of 9, then stopped at a scope blocker: the required fifth param `fitPile` makes `src/app/paramGroups.test.cjs` fail against `docs/audits/2026-09-12-param-groups-before.json`, which lists the sandpile's four prior ungrouped controls and was outside the deliverables. The worker was right to stop. The operator authorised the snapshot update on 2026-11-12.

Its work is preserved as `d09fba0847f49f3d56731c02dd9500d2d3fde723` on `wip/165-sandpile-device-pixel-fit-attempt-1` (11 files, the deliverable paths only; the commit subject says "verifier FAIL" but no verifier ran, it was a worker FAIL). Start by restoring those files into the run worktree (`git checkout d09fba0847f49f3d56731c02dd9500d2d3fde723 -- <the 11 paths>`), review them, and continue from there; do not rebuild from scratch.

Changes to the card for this attempt:

- **Deliverable 10 (new):** `docs/audits/2026-09-12-param-groups-before.json`: in the `abelian-sandpile` entry only, `ungrouped` gains `fitPile` in its rendered position (fifth, after `topplesPerStep`, unless `scripts/param-groups-snapshot.cjs` reports otherwise). No other sim's entry and no other key changes; confirm with `git diff` that the change is that one line.
- **Criterion 9** now reads "deliverables 1 to 10".
- Everything else on the card stands, including the frozen oracle and its digest.

Still owed from attempt 1, none of it started or finished:

- Criterion 1 (`npm run verify` exit 0) and criterion 2 (the 165 oracle, 6 of 6, never run).
- Deliverable 8, the thumbnail. `node scripts/generate-thumbnails.mjs` deletes every file in `public/thumbnails/` before it writes, and attempt 1's run was interrupted after one file. Run it on its own, with no measurement or other browser work alongside, let it finish, then restore every thumbnail except `abelian-sandpile.png` from `HEAD` and confirm their bytes match. If it is interrupted again, restore all of them from `HEAD` and report it.
- Deliverable 9's measurements: settle time and frame rate of the fitted pile at a device-pixel ratio of 2, and Sandstorm's frame rate at the Extreme grid, measured in isolation. Attempt 1's 72.4 frames a second over 21.83 s was taken while the thumbnail generator ran and the pile had not settled; do not carry it forward.
- The large-grid limit and governor in `src/app/sandpileGpu.ts` were described as provisional. Settle them against the 150 s and 15 frames a second floors of criterion 6 and describe the final mechanism in the envelope.

## Recovery log

- **Attempt 1:** dispatched 2026-11-11T21:48:30Z on base `5fa81bc62`. Worker FAIL at a scope blocker (1.79M tokens), no verifier run. Preserved as `d09fba0847f49f3d56731c02dd9500d2d3fde723`; envelope and log archived under `state/uat/165-sandpile-device-pixel-fit/attempt-1/`. Diagnosis: card defect (the parameter-order audit snapshot was missing from the deliverables). Repair: snapshot added as deliverable 10, operator-approved 2026-11-12. Same pairing: the worker is already the mid tier. Next: attempt 2.
