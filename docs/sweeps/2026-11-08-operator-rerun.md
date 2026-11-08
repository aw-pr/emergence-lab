# Operator re-run: interestingness and Gray-Scott Waves, 2026-11-08

> **Evidence files.** Sweep output (ranked JSON, report tables, PNGs) is git-ignored. Paths below are plain text, relative to the repository root, so they can be matched against a local run. They are not links.

**Status.** The base interestingness sweep re-ran today for Gray-Scott, Abelian Sandpile, Cyclic CA, Diffusion-Limited Aggregation, 2D Ising and Game of Life. All six passed, and every shipped-preset reference reproduces its recorded score. The stage-146 second passes for Sandpile, DLA and Ising also completed, but stage 146 failed verification on 2026-10-30, so those numbers are context only. The second passes for Gray-Scott (stage 143), Cyclic CA and Life (stage 147) stopped on the source-hash guard and wrote no ranked JSON. A separate 182-set Gray-Scott fine sweep around Waves measured development speed and per-step cost. No production file changed and no preset is promoted. The operator is asked to decide on one Sandpile candidate, the Cyclic CA square scrolls already on the 2026-10-30 shortlist, whether Waves stays as it is, and how to pursue Gray-Scott speed on large grids.

## How this run was made

Each base sweep ran with `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "<title>" --reporter=list`, against the dev server already running on port 5173. The second passes used the `sweep 143 …`, `sweep 146 …` and `sweep 147 … missed regimes` titles with `--workers=1`. Other sweeps were running on the same 12-core machine at the time (load average 9 to 18), so every wall-clock figure here is approximate.

Two visual judges looked at the PNGs for each kernel. A single frame cannot show motion, so the harness's `temporalFlux` stands in as the motion proxy throughout. Every image path cited below was checked to exist on disk at the time of writing.

| Kernel | Sets + refs | References reproduce | Best non-shipped by score | Judge | Proposal |
|---|---|---|---|---|---|
| Gray-Scott | 56 + 7 | Yes, nine-point column, 6 dp | F 0.018 k 0.0523, 0.797 | Halfway between Waves and Spots | None |
| Gray-Scott Waves fine | 182 + Waves | Yes, to the digit | F 0.020 k 0.051, 0.836 | Ties Waves | Keep Waves; optional live look |
| Abelian Sandpile | 32 + 3 | Yes, stage-59 appendix | pile 60000 thr 6 g 32, 0.563 | thr 5 sibling is a new rule | Add or retarget, after a live look |
| Cyclic CA | 14 + 3 | Yes | states 14 thr 1 vN, 0.788 | Transient; nothing new | Square scrolls (stored 147 data), gated |
| DLA | 45 + 3 | Yes | stick 0.15 spawn 0.12 seeds 1, 0.542 | Same as Dense coral | None |
| 2D Ising | 21 + 4 | Yes, to the digit | field 0.02 T 2.1, 0.456 | Interpolation of two presets | None |
| Game of Life | 45 + 3 | Yes | B3/S345 seed 0.05, 0.387 | Transient; becomes Maze-like | None |

### Why three second passes stopped

The 143 and 147 selectors compare the source hashes of `src/app/presets.ts`, `e2e/harness/metrics.ts` and the kernel against the manifest stored by their earlier runs. The metrics and kernel hashes matched. The `src/app/presets.ts` hash did not: it is now `0e6362bf…`, and the stored manifests carry `d8c97c22…`. The only change to that file since those runs is `8cda459a4` (2026-11-03), which adds Physarum's Restless threads preset. No preset for any of the six kernels here changed. The guard is doing its job, but it hashes the whole file, so an unrelated preset blocks the re-run.

The stored outputs were not overwritten. Re-running these passes means moving the stored output aside first. That was not done today.

## Gray-Scott

**Harness.** 128×128 grid, 700 warm-up `step()` calls at the presets' `stepsPerFrame` 20, flux gap 12, scored on the V channel with coverage threshold 0.1. Du 0.2097, Dv 0.105. The kernel default stencil is nine-point (since `3390cff76`, 2026-09-08), and no preset overrides it. The run covered 56 F/k sets and 7 references and took about 3.8 minutes.

**Reference reproduction.** All six shipped presets match the nine-point column of "The six presets under nine-point, for the record" in [gray-scott-interestingness.md](gray-scott-interestingness.md) to six decimals:

| Preset | Recorded | This run |
|---|---:|---:|
| Waves | 0.835836 | 0.835836 |
| Spots | 0.757656 | 0.757656 |
| Coral | 0.706525 | 0.706525 |
| Worms | 0.705872 | 0.705872 |
| Maze | 0.694360 | 0.694360 |
| Mitosis | 0.657152 | 0.657152 |

The retired U-skate pair scores 0.153677, which matches that doc's nine-point row. Coral equals the nine-point regression literal in `e2e/sweep.spec.ts` (0.7065245840037978) exactly.

The doc's headline values (Waves 0.796346 and so on) are five-point scores from before the default stencil changed. The analysis pass compared against those and read the gap as possible pool-relative normalisation. That reading is wrong: the score is per set, and the six presets reproduce against the correct column.

**Top three.** Rank 1 (F 0.018, k 0.0487) and rank 4 (F 0.026, k 0.0597) are Waves and Spots themselves, so the top three distinct points are:

| Set | Params | Score | Delta vs Waves 0.8358 | Delta vs Spots 0.7577 | Flux | Coverage |
|---|---|---:|---:|---:|---:|---:|
| Waves (rank 1) | F 0.018, k 0.0487 | 0.8358 | 0 | +0.0782 | 0.145 | 0.64 |
| F0.018_k0.0523 | F 0.018, k 0.0523 | 0.7970 | -0.0388 | +0.0393 | 0.065 | 0.40 |
| F0.026_k0.056 | F 0.026, k 0.056 | 0.7704 | -0.0654 | +0.0127 | 0.021 | 0.62 |

Ranks 6 to 8 (F 0.058 k 0.0633, F 0.034 k 0.0597, F 0.05 k 0.0633) are static labyrinths, with flux below 0.002.

**Visual judge.** No point beats the shipped presets.

- **F 0.018, k 0.0523** (`e2e/artifacts/gray-scott/F0.018_k0.0523.png`) is the only non-shipped point in the wave family. It shows broken arc fragments and bean-shaped lobes, part-way from Waves' rings to Spots' blobs, and it moves less than half as much as Waves (flux 0.065 against 0.145). It is a halfway point between two shipped presets, not a new regime.
- **F 0.026, k 0.056** (`e2e/artifacts/gray-scott/F0.026_k0.056.png`) is a variation on Maze, one grid step from Maze's parameters.
- **The static labyrinths** are Coral and Worms clones, or close to Maze.

Waves (`e2e/artifacts/gray-scott/waves.png`) has both the highest score and the highest flux. The composite and the operator's preference for Waves agree.

**Proposal.** No promotion proposed.

**Stage 143 second pass.** Before the hash guard fired, it ran for about 3.6 minutes and wrote a single-snapshot table (`e2e/artifacts/sweep-143-gray-scott/report.md`; top row c01, F 0.0165 k 0.04875 Dv 0.085, 0.824). There is no ranked JSON and no validation, so that table is not used here.

### Waves neighbourhood fine sweep

**Method.** A scratch Node script (not committed) drove the compiled kernel `.test-build/sims/gray-scott/kernel.js` and scored with `scoreFrames` from `e2e/harness/metrics.ts`. Settings: V channel, 128×128, coverage threshold 0.1. Frame B is taken 12 `step()` calls after frame A, as `driveKernel` does. Base params Du 0.2097, Dv 0.105, `stepsPerFrame` 20, dt 1, nine-point.

The grid is F 0.010 to 0.034 in steps of 0.002, crossed with k 0.045 to 0.058 in steps of 0.001: 182 sets. Each set is scored at checkpoints 50, 100, 150, 200, 300, 400, 500 and 700 `step()` calls on a single trajectory. The run took about 114 s on a pool of six workers.

Reproduction is exact:

| Check | Recorded | This path |
|---|---:|---:|
| Waves, five-point | 0.7963458726372294 | 0.7963458726372294 |
| Spots, five-point | 0.7411929696553551 | 0.7411929696553551 |
| U-skate, nine-point | 0.153677 | 0.1536770 |

Output: `e2e/artifacts/gray-scott-waves-2026-11-08/` (`ranked.json`, `index.md`, `images/`).

Two diagnostics were added on top of the harness. They are not harness metrics:

- **Late mean and late min:** the composite over checkpoints 300, 400, 500 and 700.
- **framesTo90pctFine:** the first of frames 5, 10, …, 50 at which the composite reaches 90% of its 700-call value. This was run for the top 20 and for Waves.

**Ranked, top ten (nine-point), plus the Waves reference.**

| # | F | k | Score @700 | Delta vs Waves | framesTo90pct | Fine | Flux | Late mean | Late min |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.020 | 0.051 | 0.8362 | +0.0003 | 50 | 10 | 0.110 | 0.825 | 0.789 |
| 2 | 0.018 | 0.049 | 0.8336 | -0.0022 | 50 | 10 | 0.128 | 0.812 | 0.774 |
| 3 | 0.024 | 0.055 | 0.8236 | -0.0122 | 50 | 15 | 0.060 | 0.784 | 0.756 |
| 4 | 0.022 | 0.054 | 0.8227 | -0.0131 | 50 | 30 | 0.073 | 0.816 | 0.803 |
| 5 | 0.020 | 0.050 | 0.8198 | -0.0160 | 50 | 10 | 0.159 | 0.828 | 0.818 |
| 6 | 0.018 | 0.048 | 0.8195 | -0.0163 | 50 | 10 | 0.120 | 0.804 | 0.753 |
| 7 | 0.022 | 0.051 | 0.8177 | -0.0181 | 50 | 10 | 0.047 | 0.773 | 0.738 |
| 8 | 0.020 | 0.049 | 0.8145 | -0.0213 | 50 | 10 | 0.142 | 0.833 | 0.815 |
| 9 | 0.018 | 0.050 | 0.8126 | -0.0232 | 50 | 10 | 0.151 | 0.818 | 0.808 |
| 10 | 0.020 | 0.053 | 0.8077 | -0.0281 | 50 | 10 | 0.105 | 0.813 | 0.808 |
| Waves | 0.018 | 0.0487 | 0.8358 | 0 | 50 | 10 | 0.145 | 0.822 | 0.788 |

Image for each row: `e2e/artifacts/gray-scott-waves-2026-11-08/images/F<F>-k<k>-9pt.png`, for example `F0.020-k0.0510-9pt.png`. The Waves reference is `waves-reference-9pt.png` in the same folder.

**Reading.**

- **The top twelve cannot be ranked.** They sit within 0.034 of each other, which is less than the regime's own pulsing: Waves reads 0.788 to 0.836 across checkpoints 300 to 700. A single 700-call snapshot cannot separate them, and Waves is effectively tied with the best grid point.
- **The live band.** 93 of the 182 sets stay alive. The live band runs diagonally, from F 0.010 to 0.016 at k 0.047 to 0.054, up to F 0.028 to 0.034 at k 0.054 to 0.058.
- **The PNGs look dim.** They map V from [0, 1] to greyscale with no contrast stretch, and V peaks at about 0.43. The faint mesh visible when they are scaled up is a display artefact: the Nyquist-mode amplitude is about 1e-7.

**Development speed.** The checkpoint measure saturates: 81 of the 93 living sets, including every one of the top 17, reach 90% of their final score by the first checkpoint (frame 50). The fine pass separates them a little. Most reach 90% by frame 10. The slower ones are:

- F 0.020, k 0.055: frame 35
- F 0.022, k 0.054: frame 30
- F 0.024, k 0.057: frame 25
- F 0.024, k 0.055: frame 15

On this grid the composite is a weak speed signal. It plateaus once coverage passes about 0.12, which the seven seed blobs reach within about 5 frames. How quickly the pattern fills a large app canvas depends on the 56-cell seed spacing and the front speed, and a 128×128 run does not measure that.

**Five-point against nine-point.** The top eight and Waves were re-run under five-point.

| Set | Nine-point | Five-point | Nine minus five | Five-point late mean | Five-point late min | Five-point flux |
|---|---:|---:|---:|---:|---:|---:|
| Waves (0.018, 0.0487) | 0.8358 | 0.7963 | +0.0395 | 0.804 | 0.779 | 0.149 |
| 0.020, 0.051 | 0.8362 | 0.8060 | +0.0302 | 0.818 | 0.794 | 0.137 |
| 0.018, 0.049 | 0.8336 | 0.7909 | +0.0427 | 0.808 | 0.788 | 0.149 |
| 0.024, 0.055 | 0.8236 | 0.8082 | +0.0154 | 0.789 | 0.771 | 0.033 |
| 0.022, 0.054 | 0.8227 | 0.8163 | +0.0064 | 0.811 | 0.795 | 0.053 |
| 0.020, 0.050 | 0.8198 | 0.8329 | -0.0131 | 0.824 | 0.805 | 0.115 |
| 0.018, 0.048 | 0.8195 | 0.8434 | -0.0239 | 0.823 | 0.786 | 0.128 |
| 0.022, 0.051 | 0.8177 | 0.7889 | +0.0288 | 0.750 | 0.719 | 0.035 |
| 0.020, 0.049 | 0.8145 | 0.8369 | -0.0224 | 0.800 | 0.752 | 0.132 |

Across the top eight, nine-point minus five-point ranges from -0.024 to +0.043, with a mean of +0.008. The sign changes from set to set, so the stencil gives no systematic gain in score. Nine-point mainly raises coverage.

The composite cannot see grid anisotropy, which is the reason nine-point shipped. The stage-76 record also notes that Waves itself changes character between the two: "soft mottled fronts on black" under five-point, and "crisp bright rings" under nine-point. Five-point images for these sets are the `-5pt.png` files in the same folder.

**Per-step cost at 1280×1280.** Measured in Node on the compiled kernel, not in the browser. Each figure is the median of three fresh-worker runs, each with 5 warm-up and 20 timed steps.

| Stencil | ms per Euler pass (`stepsPerFrame` 1) | ms per `step()` at `stepsPerFrame` 20 | Per pass at 20 |
|---|---:|---:|---:|
| five-point | 16.7 | 267 | 13.4 |
| nine-point | 23.0 | 454 (runs 401, 454, 455) | about 22.7 |

Nine-point costs about 1.4× five-point at `stepsPerFrame` 1, and about 1.5 to 1.7× at 20. At the shipped `stepsPerFrame` 20, one simulation step costs about 270 ms (five-point) or 450 ms (nine-point) at this grid. That is roughly 3.7 or 2.2 steps per second before any rendering, so neither stencil runs in real time on the CPU path.

Gray-Scott has one implementation, the CPU kernel in `src/sims/gray-scott/kernel.ts`. The explicit-Euler loop does the same work whatever F and k are, so no parameter choice in the Waves band changes this cost. Only the stencil, `stepsPerFrame` and grid size move it.

**Fastest good waves, in plain English.**

1. **Keep Waves as shipped.** It ties the best point in its neighbourhood (0.836 against 0.836), has the highest flux of the top group, and settles as fast as anything measured: 90% of its final score by frame 10.
2. **Two neighbours are worth a live look if the operator wants a steadier version.** F 0.020, k 0.050 holds the most even score once developed (late min 0.818) and has the highest flux in the top six (0.159). F 0.020, k 0.049 has the highest late mean in the grid (0.833). Both settle by frame 10, the same as Waves. Neither is faster to compute.
3. **For frame rate on large grids, the lever is the stencil or the step budget, not F and k.** Five-point is about 1.4 to 1.7× cheaper per frame. Under five-point, F 0.020 k 0.050 scores 0.833 (late mean 0.824, late min 0.805), on a par with nine-point Waves (0.836, 0.822, 0.788). A five-point preset at that point could keep the composite at lower cost, but whether it still reads as Waves needs a live look: the score is blind to grid-axis artefacts, and the shipped Waves changes look between stencils. Cutting `stepsPerFrame` would also be cheaper but slows the pattern's development on screen. Both of these are operator calls, not findings.

## Abelian Sandpile

**Harness.** 256×256 grid, 200 warm-up steps, flux gap 4, channel 0, coverage threshold 0.25. 32 sets (initialPile × toppleThreshold × grainsPerStep, with topplesPerStep 120000) plus 3 references. About 1 minute.

**Reference reproduction.** Today's numbers match the stage-59 appendix of [abelian-sandpile-interestingness.md](abelian-sandpile-interestingness.md) (2026-08-25, after the conservation fix):

- References: Classic critical 0.416, Fast avalanches 0.417, High threshold 0.421.
- Best set per threshold: top 0.563, best threshold 5 0.551, best threshold 8 0.479.
- The 2026-08-23 winner (pile 25000, thr 4, grains 32) reproduces at 0.5161.

The analysis pass called the doc stale because it compared against the original 2026-08-23 section, which recorded blank fields above threshold 4. The appendix already supersedes that section.

**Top three by score.** The best reference is High threshold, 0.4212.

| Set | Params | Score | Delta vs High threshold | Flux | Coverage |
|---|---|---:|---:|---:|---:|
| pile60000 thr6 g32 | initialPile 60000, toppleThreshold 6, grainsPerStep 32, topplesPerStep 120000 | 0.5633 | +0.1422 | 0.067 | 0.21 |
| pile25000 thr5 g32 | initialPile 25000, toppleThreshold 5, grainsPerStep 32 | 0.5505 | +0.1294 | 0.025 | 0.14 |
| pile60000 thr5 g32 | initialPile 60000, toppleThreshold 5, grainsPerStep 32 | 0.5271 | +0.1059 | 0.091 | 0.19 |

**Visual judge.** The judge ranks pile 60000, threshold 5, grains 32 first (`e2e/artifacts/abelian-sandpile/initialPile60000_toppleThreshold5_grainsPerStep32.png`). It is a high-contrast four-fold mandala with a visible ring and lacy petals. The threshold-6 sibling (`initialPile60000_toppleThreshold6_grainsPerStep32.png`) is paler at the rim.

The judge's case rests on the kernel rule, not the score:

- **Thresholds 5 and 6 are a different rule.** In `kernel.ts` a topple at threshold 5 or 6 sheds 4 grains, so stable heights run 0 to 4 or 0 to 5. No shipped preset runs that rule.
- **High threshold is the classic rule in disguise.** At threshold 8, with an even pile and an even feed, it reduces to the classic threshold-4 rule on paired grains.
- **Smaller piles read better than the presets at step 200.** The frame maps grains mod threshold to brightness, so an unsettled pile renders as noise. All three shipped presets (100k to 350k grains) are still noise discs at step 200. The 25k to 60k piles have settled into fractals by then, and the score rewards that.

On motion:

- **Threshold 5, grains 32:** flux 0.091, partly residual settling. Its grains-1 twin shows the same 0.0909.
- **Threshold 6, grains 32:** after settling, the 32-grain feed sustains about 0.067. Its grains-1 twin is effectively frozen at 6e-5.
- **Pile 25000, threshold 4:** the familiar classic fractal, but the same rule as Classic critical at a smaller scale.

**Proposal (judge, not adopted).** Add `{ id: "dense-mandala", label: "Dense mandala", params: { initialPile: 60000, toppleThreshold: 5, grainsPerStep: 32, topplesPerStep: 120000 } }` to the `abelian-sandpile` presets. The alternative is to retarget High threshold to those params. Two checks come first:

1. An operator look in the app palette, since the sweep PNG is greyscale channel 0.
2. Confirmation that it keeps avalanching after it settles.

**Stage 146 second pass.** It completed: 48 candidates and 3 references in about 4.5 minutes, with replay delta 0 on 6 finalists. The top rows are the same withheld suggestions as on 2026-10-30: c39 (grains 120, topples 700000) at 0.524, c40 at 0.524, and c30 (grains 50, topples 250000) at 0.522. It wrote only `e2e/artifacts/sweep-146-abelian-sandpile/report.md`.

Stage 146 failed verification over the conservation diagnostics for its references, and that was not re-checked today. Its axes and settings also differ from the base sweep, so its scores are not comparable and are not used.

## Cyclic CA

**Harness.** 128×128 grid, 200 warm-up steps, flux gap 4, channel 0, coverage threshold 0.5. 14 von Neumann sets (states 10 to 16 × threshold 1 to 2) plus 3 references. About 8 seconds.

**Reference reproduction.** Demons 0.753, Turbulence 0.719, and all 14 grid rows match the 2026-08-23 and 2026-08-25 sections of [cyclic-ca-interestingness.md](cyclic-ca-interestingness.md). The harness's Crystal lattice reference still uses the pre-stage-61 threshold-2 params, which give a frozen 0.283. The shipped Crystal lattice (states 12, threshold 1, von Neumann) appears in the grid as `states12_threshold1`, at 0.626.

**Top three by score.** The best reference is Demons, 0.7528.

| Set | Params | Score | Delta vs Demons | Flux |
|---|---|---:|---:|---:|
| states14_threshold1 | states 14, threshold 1, von Neumann | 0.7884 | +0.0357 | 0.245 |
| states15_threshold1 | states 15, threshold 1, von Neumann | 0.7596 | +0.0068 | 0.136 |
| states13_threshold1 | states 13, threshold 1, von Neumann | 0.6643 | -0.0885 | 0.435 |

**Visual judge.** None of today's candidates beats the shipped presets.

- **States 14 and 15** (`e2e/artifacts/cyclic-ca/states14_threshold1.png`, `states15_threshold1.png`) are mid-nucleation snapshots at step 200. Their flat, unconsumed plates inflate autocorrelation. Once settled, states 14 would be a line-weight twin of Crystal lattice.
- **States 10 to 13** are the diamond-spiral regime Crystal lattice already ships, at different band widths.
- **Threshold 2** is frozen everywhere (flux 0).

**Stage 147 second pass.** It ran all 51 measurements in about 44 seconds, then stopped on the hash guard. Nothing was overwritten.

The card-147 candidate c43 (states 23, Moore, threshold 1) exists only in the stored output, `docs/sweeps/data/2026-10-30/147/cyclic-ca.json`. There it ranks first of 48 at 0.887482, against Demons 0.752 under the 147 method, a lead of about +0.135. The judge viewed its stored renderer frames:

- `docs/images/sweeps-2026-10-30/147-cyclic-ca-c43-renderer-t200.png`
- `docs/images/sweeps-2026-10-30/147-cyclic-ca-c43-renderer-t500.png`
- `docs/images/sweeps-2026-10-30/147-cyclic-ca-c43-renderer-t1000.png`
- `docs/images/sweeps-2026-10-30/147-cyclic-ca-c43-renderer-t2000.png`

Broad, axis-aligned nested square scrolls form by step 500 and hold through step 2000. Next to them, Demons is a fine hook texture and Crystal lattice is fine 45-degree diamonds. Flux is 0.247, against Demons' 0.438.

One new caveat comes from the stored data: states 21 under the same rule nearly freezes (seed 0, 128², flux 0.046, score 0.274). States 22 and 24 are untested.

**Proposal (judge, not adopted).** Add `{ id: "square-scrolls", label: "Square scrolls", params: { states: 23, threshold: 1, neighbourhood: "moore" } }` as a fourth preset, keeping the other three unchanged. This is the same candidate already on the 2026-10-30 shortlist; today adds no new measurement of it. Two checks come first:

1. An operator look in the app.
2. A headless check at states 22 and 24 (Moore, threshold 1, seeds 0 to 2, at 128 and 384), to see how close the preset sits to a dead field.

## Diffusion-Limited Aggregation

**Harness.** 192×192 grid, 500 warm-up steps, flux gap 6, channel 0, coverage threshold 0.05. walkersPerStep 64, maxWalkSteps 400, seed 7. 45 sets (stickiness × spawnRadius × seedCount) plus 3 references. About 15 seconds.

**Reference reproduction.** Today's references match [diffusion-limited-aggregation-interestingness.md](diffusion-limited-aggregation-interestingness.md) at its recorded precision: Dense coral 0.5415 (recorded 0.542), Multi-seed 0.3349 (0.335), Branching 0.3283 (0.328). The top three candidates (0.542, 0.542, 0.536) match too. Flux is 0 for every set, because the harness scores the terminal state.

**Top three by score.** The best reference is Dense coral, 0.5415.

| Set | Params | Score | Delta vs Dense coral |
|---|---|---:|---:|
| stickiness0.15_spawnRadius0.12_seedCount1 | stickiness 0.15, spawnRadius 0.12, seedCount 1 | 0.5424 | +0.0008 |
| stickiness0.15_spawnRadius0.06_seedCount4 | Dense coral itself | 0.5415 | 0 |
| stickiness0.15_spawnRadius0.03_seedCount4 | stickiness 0.15, spawnRadius 0.03, seedCount 4 | 0.5355 | -0.0060 |

**Visual judge.** Every stickiness-0.15 frame shows the Dense coral regime: one dense, fuzzy round cluster.

- **The top candidate** (`e2e/artifacts/diffusion-limited-aggregation/stickiness0.15_spawnRadius0.12_seedCount1.png`) is slightly more open, but its +0.0008 lead is noise.
- **The 0.06/4 candidate** is the shipped preset. Its PNG has the same md5 as `dense-coral.png`.
- **seedCount** makes no visible difference.
- **Stickiness** is the only parameter that changes the look, and the shipped trio already covers both regimes this kernel reaches.

**Proposal.** No promotion proposed.

**Stage 146 second pass.** It completed: 48 candidates and 3 references in about 50 seconds. The top row is c03 (stickiness 0.04, spawnRadius 0.16, seeds 2) at 0.290. It is on a different scale, and it comes from a stage that failed verification, so it is not used.

## 2D Ising

**Harness.** 128×128 grid, 300 warm-up steps, flux gap 4, channel 0, coverage threshold 0.5. J 1, 0.5 sweeps per step, random start, seed 7. 21 sets (externalField × temperature) plus 4 references. About 8 seconds.

**Reference reproduction.** Today's references match [ising-model-interestingness.md](ising-model-interestingness.md):

- Cold quench 0.5644 (recorded 0.564), Critical 0.4572 (0.457), Hot noise 0.2217 (0.222).
- Positive field 0.5190352004615919 matches the 2026-08-25 appendix to the digit.
- The 21 grid rows match the recorded table.

**Top three by score.** The best reference is Cold quench, 0.5644.

| Set | Params | Score | Delta vs Cold quench | Flux | Coverage |
|---|---|---:|---:|---:|---:|
| externalField0.02_temperature1.8 | Positive field itself | 0.5190 | -0.0453 | 0.059 | 0.77 |
| externalField0.02_temperature2.1 | field 0.02, T 2.1 | 0.4563 | -0.1081 | 0.105 | 0.78 |
| externalField0.02_temperature2.4 | field 0.02, T 2.4 | 0.3552 | -0.2092 | 0.206 | 0.74 |

**Visual judge.** No promotion.

- **Field 0.02, T 1.8** is byte-identical to the shipped Positive field render.
- **Field 0.02, T 2.1** (`e2e/artifacts/ising-model/externalField0.02_temperature2.1.png`) is a frayed, speckled Positive field. Its flux sits between Positive field and Critical, which makes it an interpolation of two shipped presets.
- **Field 0.05 and above** magnetises the lattice into near-uniform white (coverage 0.86 to 0.92).

**Stage 146 second pass.** It completed: 48 candidates and 4 references in about 1.7 minutes, with replay delta 0. The top rows are:

- c03: 0.580 (T 0.84, J 0.6, checkerboard)
- c01: 0.570 (the same, random start)
- c04: 0.565 (T 2.38, J 1.4, random, flux 0.060)

The judge's only plausible lead is c04, an ordered-phase regime whose domains still move. It has no image or ranked JSON, and stage 146 failed verification, so it would need re-measuring and rendering before anyone judges it. c03 and c01 are near-frozen and risk duplicating Cold quench.

**Proposal.** No promotion proposed.

## Game of Life

**Harness.** 128×128 grid, 200 warm-up steps, flux gap 4, channel 0, coverage threshold 0.1. B3, spark 0.1, age shading on. 45 sets (survival window × seed density) plus 3 references. About 12 seconds.

**Reference reproduction.** Today's references match [game-of-life-interestingness.md](game-of-life-interestingness.md) at its precision: Conway 0.374, Dense ash 0.411 (the promoted value), Maze-like 0.0817. The Maze-like figure is the original single-lag score; the doc's later multi-lag rescoring is not part of this harness.

**Top three by score.** The best reference is Dense ash, 0.4107.

| Set | Params | Score | Delta vs Dense ash | Flux | Coverage |
|---|---|---:|---:|---:|---:|
| surviveMin2_surviveMax3_seedDensity0.4 | Dense ash itself | 0.4107 | 0 | 0.060 | 0.19 |
| surviveMin3_surviveMax5_seedDensity0.05 | B3/S345, seed 0.05 | 0.3875 | -0.0232 | 0.054 | 0.42 |
| surviveMin2_surviveMax3_seedDensity0.28 | Conway itself | 0.3738 | -0.0369 | 0.041 | 0.14 |

**Visual judge.** No promotion.

- **B3/S345 at seed 0.05** (`e2e/artifacts/game-of-life/surviveMin3_surviveMax5_seedDensity0.05.png`) is the only frame that looks new: expanding amoeba-like colonies. It is a growth transient. The judge stepped the kernel in Node with the same params, and its step-200 frame matches the harness PNG. The colonies fill the board by about step 500. From then to step 4000 they hold a near-static fine maze: alive coverage about 0.59, flux 0.003 to 0.007. That is a denser version of the shipped Maze-like. The harness flux of 0.054 measures the growth phase only. The judge's scratch renders were not kept in the repository.
- **The B3/S1-3 sets** (ranks 5 to 8) are full-field grey churn with no legible structure.

**Stage 147 second pass.** It ran 51 measurements in about 30 seconds, then stopped on the hash guard. The stored 147 Life result, in which c19 was rejected, is unchanged.

**Proposal.** No promotion proposed.

## Decisions for the operator

1. **Sandpile.** Look at pile 60000 / threshold 5 / grains 32 in the app. If it reads well and keeps avalanching, choose between adding it as "Dense mandala", retargeting High threshold to it, or leaving the menu as it is.
2. **Cyclic CA.** Square scrolls (states 23, Moore, threshold 1) remains a candidate addition from the 2026-10-30 shortlist. Decide whether to commission the states 22 and 24 neighbour check and a live look before any addition.
3. **Gray-Scott Waves.** Keep Waves as shipped (recommended), or watch F 0.020 k 0.050 and F 0.020 k 0.049 live as steadier alternatives. Neither develops faster or computes faster than Waves.
4. **Gray-Scott speed on large grids.** F and k do not change the per-step cost. Choose whether to pursue speed through the stencil (five-point is about 1.4 to 1.7× cheaper per frame, but changes the look), through the step budget, or through a performance card on the kernel itself.
5. **Ising.** Decide whether card 146's c04 (T 2.38, J 1.4) is worth re-measuring and rendering under a fresh card.
6. **Stale baselines.** Decide whether to move the stored 143 and 147 outputs aside so those second passes can re-run against the current `src/app/presets.ts`, or to narrow the guard to each kernel's own presets.
7. **DLA and Game of Life.** No action proposed.
