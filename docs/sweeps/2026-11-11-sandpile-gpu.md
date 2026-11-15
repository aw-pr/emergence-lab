# Sandpile on the GPU (card 164), 2026-11-11

The WebGL2 backend now steps the Abelian sandpile on the GPU (`src/app/sandpileGpu.ts`), and the CPU kernel is the fallback. State lives in a pair of RG32F textures: r holds the raw grain count, a whole number that float32 stores exactly up to 2^24, and g holds avalanche activity. Each draw runs one synchronous round. Toppling uses integer arithmetic in the shader, because a float quotient such as 12.0 / 12.0 can floor to the wrong bulk. The first round of each kernel step also decays activity and feeds the centre cell. A third RG32F texture holds the kernel's `readState()` layout (normalised height looked up from float32 levels, plus activity). It is rebuilt only when the pile has changed, so the presenting shader, the palettes and the Avalanche glow are unchanged. "Topples per step" maps to `ceil(topples / 2000)` rounds per step, clamped to 1..500 (`src/sims/abelian-sandpile/model.ts`), and one advance queues at most 1,000 rounds. An impulse pours the kernel's exact amounts, computed on the CPU and added through a small delta texture. The fallback is taken when `EXT_color_buffer_float` is missing, when program or state setup fails, and under `?simulationRenderer=cpu`. The GPU path only claims kernels that declare the sandpile's four stepping params.

Measured in headless Chromium (ANGLE Metal, this Mac) at 1440 x 900 with cleared storage, on the Balanced grid of 830 x 493:

| | GPU (`gpu-ping-pong`) | CPU (`cpu-kernel`) |
|---|---|---|
| Mandala settled (2^18 grains, 250 rounds per step) | 2.1-2.3 s from navigation (3 runs), about 50,000 rounds | about 41-47 s (the canvas stopped changing between the 41 s and 47 s screenshots) |
| Sandstorm, reported frame rate after 10 s | 58-65 fps (500 rounds per frame) | 14 fps |

The settled GPU and CPU canvases differed in about 470 of 1,232,640 pixels (0.04 per cent). Every one of them was inside the box under the sidebar's `iter` / `fps` readout, which overlaps the canvas and changes from frame to frame. The pile itself matched. Frame rates in an automated browser are not trustworthy on this machine. They are reported here, not judged.

For card 165: each round is a full-grid pass. At 830 x 493 (409,000 cells) the app sustained about 25,000-32,000 rounds a second, roughly 13 billion cell updates a second. A device-pixel grid at 2880 x 1800 (5.2 million cells) should be about 12 times dearer per round, so 2,000-2,500 rounds a second unscissored, which matches the orchestrator's 4,000 measured without the app's presentation and readout overhead. Mandala's 52,000 rounds would then take about 20 s, and Sandstorm's 500 rounds per frame would drop well under 10 fps. Scissoring the pass to the pile's bounding box, or a frame-time governor on rounds per frame, is the lever. Once the pile settles the passes keep running as no-ops (there is no early exit), so a settled-pile check would also free the GPU. `thumbnail.ts` will step the sandpile on the GPU the next time thumbnails are generated.

## Device-pixel fitting recovery (card 165, attempt 2, incomplete)

The preserved implementation was restored and the operator-authorised parameter-order snapshot now includes `fitPile` after `topplesPerStep`. Desktop GPU defaults use Extreme with a fitted pile; CPU fallback, tablets and phones keep Balanced. The five presets explicitly disable fitting and retain their four existing values. The device-pixel grid has no upward scaling, while the logistic map keeps its Extreme floor.

For grids above 262,144 cells, each batch is scissored to monotone occupied bounds (grains or activity) plus one cell of padding per scheduled round. An 8-by-8 GPU reduction after the batch finds the occupied bounds; impulses enlarge them, and grid-edge clamping preserves the open boundary. Completed-batch timing, including the reduction readback, estimates round cost against a 12 ms budget. The first batch runs up to 128 rounds; subsequent batches run up to the requested ceiling if the estimate allows it. Partial steps carry their remaining rounds across frames, so feeding and activity decay happen once per logical step. Smaller grids retain the original exact whole-step schedule. Large-grid correctness and performance remain unverified.

`npm run verify` exited 0 on the final implementation: 514 tests, 431 passed, 0 failed, 83 skipped. The frozen contract gate also exited 0. Neither browser oracle was run in this attempt.

Thumbnail generation ran alone as the browser workload, using the unchanged 2,000 sandpile steps. It wrote Gray-Scott, sandpile and Ising images, then exited 1 with “Execution context was destroyed, most likely because of a navigation.” The worker changed the GPU source while generation was active, likely triggering Vite's reload. Following the recovery brief's stop rule, all 26 thumbnails were restored byte for byte from HEAD; the sandpile thumbnail is therefore unchanged. Settling of the generated still was not confirmed.

No isolated fitted-pile settle time or frame rate, Sandstorm frame rate, tablet run or retained screenshot was obtained. Earlier provisional measurements are not reused. Failure logs and the thumbnail byte-restoration record are retained under `state/uat/165-sandpile-device-pixel-fit/attempt-2/worker/`. Another attempt requires an operator decision.

## Device-pixel fitting validation (card 165, attempt 3, 2026-11-12)

This attempt restored the preserved implementation and collected fresh evidence, superseding the incomplete attempt above. Source was unchanged throughout browser validation, isolated measurements and thumbnail generation. Each browser workload finished before the next began.

Measured alone in headless Chromium with ANGLE Metal, cleared storage, a 1440 x 900 viewport and device-pixel ratio 2:

| Configuration | Grid | Settle time | Measured requestAnimationFrame rate |
|---|---|---|---|
| Kernel default, fitting on, Extreme | 2880 x 1712, equal to the display backing store | 120.011 s from navigation, sampled every 3 s | 1,576 frames in the first 20 s: 78.8 fps |
| Sandstorm, fitting off, Extreme | 2880 x 1712 | Continuously fed; no settled state expected | 2,950 frames over 20.194 s: 146.1 fps |

The fitted pile retained exactly 3,973,741 grains, had maximum height 3 and zero four-fold symmetry mismatches, and measured 1,449 cells across and tall (84.6% of the short side). Both the 150 s settle limit and the 15 fps floor were met. Sandstorm advanced from 384 to 169,150 rounds during its measurement. Mandala retained its Initial pile value of 262144 and settled to exactly 262,144 grains, 375 cells across, in 6.322 s. Switching fitting off and back on restored totals of 262,144 and 3,973,741 respectively. An isolated coarse-pointer tablet context (820 x 1180, DPR 2) opened at Balanced on the GPU, used a 544 x 753 grid and settled 401,226 fitted grains in 6.247 s.

The validated round limit uses monotone occupied bounds, including avalanche activity, with a halo of one cell per scheduled round. An 8 x 8 GPU reduction measures the occupied rectangle after each large-grid batch; impulses enlarge it and the scissor clamps to the open grid boundary. Above 262,144 cells, completed-batch timing (including reduction readback) estimates rounds affordable within 12 ms, bounded by the requested rounds and the existing 1,000-round advance cap. The first batch runs at most 128 rounds. Unfinished logical steps carry their remaining rounds into the next frame, so feeding and activity decay occur once per logical step. Smaller grids keep the exact original whole-step schedule. Both browser contracts validated the applicable correctness checks, and the isolated measurements above validated large-grid responsiveness.

`node scripts/generate-thumbnails.mjs` exited 0 and wrote all 26 images, with no edits or other browser work during the run. The sandpile step count remains 2,000. Every other thumbnail was restored byte for byte from HEAD. A fresh replay through `paintKernelThumbnail` at 640 x 400 ran exactly 500,000 rounds, retained 216,926 grains with maximum height 3, and differed from the generated PNG in zero pixels. Only `public/thumbnails/abelian-sandpile.png` changed.

Evidence is retained under `state/uat/165-sandpile-device-pixel-fit/attempt-3/worker/`: `measurements.json`, `thumbnail-proof.json`, `thumbnail-restoration.json`, the full-resolution `fitted-settled.png`, `sandstorm.png`, `tablet.png` and `gallery-card-final.png`. Frame rates are the measured rAF counts in this automated browser, not a promise of hardware-independent performance. Operator visual sign-off remains the post-landing step.

Final checks exited 0: `npm run verify` (514 tests, 431 passed, 83 skipped); `SANDPILE_DEFINITION=165 npx playwright test -c e2e/sandpile-definition.config.ts` (6 passed, no skips); `scripts/check-contract-test-gate.sh --worktree`; `SANDPILE_GPU=164 npx playwright test -c e2e/sandpile-gpu.config.ts -g "rounds per step|bit-identical|fed pile|impulse|switched off"` (5 passed); `npx playwright test --config e2e/gray-scott-gpu.config.ts e2e/gray-scott-gpu.spec.ts` (3 passed, 1 skipped); and `npx playwright test e2e/smoke.spec.ts e2e/sandpile-palettes.spec.ts` (44 passed). No fixtures changed. The independent verifier and the operator's visual review remain separate steps.
