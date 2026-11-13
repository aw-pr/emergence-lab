# Stage card 169-boids-gpu-default: Boids steps on the GPU by default on the desktop tier

## Metadata

- **Authored:** 2026-11-13
- **Orchestrator:** Claude Fable 5.2 <claude-fable-5-2@local>
- **Worker:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Verifier:** GPT-6 Astra <gpt-6-astra@local>
- **Base branch:** dev
- **Run branch:** autometta/169-boids-gpu-default
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Dispatch:** serial
- **Pairing rationale:** a small renderer change whose risk is fallout in suites that assumed Boids opens on the CPU; the worker is the family that wrote the engine in card 168. The verifier is Astra because the acceptance is what the default view looks like and how it paces in a browser, a UI-verification seat, and the operator offered Astra for cards this week ("we have a load of fabel and even more astra at this point in the week if you need them for cards please feel free", 2026-11-13).
- **Open decisions:** none
- **Decided (operator, 2026-11-13):** after a live side-by-side look at card 168's build, plain URL against `?simulationRenderer=gpu`: "GPU is better". The shorter, finer trails at about 60 frames a second are accepted (card 168, criterion 5 amendment). Order agreed earlier the same day: seeding, GPU stepping opt-in, then GPU as the default after the look. "How will this work if there is no gpu cpu fallback?": the CPU kernel stays the fallback and this card must keep it.

## Surfacing concern

Card 168 (`b7cc927fd`) added a GPU-resident Boids engine (`src/app/boidsGpu.ts`) that runs only when `?simulationRenderer=gpu` is present. On the desktop default of 28000 boids the CPU kernel renders at about 31 to 39 frames a second and the GPU engine at about 60 (card 168 verifier: frame interval median 16.6 ms against 25.5 ms). The operator has compared the two and prefers the GPU flock, so the plain URL should use it.

The gate is one expression in the `WebGL2Backend` constructor in `src/app/webglRenderer.ts`: the engine is created only when `simulationRendererOverrideFromUrl() === "gpu"`, float render targets exist and `detectDeviceTier() === "desktop"`. Gray-Scott and the sandpile already default to the GPU and treat `?simulationRenderer=cpu` as the way back (`forceCpuSimulation`). Everything after construction is already in place and unchanged by this card: `boidsGpuEligible` keeps the flock on the CPU kernel for obstacle layouts, dropped boulders, a visual radius above 16 and flocks under 256 boids; the CPU kernel is always initialised at full size; and an engine that fails to build leaves the backend without one.

What is not known is how many existing suites read the CPU kernel's state while the page shows Boids, and would now read a kernel the GPU engine has taken the flock from. The orchestrator ran the new oracle with the gate flipped (5 of 5) but did not get a smoke reading with it flipped. Finding and handling that fallout is the worker's job, within the constraints below.

## Objective

On the desktop tier, with WebGL2 and float render targets, the plain Boids URL steps the flock on the GPU. `?simulationRenderer=cpu` keeps it on the CPU kernel, `?simulationRenderer=gpu` keeps working, and tablets, phones and every stay-on-CPU case from card 168 are unchanged.

## Visual goal

The plain Boids URL on a desktop looks and paces exactly as `?simulationRenderer=gpu` does on `b7cc927fd`. Reference: that URL on the base build, captured by the verifier beside the plain URL on this card's build.

- Target: the same five flocks opening close in, the same short fine trails and bloom, a steady 60 frames a second; an observer cannot tell the plain URL on this build from `?simulationRenderer=gpu` on the base.
- Failure: any difference between those two; flicker or a blank frame at load while the engine takes over; a visible jump when a boulder is dropped or cleared; any change at all on `?simulationRenderer=cpu`, on a tablet or phone viewport, or in another simulation. Numbers passing while the frames show one of these is a FAIL.

## Inputs (read these in your own context)

- `src/app/webglRenderer.ts` (the `WebGL2Backend` constructor where `this.boids` is created, `forceCpuSimulation`, `simulationRendererOverrideFromUrl` and its comment, the Boids hand-over method that calls `boidsGpuEligible`)
- `src/app/boidsGpu.ts` (`BoidsGpuConditions`, `boidsGpuEligible`, `createGpuBoids`)
- `docs/stages/168-boids-gpu-stepping.md`
- `e2e/boids-gpu-default-169.contract.spec.ts` and `e2e/boids-gpu-default-169.config.ts`
- `e2e/smoke.spec.ts`, `scripts/generate-thumbnails.mjs` and `src/app/thumbnail.ts` (the places most likely to assume CPU stepping)

## Deliverables

1. `src/app/webglRenderer.ts`: the Boids engine is created unless `?simulationRenderer=cpu` is present, still only with float render targets and on the desktop tier. The comment on `simulationRendererOverrideFromUrl` says what `cpu` and `gpu` now mean for Boids.
2. `src/app/boidsGpu.ts`: only the doc comment on `BoidsGpuConditions.requested`, if its wording is now wrong. No behaviour change.
3. Thumbnails: `src/app/thumbnail.ts` warms Boids on the CPU kernel and then draws, and `scripts/generate-thumbnails.mjs` loads an unpinned URL, so with the new default the GPU engine would take the flock over mid-draw. Keep Boids thumbnails on the CPU path, for Boids only: forcing the CPU for every simulation would change the Gray-Scott and sandpile thumbnails. The committed Boids thumbnail must not change.
4. Any other existing test or script that fails only because Boids now opens on the GPU: make it ask for the CPU path explicitly (`?simulationRenderer=cpu`) where it tests the CPU kernel, or read the GPU flock where it tests the view. Name each one in the envelope with the reason. Do not delete or weaken an assertion to get it green.
5. `e2e/boids-gpu-default-169.contract.spec.ts` and its config already exist (the frozen oracle); add nothing inside the markers.

## Constraints

- No change to Boids defaults, presets, tier counts, colours, trails, bloom or the committed thumbnail. Do not regenerate the thumbnail image (deliverable 3).
- No change to `boidsGpuEligible`'s conditions, the engine's stepping, the handover, or `src/sims/boids/kernel.ts`.
- `e2e/boids-gpu-168.contract.spec.ts` is a historical frozen oracle. Its first test asserts the plain URL is on the CPU and is superseded by this card; it runs only under `BOIDS_GPU=168`. Do not edit it.
- Tablet and phone stay on the CPU. Gray-Scott, the sandpile and every other simulation are untouched.
- The `SimKernel` contract in `docs/INTERFACE.md` does not change.
- No absolute home-directory paths in committed files.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0. Base `b7cc927fd` (card 168 verifier, 2026-11-13): 525 tests, 442 pass, 0 fail, 83 skipped. Skips are not passes.
2. Worker and verifier: `BOIDS_GPU=169 npx playwright test -c e2e/boids-gpu-default-169.config.ts` passes all 5 tests with no skips (the config starts its own Vite server on port 5194). The oracle holds: the plain URL on the desktop tier reaches `gpu-boids` with the engine handle on the canvas, its step count rising by more than 10 in a second, and the schema defaults and tier counts unchanged; `?simulationRenderer=cpu` never reaches it; `?simulationRenderer=gpu` still does; on the plain URL a dropped boulder hands the flock to the CPU and a clear hands it back; a tablet-tier context on the plain URL stays on the CPU.
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0.
4. Worker and verifier: `npx playwright test e2e/smoke.spec.ts` passes. Base: 43 passed (card 168 verifier).
5. Verifier, speed in the page: headless Chromium with `--use-angle=metal --enable-gpu`, 2560x1440 at device pixel ratio 1, the plain Boids URL, 600 rendered frames after a 5 s warm-up: median frame interval at most 17 ms; `?simulationRenderer=cpu` recorded alongside (about 25 to 32 ms expected). Take the reading with no other browser running. If headless pacing makes the reading meaningless, say so; that is a "not judged", not a PASS.
6. Verifier, look pack: the plain URL on this build beside `?simulationRenderer=gpu` on the base build, at 5, 20 and 60 s after load, retained side by side and judged against the Visual goal. Seeds differ between loads, so judge texture, spacing, trails, flock shapes and pacing, not positions. Stills cannot show motion, so add: 60 consecutive rendered frames of the plain URL from the first frame after load, with none blank and no frame-to-frame brightness swing that reads as flicker (give the per-frame mean luminance); and, across a boulder drop and a clear on the plain URL, the flock's circular mean position before and after each handover, read from the engine handle and the kernel as card 168's verifier did, with no jump.
7. Verifier scope: the diff touches only `src/app/webglRenderer.ts` (the gate and the comment), a comment in `src/app/boidsGpu.ts`, the thumbnail pin of deliverable 3 and the tests or scripts named under deliverable 4, each with its reason. No frozen block changes. No changed assertion thresholds.
8. Operator, not judged by either seat: a look at the plain Boids URL after landing, recorded in `HANDOFF.md`, before anything ships.

## Contract test

- **Test file:** e2e/boids-gpu-default-169.contract.spec.ts
- **Oracle command:** `BOIDS_GPU=169 npx playwright test -c e2e/boids-gpu-default-169.config.ts` (all 5 skip without the flag)
- **Assertions digest:** sha256:9118e2e5a1e739acafdfb10a2868a1706c62ff43bf037d77c84f44360dbc6dd7
- **Oracle proof:** on `788f14f97` (dev, with card 168), 2 of 5 fail: the plain-URL test at "GPU stepping engages with no switch" and the plain-URL boulder test at its first poll (`data-simulation-renderer` is null, not `gpu-boids`); the `cpu`, `gpu` and tablet-tier tests pass, and the tablet test's own tier assertion reads `tablet`, so the emulation is real. Positive side: with the gate changed from `=== "gpu"` to `!== "cpu"` in a scratch edit, reverted afterwards, 5 of 5 pass, including the step count rising. Each `open()` goes through `about:blank`, the defect card 168's oracle had.

## Out of scope

Time-based trail fade, obstacle steering on the GPU, large visual radii on the GPU, tablet and phone GPU stepping, more or smaller boids or a finer grid, any flocking-rule change, deployment, `HANDOFF.md` and `CLAUDE.md`.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 75 minutes
- **Spend basis:** card 167 (a small UI default change with a browser oracle, about 11 minutes of worker time) for the worker; card 168's verifier-only re-run (4.3M tokens, 17 minutes) for the verifier, with a larger allowance because Astra captures and judges a look pack. Plan about 10M tokens for the pair. Preparation: the oracle, its two proofs and this card, in the orchestrator's session.

## Risks

- **Suites that read the CPU kernel while the page shows Boids.** With the GPU engine stepping, the kernel's own arrays stop moving until a handover. Anything that samples them through the page (smoke, sweeps, thumbnails) may read a frozen flock. Deliverables 3 and 4 cover this; if the fallout is wider than a handful of files, stop with a partial envelope and the list.
- **Heading parity is statistical.** Card 168's worker measured a one-heading share of up to 0.447 at step 1200 against that oracle's 0.5 limit. This card's oracle does not measure it.
- **Machine load.** Card 168's first frame-interval reading was 16.7 ms against the 17 ms limit. The verifier takes criterion 5 on a quiet machine and reports the load average with it.

## Dispatch envelope

Return the exact commands and exits, the gate as changed, the thumbnail pin, every test or script touched under deliverable 4 with its reason, and the smoke and oracle counts. State PASS, FAIL or partial honestly. Stop at wall-clock or an unresolved evidence failure; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

Both roles need a browser, and this card declares Requires GUI. The operator's look server on port 5174 serves the primary checkout; leave it alone. The oracle's config starts its own server on 5194 from the run worktree; check `lsof -nP -iTCP:5194 -sTCP:LISTEN` first and stop only a server you started. Headless Chromium needs `--use-angle=metal --enable-gpu` for WebGL2 on this machine; the Playwright config already passes them. The dev server serves modules with an HMR stamp in the URL, so a second `import()` of a kernel module by its plain path is a second instance. Do not edit a source file while a Playwright run is using the dev server: Vite reloads the page under the test. The verifier needs the base build for criterion 6: serve `b7cc927fd` from a throwaway `git worktree` on another port and remove it afterwards.

## Readiness review

Baselines on `788f14f97` on 2026-11-13: the frozen oracle 2 of 5 red for the stated reason, 5 of 5 with the gate flipped in a scratch edit; `npm run verify` and smoke as recorded by card 168's verifier on the same source. Claims closure: `simulationRendererOverrideFromUrl` has two call sites, `forceCpuSimulation` (Gray-Scott, sandpile, Kuramoto; untouched) and the Boids gate; `requested: true` in the hand-over call is a constant and needs no change. `?simulationRenderer=cpu` is already used by `e2e/sweep.spec.ts`, the Gray-Scott and sandpile suites. Not established: a smoke reading with the gate flipped (risk 1). Cold read by the other family (Codex, read-only, 2026-11-13): no open implementation decision. Folded in: the thumbnail path (deliverable 3), a stepping assertion in the oracle (the step count must rise), and motion evidence for criterion 6. It found no stale-state failure in smoke (it reads renderer iterations and a separately stepped kernel) or the presets suite, and noted the sweep rows use visual radii of 24 to 36, which stay on the CPU.

## Recovery log

- None yet. Recovery attempt: 1.
