# Stage card 168-boids-gpu-stepping: Boids flock on the GPU, opt-in, with the CPU kernel as the reference

## Metadata

- **Authored:** 2026-11-13
- **Orchestrator:** Claude Fable 5.2 <claude-fable-5-2@local>
- **Worker:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Verifier:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/168-boids-gpu-stepping
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Dispatch:** serial
- **Pairing rationale:** open-ended shader and renderer work in the WebGL2 backend, the same shape as the Gray-Scott (2026-11-08) and sandpile (card 164) GPU engines, both written by an Opus 5.5 worker. The cross-family verifier is the Codex coding tier driving headless Chromium: the acceptance is a frozen Playwright contract, frame-time counts and statistical readings it can compute. The look is the operator's, not either seat's.
- **Open decisions:** none
- **Decided (operator, 2026-11-13):** "Do we need to do some GPU work?" then "yes write the gpu card". The Boids look to preserve is the default view at `946357cbc` (5 flocks, started close in, aimed just off the centre), which the operator called "perfect"; a turning-course flocking prototype was tried the same day and rejected in favour of the original rule. Asked whether the engine should be opt-in first and whether obstacles stay on the CPU: "lets opt-in and keep the obsticles". So this card lands the engine off by default behind `?simulationRenderer=gpu`, with a one-line follow-up card to make it the default after the operator's side-by-side look; and obstacle layouts and dropped boulders keep working by handing the flock to the CPU kernel in place, and back when the field is clear.

## Surfacing concern

Boids steps on the CPU (`src/sims/boids/kernel.ts`). Measured on 2026-11-13 by the flow sweep (`scripts/sweep-boids-flow.mjs`, Apple M2 Max, V8, uncontended): a full step at the desktop default of 28000 boids costs about 22 ms, so the desktop view runs at about 32 frames a second, where tablet (7000 boids, 4.9 ms) and phone (5000, 3.3 ms) keep up. The operator's word for it was "clunky with that many boids". Steering is applied once per rendered frame, so frame rate also changes how the flock evolves.

The CPU rule cannot be ported bit for bit. Each boid looks at up to 72 candidates drawn by a stride sample from the nine bins around it (`NEIGHBOUR_CANDIDATES`, `computeForcesBinned`), counts those inside the visual radius, and sums a pairwise push from those inside the separation radius. WebGL2 has no compute shaders and no per-cell lists, so a GPU engine must find neighbours another way, and its trajectories will differ from the CPU's from the first step. Parity here is statistical and visual, not exact: that is the main risk of this card, and the reason the engine is opt-in first.

Measured by the orchestrator on 2026-11-13 (headless Chromium, ANGLE Metal, Apple M2 Max, a throwaway WebGL2 page): one point-draw pass writing each boid's index into a 1707 x 960 RGBA32F cell texture, then one fragment pass over a 256-wide state texture in which each boid reads every cell within radius 14 (841 fetches) and applies alignment, cohesion, the pairwise push and the speed limits. 28000 boids: 3.98 ms a step, read-back included; 40000: 4.03 ms; 80000: 4.24 ms. With one index a cell, 19 of 28000 boids shared a cell with another and were unseen by neighbours that step (87 on a 1280 x 720 grid, 1012 of 80000). At radius 25 the same pass cost 12.1 ms, so cost grows with the square of the visual radius: the schema allows 64, and the shipped presets use 24 to 36. The throwaway used uniform random starts and no wander, so it says nothing about the look.

Gray-Scott (`src/app/grayScottGpu.ts`) and the sandpile (`src/app/sandpileGpu.ts`) are the patterns to follow: a simulation object the WebGL2 backend owns, seeded from the kernel's own initial state, stepped in float render targets (needs `EXT_color_buffer_float`), presented by the existing glyph shader, with `canvas.dataset.simulationRenderer` for diagnostics and the CPU kernel as the fallback.

## Objective

Step Boids GPU-resident in the WebGL2 backend when asked to, holding 60 frames a second at 28000 boids on the desktop grid, with a flock that reads the same as the CPU kernel's on the same parameters. Nothing about what opens changes: same defaults, same presets, same tier counts, same colours, same thumbnail, CPU stepping unless the switch is set.

## Visual goal

No visible change except smoothness. Reference: the default Boids view on the CPU path (switch absent) in the same build, captured by the verifier at 5, 20 and 60 s beside the GPU frames.

- Target: with the switch on, the opening reads as the same five flocks sweeping round each other, the same ribbon texture and spacing between boids, the same trails and bloom, at a steady 60 frames a second. Side by side at 20 s and 60 s an observer cannot say which is which without the frame counter.
- Failure: a visibly different texture (boids packed tighter or looser, a square or grid-aligned lattice, streaks along the axes), flocks that settle into one heading several times faster or slower than the CPU's, boids vanishing or piling up at the edges of the torus, flicker, or any change at all with the switch off. Numbers passing while the frames show one of these is a FAIL.

## Inputs (read these in your own context)

- `src/sims/boids/kernel.ts` (`init`, `seedClusteredBoids`, `computeForcesBinned`, `applySteer`, `rasterise`, the pointer and obstacle entry points)
- `src/app/sandpileGpu.ts`, `src/app/grayScottGpu.ts` and their call sites in `src/app/webglRenderer.ts` (`forceCpuSimulation`, `canvas.dataset.simulationRenderer`)
- `src/app/webglRenderer.ts` (the Boids glyph branch, `boidPaletteColour`, `boidsMeanDirection`)
- `docs/stages/164-sandpile-gpu-stepping.md`
- `scripts/sweep-boids-flow.mjs` and `docs/sweeps/boids-interestingness.md`, section "2026-11-13 - flow sweep" (the readings used for statistical parity: global heading order, median nearest-neighbour distance)
- `docs/INTERFACE.md` (the `SimKernel` contract, which this card does not change)

## Deliverables

1. `src/app/boidsGpu.ts`: the GPU engine. While it is stepping, the canvas carries an expando `boidsGpu` with `count` (boids), `steps` (engine steps since it was seeded), `read()` (a `Float32Array` of x, y, vx, vy per boid, in grid cells and cells a second) `advance(steps, dt)` (steps the engine synchronously that many times at that time step, without presenting, and adds to `steps`) and `hold(on)` (while on, the page's frame loop presents but does not step the engine, so a test owns the step count); the expando is removed whenever the CPU kernel is stepping. The frozen oracle drives the engine through it. Positions and velocities live in float textures, one texel a boid. Each step: (a) write each boid's index into a cell-lookup texture on the compute grid; (b) for each boid, read the cells within the visual radius, sampled so that a boid considers about as many neighbours as the CPU's 72 candidates, and apply the kernel's own alignment, cohesion, separation, wander, speed floor (`MIN_SPEED_FRACTION`) and speed limit in the same order; (c) integrate on the torus. Seeded from the CPU kernel's `init` so both paths start from the same boids. The worker may choose another neighbour scheme if it measures closer parity, and says why.
2. `src/app/webglRenderer.ts`, with the smallest seam changes needed in `src/app/renderer.ts` and `src/app/rendererBackend.ts` (the direct-stepping call carries only a step count today, and the grid is set before the kernel is initialised): owns the engine, steps it once per rendered frame with the same `dt` the CPU path gets, and feeds the existing glyph shader the same four channels (Density, Speed, Velocity X, Velocity Y), including the mean-direction uniform. `canvas.dataset.simulationRenderer` reads `gpu-boids` when it is stepping.
3. The switch: GPU stepping only when `?simulationRenderer=gpu` is present, the backend is WebGL2 with float render targets, the device tier is desktop, there is no obstacle layout and no dropped boulder (operator decisions above), and the visual radius is at most 16 cells (the cost grows with its square; larger radii stay on the CPU in this card, and the worker may raise the limit if it measures a step under 8 ms there). In every other case the CPU kernel steps as today.
4. Handover: dropping a boulder or choosing a layout copies positions and velocities back into the CPU kernel so the flock carries on from where it was; clearing the field hands it back. If the GPU context is lost the state is gone, so the CPU kernel re-seeds and the flock restarts; that is acceptable.
5. Pointer gestures on Boids edit obstacles (a click drops a boulder, a drag lays a breakwater), so they need nothing on the GPU path beyond the handover in deliverable 4.
6. Parameter changes, reset and preset loads behave as on the CPU path.
7. `src/app/boidsGpu.contract.test.cjs` or a Playwright contract under `e2e/` (the frozen oracle), plus unit tests for any pure helper under the `tsconfig.test.json` convention in `docs/INTERFACE.md`.

## Constraints

- `src/sims/boids/kernel.ts` behaviour is unchanged; an added read or write accessor for positions and velocities is allowed, a change to the `SimKernel` interface shape is not.
- No default, preset, tier count, palette, trail or bloom change. `public/thumbnails/boids.png` unchanged.
- With the switch absent the page is byte-for-byte the CPU path: same `simulationRenderer` value, same state hashes.
- Tablet and phone always step on the CPU (they already keep up); the switch does nothing there.
- No absolute home-directory paths in committed files.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0. Planning base `6d960a11d` plus this card's oracle, 2026-11-13: 516 tests, 433 pass, 0 fail, 83 skipped. Skips are not passes.
2. Worker and verifier: `BOIDS_GPU=168 npx playwright test -c e2e/boids-gpu-168.config.ts` passes all 5 tests with no skips (the config starts its own Vite server on port 5193, viewport 2560x1440 at device pixel ratio 1). Planning base: 1 pass (switch absent), 4 fail at "GPU stepping engages", the intended red. The oracle holds: the switch-absent page on the CPU with unchanged schema defaults and tier counts; with the switch on, at the end of 3600 steps, 28000 boids kept, finite, inside the torus, none over the speed limit and at most 1% under the speed floor; on three loads, counting steps from seeding with the page's own stepping held, median nearest-neighbour distance inside 2.65 to 3.23 cells at step 300, 4.45 to 5.45 at 1200 and 4.5 to 5.5 at 3600, and the share of one heading under 0.15 at 300 and under 0.5 at 1200; a median 15 to 36.5 cells moved in 60 steps; at most 10 ms a step with read-back; and the boulder handover both ways (renderer value, expando and boid count; continuity of the flock across the handover is the verifier's in criterion 6).
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0.
4. Verifier, speed in the page: headless Chromium with `--use-angle=metal --enable-gpu`, 2560x1440, default Boids with the switch on, 600 rendered frames after a 5 s warm-up: median frame interval at most 17 ms; the same reading with the switch absent recorded alongside (about 31 ms expected). If headless frame pacing makes the reading meaningless, say so and report the engine's ms per step from criterion 2 instead; that is then a "not judged", not a PASS.
5. Verifier, look pack: frames at 300, 1200 and 3600 steps by the iteration readout (not by wall time, since the two paths run at different frame rates), switch absent and switch on, default Boids, retained side by side and judged against the Visual goal. Seeds differ between loads, so judge texture, spacing, flock shapes and trails, not positions.
6. Verifier: `npx playwright test e2e/smoke.spec.ts` passes; a parameter change, Reset and a preset load each work with the switch on, and the flock carries on from where it was across a boulder drop and a clear, with no jump in mean position (one sentence of evidence each).
7. Verifier scope: the diff touches only `src/app/boidsGpu.ts`, `src/app/webglRenderer.ts`, seam-only changes to `src/app/renderer.ts` and `src/app/rendererBackend.ts`, accessor-only additions to `src/sims/boids/kernel.ts`, new unit tests, and `tsconfig.test.json` if a pure helper needs listing. No frozen block changes.
8. Operator, not judged by either seat: a side-by-side look after landing, recorded in `HANDOFF.md`. The follow-up card that makes GPU the default is not queued until it is.

## Contract test

- **Test file:** e2e/boids-gpu-168.contract.spec.ts
- **Oracle command:** `BOIDS_GPU=168 npx playwright test -c e2e/boids-gpu-168.config.ts` (all 5 skip without the flag)
- **Assertions digest:** sha256:e477d4c8f377545c450f211d425132056c35d1f71ce7f5878402b05fb6a74006
- **Oracle proof:** on `6d960a11d`, 4 of 5 fail at "GPU stepping engages" (`data-simulation-renderer` is null, not `gpu-boids`); the switch-absent guard passes. Without the flag all 5 skip. Positive side, bounded: the oracle's own readings were run in Node against the CPU kernel behind a stand-in for the `boidsGpu` expando (seed 0, 1707x960, dt 1/60) and gave nearest-neighbour 2.94, 5.00 and 4.99 cells and one-heading share 0.05, 0.21 and 0.41 at steps 300, 1200 and 3600, no boid outside the torus or the speed limits, and 30.2 cells moved in 60 steps: inside every band. The bands are the CPU mean plus or minus 10% over six seeds (2.91 to 2.98, 4.86 to 4.98, 4.90 to 5.16). No GPU reference was built: that is the worker's job, and whether a GPU neighbour scheme lands inside the bands is this card's open risk.

## Out of scope

Making GPU the default (the follow-up card), obstacle steering on the GPU, more or smaller boids or a finer grid (the "low res" follow-up that GPU stepping makes possible), scaling steering by the time step, any flocking-rule change, tablet and phone stepping, the canvas-2D backend.

## Budget

- **Worker wall-clock:** 180 minutes
- **Verifier wall-clock:** 90 minutes
- **Spend basis:** card 164 (sandpile GPU engine, exact parity) is the nearest comparable; this card is larger because the neighbour search is new and parity is statistical. Plan about 25M tokens for one pair, to be replaced by 164's recorded figures at queueing.

## Risks

- **The look may not survive the port.** The opening's texture comes from the pairwise push between boids inside a separation radius (27) wider than the visual radius (14). A neighbour scheme that sees a different subset of neighbours will change that spacing. If parity cannot be reached, the worker stops with a `partial` envelope and the measurements rather than tuning parameters to hide it.
- **Two boids in one cell.** A one-index-per-cell lookup loses a boid from its neighbours' view when two share a cell (about 0.017 boids a cell at the default, so rare, but not at 1280x720 or on dense presets). The worker measures how often and says what it did about it.
- **Large radii.** The neighbour pass costs about 4 ms at radius 14 and 12 ms at 25, so presets with radius 24 to 36 stay on the CPU in this card.
- **Float render targets** are missing on some devices; those stay on the CPU path silently.

## Dispatch envelope

Return the exact commands and exits, the neighbour scheme chosen and why, the measured ms per step and shared-cell rate, the parity readings per load, and the look-pack paths. State PASS, FAIL or partial honestly. If the flock cannot be brought inside the parity bands, stop with a partial envelope and the measurements; do not tune parameters or thresholds. Stop at wall-clock or an unresolved evidence failure; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

Both roles need a browser, and this card declares Requires GUI. The operator's look server on port 5174 serves the primary checkout; leave it alone. The oracle's config starts its own server on 5193 from the run worktree; check `lsof -nP -iTCP:5193 -sTCP:LISTEN` first and stop only a server you started. Headless Chromium needs `--use-angle=metal --enable-gpu` for WebGL2 on this machine; the Playwright config already passes them. The dev server serves modules with an HMR stamp in the URL, so a second `import()` of a kernel module by its plain path is a second instance. Card 167 (parameters panel opens minimised) may land first; the oracle does not use the panel.

## Readiness review

Baselines on `6d960a11d` on 2026-11-13: the frozen oracle 4 of 5 red for the stated reason, 5 of 5 skipped without the flag; `npm run verify` exit 0. Feasibility measured (Surfacing concern). Parity bands measured from the CPU kernel on six seeds. Claims closure: `simulationRendererOverrideFromUrl` in `src/app/webglRenderer.ts` recognises only `cpu` today and feeds `forceCpuSimulation`; Gray-Scott and the sandpile read it, so the new `gpu` value must not change their behaviour. The glyph shader reads the kernel's four-channel grid, so the engine must produce that grid or an equivalent texture. Dropped boulders are obstacles over every layout, so a click on the default view is a handover. Reference frames for the look pack are captured by the verifier from the switch-absent page rather than stored in advance, because every load draws a fresh seed. Cold read by Codex (GPT family, read-only) on 2026-11-13, folded in: the renderer seam files are in scope; desktop tier only; no pointer-impulse deliverable; context loss re-seeds; the look pack compares by step count; the oracle holds the page's stepping and counts steps from seeding.
