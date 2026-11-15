# Stage card 164-sandpile-gpu-stepping: the sandpile topples on the GPU

## Metadata

- **Authored:** 2026-11-11
- **Orchestrator:** Claude Fable 5.2 <claude-fable-5-2@local>
- **Worker:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Verifier:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/164-sandpile-gpu-stepping
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Recovery attempt:** 1
- **Dispatch:** serial
- **Pairing rationale:** a new GPU-resident simulation in the WebGL2 backend with exact integer parity against the CPU kernel, the same shape as the Gray-Scott GPU work of 2026-11-08, which an Opus 5.5 agent wrote. It is open-ended shader and renderer work, so the worker is the Claude coding seat at high effort. The cross-family verifier is the Codex coding tier at high effort driving headless Chromium: the acceptance is a frozen Playwright contract, exact counts and a screenshot comparison it can compute; Sol verified cards 157, 159 and 161 that way. No frontier seat: the oracle is exact, so the judgement is reading and running, not taste.
- **Open decisions:** none
- **Decided:** by the operator on 2026-11-11. After card 163 landed they asked "I notice that the image is quite pixelated, can we work on that so we can have more defined images?" and approved carding the GPU sandpile. Asked the same evening whether to split the proposal, they chose "Split in two": this card is the engine with no change to what opens; card 165 (gated on this one) makes the grid finer and sizes the pile to the screen.

## Surfacing concern

The sandpile steps on the CPU (`src/sims/abelian-sandpile/kernel.ts`), a queue of cell relaxations bounded per frame by "Topples per step". Its settle time grows roughly with the square of the grain count: Mandala's 2^18 grains take about 45 s, 2^19 about 166 s, 2^20 over 10 minutes. A sharper picture needs more grains (the pile's width is about 0.73 times the square root of the grain count), so it needs a faster engine first.

Measured by the orchestrator on 2026-11-11 (headless Chromium, ANGLE Metal, Apple M2 Max, a throwaway WebGL2 page, one RG32F ping-pong pass per synchronous round in which every cell sheds `floor(h / 4)` to each neighbour): 2^18 grains settled in 52,000 rounds in 1.7 s on a 512 x 512 grid and 1.8 s on 1214 x 759, about 30,000 rounds a second, to a pile 375 cells across with every grain conserved. 2^20 grains on 1620 x 1012 took 200,000 rounds and 8.3 s. On a 2880 x 1800 grid the rate fell to about 4,000 rounds a second (11,700 with the pass scissored to the pile); that grid is card 165's problem, not this card's.

Two facts shape the oracle. First, the settled pile is independent of toppling order only when the threshold is a multiple of 4. The kernel's rule at other thresholds returns the remainder of a four-way split to the toppling cell, and the result then depends on order: at thresholds 9, 10 and 11 a queue-ordered run and a synchronous run of 20,000 grains settled about 1,900 cells apart (grains conserved in both). Every shipped preset uses 4, 8 or 12. So the GPU pile is held bit-identical to the CPU kernel at 4, 8 and 12, and at every threshold it is held bit-identical, step for step, to a synchronous reference of the same rule. Second, "Topples per step" budgets queue visits, which a GPU pass does not have; this card maps it to synchronous rounds per step.

Gray-Scott (`src/app/grayScottGpu.ts`) and Kuramoto are the patterns to follow: a simulation object the backend owns, `setGrid` seeding it, `advanceDirect` stepping it, `drawGpuField` presenting it, a canvas expando for diagnostics, and the CPU kernel as the fallback. The sandpile differs in three ways: its render mode is `grid`, not `field`; the presenting shader reads a two-channel texture of normalised height and activity (the kernel's `readState()` layout), while the stepping needs raw grain counts; and its counts must be exact integers up to 16,000,000 plus feeding.

## Objective

Step the sandpile GPU-resident in the WebGL2 backend, with the CPU kernel as the fallback, so that the settled pile is bit-identical to the CPU kernel's at thresholds 4, 8 and 12 and Mandala settles in seconds. Nothing about what opens changes: same defaults, same presets, same Balanced grid, same colours, same thumbnail.

## Visual goal

No visible change except speed. At 1440 x 900 with cleared storage, `#/abelian-sandpile` opens exactly as after card 163 and the mandala finishes settling within about 10 s instead of about 45 s; the settled picture is the one the CPU path draws.

- Target: the settled GPU frame and the settled CPU frame (`?simulationRenderer=cpu`) are the same picture.
- Failure: a blank or flipped pile, a pile off centre, colours or glow that differ from the CPU path, a preset that no longer runs, or any change to the opening values, grid or thumbnail.

## Inputs (read these in your own context)

- `src/sims/abelian-sandpile/kernel.ts`
- `src/app/grayScottGpu.ts`
- `src/sims/gray-scott/model.ts`
- `src/app/webglRenderer.ts` (the Gray-Scott and Kuramoto wiring: `supportsDirectRendering`, `setGrid`, `advanceDirect`, `applyDirectImpulse`, `drawGpuField`, `supportsGpuGrayScott`, `attachGrayScottDiagnostics`, `releaseGrayScott`, the `cpu-kernel` dataset branch, `simulationRendererOverrideFromUrl`)
- `src/app/webglHelpers.ts`
- `src/app/renderer.ts` (`usesDirectRendering`, the step loop, `applyPointerImpulse`)
- `src/app/thumbnail.ts`
- `e2e/gray-scott-gpu.spec.ts`
- `e2e/sandpile-gpu.contract.spec.ts`
- `e2e/sandpile-gpu.config.ts`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/sims/abelian-sandpile/model.ts` (new): the pure, DOM-free pieces both paths can share. It exports `sandpileRoundsPerStep(topplesPerStep: number): number`, which returns `ceil(topplesPerStep / 2000)` clamped to 1..500, and whatever param parsing the GPU path needs (threshold 2..12, minimum toppling count `threshold * ceil(4 / threshold)`, grains per step 0..1000, initial pile 0..16,000,000), with the kernel's bounds.
2. `src/app/sandpileGpu.ts` (new): the GPU simulation. One kernel step is, in order: decay activity by 0.82 (below 0.01 becomes 0), add grains per step to the centre cell `(floor(width / 2), floor(height / 2))`, then run `sandpileRoundsPerStep` synchronous rounds. In a round every cell holding at least the minimum toppling count sheds `share = floor(floor(h / threshold) * threshold / 4)` to each of its four neighbours and keeps `h - 4 * share`; grains shed off the grid are lost; activity becomes `max(activity, min(1, log2(floor(h / threshold) + 1) / 12))` for a cell that toppled. Counts stay exact integers (an integer format, or float32, which is exact to 16,777,216). An impulse pours the kernel's `applyImpulse` amounts into the same cells. One `advance` call never queues more than 1,000 rounds and always runs whole steps, at least one.
3. `src/app/webglRenderer.ts`: wire it as Gray-Scott is wired, for the sandpile kernel in `grid` mode. The presenting shader keeps reading normalised height and activity in the kernel's `readState()` layout, so colours, the four-colour palettes and the Avalanche glow are untouched. `data-simulation-renderer` reads `gpu-ping-pong` on the GPU path and `cpu-kernel` on the fallback. The fallback is taken when the needed render-target support is missing, when setup fails, and under `?simulationRenderer=cpu`. While the sandpile's state is on the GPU the canvas carries three diagnostics, removed when it is released: `sandpileReadGrains(): Float32Array | null` (raw grain counts, one per cell, row 0 first, the kernel's cell order), `sandpileReadState(): Float32Array | null` (interleaved normalised height and activity, exactly the kernel's `readState()` values for the same grains) and `sandpileRoundCount(): number` (rounds run since the state was last seeded; impulses are not counted). Impulse coordinates are kernel cell coordinates, as for Gray-Scott.
4. Optional, only if you add unit tests for `model.ts`: `src/sims/abelian-sandpile/model.test.cjs` and the one `tsconfig.test.json` include line it needs.
5. `docs/sweeps/2026-11-11-sandpile-gpu.md` (new): what was built in five to fifteen lines, the measured settle time of Mandala in the app on the GPU and on the CPU path, the reported frame rate of Sandstorm on each, and anything card 165 should know (for example the cost of a round at a larger grid).

## Constraints

- Work from `dev` in the run worktree; never push `main` or `publish`.
- `src/sims/abelian-sandpile/kernel.ts` is untouched, byte for byte; the frozen test pins its digest. The CPU kernel stays the reference and the fallback.
- No change to `src/app/presets.ts`, `src/app/qualityProfiles.ts`, the kernel defaults, the colour model, the legend, or any file under `public/thumbnails/`. Do not run `scripts/generate-thumbnails.mjs`; the gallery still shows card 163's thumbnail.
- Gray-Scott and Kuramoto keep stepping on the GPU exactly as before; `e2e/gray-scott-gpu.spec.ts` stays green.
- Do not edit the frozen block in `e2e/sandpile-gpu.contract.spec.ts` or `e2e/sandpile-gpu.config.ts`. If you believe an assertion is wrong, stop and say so in the envelope with the evidence; do not work round it. Card 163's oracle (`src/app/sandpileOpening.contract.test.cjs`) must stay green. The older oracles of cards 159, 161 and 162 are already red under their own flags; leave them and their cards alone.
- No device-pixel grid, no pile sizing, no scissoring or frame-time governor: those are card 165.
- No absolute home-directory paths in committed files. Author identity via `agent-whoami --model '<your model id>'`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0. Planning base `3e157582e` plus this card's oracle, 2026-11-11: 512 tests, 429 pass, 0 fail, 83 skipped. Skips are not passes; the counts may rise if the worker adds unit tests.
2. Worker and verifier: `SANDPILE_GPU=164 npx playwright test -c e2e/sandpile-gpu.config.ts` passes all 7 tests with no skips (the config starts its own server on 127.0.0.1:5188 and refuses an existing one). Planning base: 1 pass (the unchanged-files guard), 6 fail, the intended red; without the flag all 7 skip.
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0 (planning base: exits 0).
4. Worker and verifier: `npm run build:test && SANDPILE_OPENING=1 node --test src/app/sandpileOpening.contract.test.cjs` passes 6 of 6 (planning base: 6 of 6).
5. Verifier: `npx playwright test --config e2e/gray-scott-gpu.config.ts e2e/gray-scott-gpu.spec.ts` reports 3 passed and 1 skipped (planning base: the same; the fourth test needs `GS_GPU_PERF=1` and is not part of this card).
6. Verifier browser, headless Chromium at 1440 x 900 with cleared storage, on a Vite server started from the run worktree: open `#/abelian-sandpile`, wait until `sandpileReadGrains()` holds no cell of 4 or more, record the seconds from load (expected under 10; over 20 is a FAIL) and retain a screenshot of the canvas. Open `?simulationRenderer=cpu#/abelian-sandpile`, wait for the pile to settle (allow 150 s; settled when two screenshots 5 s apart are identical) and retain a screenshot. Compare the two canvas screenshots pixel for pixel and report the count that differ: more than 0.1 per cent of the canvas is a FAIL. On the GPU path, choose each of Classic critical, Fast avalanches, High threshold and Sandstorm in turn: `data-simulation-renderer` stays `gpu-ping-pong`, the iteration counter rises and the picture changes. Turn Avalanche glow on while Fast avalanches runs and retain a screenshot showing the glow. Drag the pointer across the settled Mandala: grains appear under it and topple.
7. Verifier: `npx playwright test e2e/smoke.spec.ts e2e/sandpile-palettes.spec.ts` passes on a server on 5173 started from the run worktree (smoke: 43 passed at card 163's landing on `dd4aca60d`). Afterwards `git checkout HEAD -- e2e/fixtures` if a suite rewrote fixtures.
8. Verifier scope: `git diff --name-only <base>..HEAD` lists only `src/sims/abelian-sandpile/model.ts`, `src/app/sandpileGpu.ts`, `src/app/webglRenderer.ts`, `docs/sweeps/2026-11-11-sandpile-gpu.md` and, if unit tests were added, `src/sims/abelian-sandpile/model.test.cjs` and `tsconfig.test.json`. `src/app/renderer.ts`, `src/app/rendererBackend.ts` or `src/app/thumbnail.ts` may appear only with a reason given in the envelope that the verifier accepts as necessary. Any other path is a FAIL regardless of other evidence.
9. Operator, not judged or recorded by either seat: a look after a PASS lands the stage on `dev` (the verifier reports it as not applicable, never as FAIL).

## Contract test

- **Test file:** e2e/sandpile-gpu.contract.spec.ts
- **Oracle command:** `SANDPILE_GPU=164 npx playwright test -c e2e/sandpile-gpu.config.ts` (skips without the flag)
- **Assertions digest:** sha256:0e865cd6ae95151d06d5e961ef528d90c40656a20765d50ef0d026c2d2ee64fd
- **Oracle proof:** On the unchanged base `3e157582e` on 2026-11-11 the command ran 7 tests: 6 failed and 1 passed. Tests 1 to 4 fail at the harness, which imports `src/sims/abelian-sandpile/model.ts` (it does not exist); test 5 fails at `data-simulation-renderer` (empty, expected `gpu-ping-pong`); test 6 fails at `cpu-kernel`; test 7, the guard that the kernel file, the five presets and the Balanced grid are unchanged, passes, as it should. Without the flag all 7 skip. The two references inside the frozen block (queue-ordered and synchronous) were run in node and agree with each other on all four settled cases; the fed cases conserve grains and keep clear of the grid edge. A scratch copy of the spec with the GPU harness replaced by a CPU stand-in built on the synchronous reference passed tests 1 to 4 in the browser (35 s), which also showed the shipped CPU kernel settles to the reference at thresholds 4, 8 and 12, including the case that spills over the boundary. No GPU reference implementation was built, since that is the worker's job: tests 5 and 6 have not run against a passing implementation. Their literal 375 (the settled width of 2^18 grains) comes from the orchestrator's independent WebGL measurement. The test does not judge colours beyond "at least four distinct colours in the middle of the canvas"; criterion 6 does.

## Out of scope

A finer grid, a device-pixel grid, sizing the pile to the screen, scissoring the pass to the pile, any frame-time governor, a new thumbnail (all card 165); the CPU kernel's rule or its order dependence at thresholds that are not multiples of 4; the "Topples per step" help text (it lives in the kernel file); `webglcontextlost` handling; republishing the lab into promo-flow; the Presets-section layout; the stale 143/147 baselines; orchestration changes.

## Budget

- **Worker wall-clock:** 150 minutes
- **Verifier wall-clock:** 75 minutes
- **Spend basis:** last 40 emergence-lab dispatches: worker median 3.18M, p95 13.39M; verifier median 1.69M, p95 6.92M cached-inclusive tokens. The comparable job, the Gray-Scott GPU path, ran outside the queue. Plan one pair at about the p95, 20M, with 30M as the outlier. Preparation (orchestrator, 2026-11-11, inside one interactive session): the throughput measurements above, the order-dependence check, the oracle with its node and stand-in checks, baselines for criteria 1 to 5, and the claims grep.

## Dispatch envelope

Return the exact commands and exits; the design in a few lines (texture formats, how the presenting texture is produced, how activity and feeding are carried, the fallback conditions); the measured Mandala settle time on both paths and Sandstorm's reported frame rate; the paths of any screenshots; and any file outside deliverables 1 to 5 with the reason. State PASS, FAIL or partial honestly. Stop at wall-clock or an unresolved evidence failure; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

Both roles need a browser. Codex roles are sandboxed and this card declares Requires GUI. The contract config starts its own Vite server on 127.0.0.1:5188 and refuses one already listening; the Gray-Scott config uses 5181; smoke needs 5173. Check `lsof -nP -iTCP:5173 -sTCP:LISTEN` first: if another checkout's server is listening, stop and report rather than checking the wrong tree. The operator may have a look server on 5174 from the primary checkout; leave it alone. Stop only the servers you started. In a run worktree whose `node_modules` is a symlink to another checkout, start Vite with a `cacheDir` outside that `node_modules` (see the note in `e2e/gray-scott-gpu.config.ts`). Headless Chromium needs `--use-angle=metal --enable-gpu` for WebGL2 on this machine; the Playwright configs already pass them. Frame timing in an automated browser is not trustworthy on this machine; report frame rates, do not judge them.

## Readiness review

Baselines on `3e157582e` on 2026-11-11 with the oracle files in place: `npm run verify` green (512 tests, 429 pass, 0 fail, 83 skipped); the frozen oracle 6 red and 1 green for the stated reasons, 7 skipped without the flag; the contract gate exits 0; card 163's oracle 6 of 6; the Gray-Scott GPU spec 3 passed, 1 skipped; smoke 43 passed at card 163's landing two hours earlier on the same source. Claims closure: the backend's direct-stepping seam (`supportsDirectRendering`, `setGrid`, `advanceDirect`, `applyDirectImpulse`, `draw`) is consumed by `src/app/renderer.ts` (step loop, pointer impulse, `usesDirectRendering`) and `src/app/thumbnail.ts` generically, so neither should need a change; `thumbnail.ts` will evolve a sandpile still on the GPU the next time thumbnails are generated, which this card forbids and card 165 does. `simView.ts` reads `cpuFallbackPreset` only from `qualityProfileFor`, which this card leaves alone, so the grid stays Balanced on both paths. `data-simulation-renderer` is set to `cpu-kernel` today only for the Kuramoto and Gray-Scott kernels; the sandpile must join that branch (deliverable 3). The lab's library build for promo-flow bundles the same renderer; no promo-flow change is needed and republishing is the operator's step. Prior walls carried forward: card 160's criterion that silently depended on an environment flag (criterion 5 here names the skip); card 157's gate failure on large spec files (fixed at `8f7f418b8`, do not run `autometta refresh-repo`).
