# Cycle-palette sweep audit, 2026-09-20

**Verdict:** (a) the measured global escape-boundary depths are **0.515314 c-units in the analytic main cardioid region** and **0.251690 c-units in the period-2 disc**. The review's roughly 0.4 cardioid estimate is 28.8% low, so the operator should reread the `cycleBands` recommendation; the 0.25 disc estimate is within 0.7%. (b) The offline top ten is not robust: no committed top-ten ramp survives all twelve one-at-a-time centre shifts, and neither chroma-centre shift retains any of the ten. (c) The browser appendix is mostly reproducible from its recorded numbers: every static value matches to the reported precision, cloud chroma is again about double its before value, white clipping is down, and travel is up. The strict "no neon" claim does not reproduce, and Verdigris travel misses the appendix's after value by 17.2%, outside the requested 10% tolerance.

## 1. Measured interior depths

I sampled the full model domain, `Re(c) = [-2, 1]` and `Im(c) = [-1, 1]`, on a **1536×1024** grid. This exceeds 512 cells on both axes and gives square cells: both axis scales and the renderer-style mean `cellScale` are **0.001953125 c-units per cell**. Each cell was classified by `sampleAttractorCell` with the kernel defaults, **200 warmup iterations** and **48 retained samples**. I then ran `boundaryDistanceField` on that escape mask.

To report the two named regions separately, I selected non-escaped cells by the analytic main-cardioid test and the disc centred at `(-1, 0)` with radius `0.25`. The distance itself is still distance to the nearest escaped grid cell in the full sampled Mandelbrot mask, matching the field consumed by `orbit3d.ts`; it is not distance merely to the analytic component outline.

Command run:

```sh
node --experimental-strip-types --input-type=module <<'NODE'
# Imported the model constants, cellCoordinate, sampleAttractorCell and
# boundaryDistanceField; sampled 1536×1024; selected the two analytic regions;
# printed each maximum chamfer distance multiplied by cellScale.
NODE
```

Quoted output:

```text
grid: 1536x1024
warmup: 200
sampleCount: 48
reScale: 0.001953125
imScale: 0.001953125
cellScale: 0.001953125
cardioid: 263.84063720703125 cells = 0.5153137445449829 c-units
period2: 128.86509704589844 cells = 0.2516896426677704 c-units
```

The maxima occurred at sampled cell centres `(-0.2333984375, 0.0615234375)` and `(-1.0009765625, -0.0009765625)` respectively. These are grid measurements, so I report six decimal places in the verdict rather than treating the full floating-point output as physical precision.

At the shipped `cycleBands = 1.5`, one lap is `1 / 1.5 = 0.666667` c-units. It is still wider than both measured depths, so the review's conclusion that neither region contains a complete lap at the shipped setting holds. The cardioid's measured depth is 28.8% above 0.4, however, crossing the card's 25% escalation threshold. At 4 to 5 bands per unit, the measured cardioid spans 2.06 to 2.58 laps and the period-2 disc spans 1.01 to 1.26 laps. That materially changes the numerical argument behind the recommendation even though it does not reverse the recommendation by itself.

## 2. Offline ranking reproduction

I ran the committed script unchanged:

```sh
node scripts/sweep-cycle-palette.mjs
```

Relevant output:

```text
evaluated 4117
shipped amber score 0.472
best family h330_a100_c0.15_cream_g1.65_k1.4 0.987
best reference rosewood_g1.65_k1.4 0.987
```

The generated `e2e/artifacts/logistic-mandelbrot-palette/report.md` reproduced the committed write-up's top ten distinct family ramps, in the same order and with the same reported scores:

| # | ramp id | score | match |
|---:|---|---:|---|
| 1 | `h330_a100_c0.15_cream_g1.65_k1.4` | 0.987 | yes |
| 2 | `h0_a100_c0.15_cream_g1.65_k1.4` | 0.984 | yes |
| 3 | `h0_a-150_c0.15_cream_g1.65_k1.4` | 0.984 | yes |
| 4 | `h30_a-150_c0.15_cream_g1.65_k1.4` | 0.980 | yes |
| 5 | `h270_a150_c0.15_cream_g1.65_k1.4` | 0.976 | yes |
| 6 | `h210_a-150_c0.15_saturated_g1.2_k1.4` | 0.975 | yes |
| 7 | `h300_a150_c0.15_cream_g1.65_k1.4` | 0.975 | yes |
| 8 | `h330_a-150_c0.15_cream_g1.65_k1.4` | 0.975 | yes |
| 9 | `h120_a-150_c0.15_saturated_g1.2_k1.4` | 0.973 | yes |
| 10 | `h180_a150_c0.15_saturated_g1.2_k1.4` | 0.970 | yes |

The current script evaluates 4,117 textures while the write-up's Method section says 4,099. That count has drifted because the current preset list contains three more six-setting references; it does not change the reproduced family top ten.

### Twelve centre perturbations

I copied the sweep to `e2e/artifacts/cycle-palette-sweep-audit/sweep-cycle-palette-perturbed.mjs`. The copy reproduces the original top ten exactly with no perturbation. For each run below it moves one range centre by minus or plus 20% while keeping that range's width fixed. For the monotone neon interval, the same operation moves `[0, 0.15]` to `[-0.015, 0.135]` or `[0.015, 0.165]`, with preference clipped to `[0, 1]`. Each run uses:

```sh
PERTURB_TERM=<term> PERTURB_DIRECTION=<-1|1> \
  node e2e/artifacts/cycle-palette-sweep-audit/sweep-cycle-palette-perturbed.mjs \
  e2e/artifacts/cycle-palette-sweep-audit/<term>-<minus|plus>
```

| Perturbed range | Direction | Shifted centre | Committed top-ten ramps still in top ten |
|---|---:|---:|---:|
| seam | -20% | 64 | 3 |
| seam | +20% | 96 | 7 |
| bands | -20% | 7.6 | 3 |
| bands | +20% | 11.4 | 7 |
| hue span | -20% | 84° | 2 |
| hue span | +20% | 126° | 4 |
| plateau share | -20% | 0.220 | 9 |
| plateau share | +20% | 0.330 | 10 |
| mean chroma | -20% | 0.072 | 0 |
| mean chroma | +20% | 0.108 | 0 |
| neon share | -20% | 0.060 | 10 |
| neon share | +20% | 0.090 | 10 |

**Robustness verdict:** none of the committed top ten survives all twelve perturbations. In particular, every one drops out under either chroma-centre shift. By the card's definition the top table is an artefact of the chosen chroma range, and several entries are also artefacts of the seam, bands, or hue-span centre. The offline ranking is therefore unsound as a stable ordering. This audit does not promote, demote, or choose a palette.

## 3. Browser sweep reproduction

I ran the required command against the landed worktree:

```sh
PALETTE_SWEEP=1 npx playwright test palette-sweep
```

All **24 palette-sweep cases passed**, including 18 static GPU captures and six travel captures. Each palette case asserted `data-simulation-renderer="gpu-orbit3d"`; no `orbit3d-fallback-field` frame was scored. The command then ran the repository's wider configured suite and exited 1 after two unrelated failures, `Kuramoto defaults to the softened cyclic phase palette` and `non-phase Gray-Scott scores are unchanged`. Its final message was:

```text
2 failed
21 skipped
68 passed (5.9m)
```

The sweep still completed first and wrote `e2e/artifacts/logistic-mandelbrot-palette/browser-report.md`, its JSON, contact sheet, and all frames.

### Static frames, appendix after values beside this rerun

All differences below are zero at the three-decimal precision recorded by both reports.

| palette | bands | chroma appendix | chroma rerun | whiteClip appendix | whiteClip rerun | edges appendix | edges rerun | neon rerun |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| amber shipped | 1.5 | 0.020 | 0.020 | 0.043 | 0.043 | 0.176 | 0.176 | 0.000 |
| amber shipped | 3 | 0.022 | 0.022 | 0.044 | 0.044 | 0.186 | 0.186 | 0.000 |
| amber shipped | 5 | 0.021 | 0.021 | 0.044 | 0.044 | 0.193 | 0.193 | 0.000 |
| amber k1.4 | 1.5 | 0.022 | 0.022 | 0.039 | 0.039 | 0.173 | 0.173 | 0.000 |
| amber k1.4 | 3 | 0.025 | 0.025 | 0.040 | 0.040 | 0.184 | 0.184 | 0.000 |
| amber k1.4 | 5 | 0.025 | 0.025 | 0.041 | 0.041 | 0.191 | 0.191 | 0.000 |
| magma k1.8 | 1.5 | 0.035 | 0.035 | 0.067 | 0.067 | 0.261 | 0.261 | 0.003 |
| magma k1.8 | 3 | 0.037 | 0.037 | 0.065 | 0.065 | 0.285 | 0.285 | 0.003 |
| magma k1.8 | 5 | 0.037 | 0.037 | 0.071 | 0.071 | 0.300 | 0.300 | 0.002 |
| rosewood | 1.5 | 0.027 | 0.027 | 0.069 | 0.069 | 0.177 | 0.177 | 0.002 |
| rosewood | 3 | 0.027 | 0.027 | 0.062 | 0.062 | 0.186 | 0.186 | 0.002 |
| rosewood | 5 | 0.026 | 0.026 | 0.061 | 0.061 | 0.193 | 0.193 | 0.001 |
| dusk | 1.5 | 0.025 | 0.025 | 0.069 | 0.069 | 0.176 | 0.176 | 0.001 |
| dusk | 3 | 0.026 | 0.026 | 0.062 | 0.062 | 0.185 | 0.185 | 0.001 |
| dusk | 5 | 0.025 | 0.025 | 0.061 | 0.061 | 0.191 | 0.191 | 0.000 |
| verdigris | 1.5 | 0.029 | 0.029 | 0.031 | 0.031 | 0.170 | 0.170 | 0.002 |
| verdigris | 3 | 0.032 | 0.032 | 0.032 | 0.032 | 0.182 | 0.182 | 0.004 |
| verdigris | 5 | 0.032 | 0.032 | 0.031 | 0.031 | 0.190 | 0.190 | 0.002 |

For the appendix's cloud-only claim, I decoded my `frames/magma-k1-8-b5.png` and measured the 400×400 crop at `(x=440, y=100)`, which covers the cloud and excludes the ground. The command reused `decodePng` and `frameColourMetrics` from `e2e/harness/frame.ts`. It returned:

```text
lit=0.316 chroma=0.041151 whiteClip=0.135115 neon=0.004030
```

The rerun's cloud chroma is 0.4% above the appendix's 0.041 and 2.06 times its cited before value of 0.020. The "roughly doubled on the cloud" claim reproduces within 10%.

The rerun's whole-frame white-clip values exactly reproduce the appendix's after values at reported precision and are lower than every corresponding before value in the appendix. The "white clip down" claim reproduces.

### Colour travel

The appendix only records after values for amber shipped, magma, and Verdigris. A dash means the appendix gave no after number; the before values come from the write-up's original browser table.

| palette | before | appendix after | rerun | rerun vs appendix | rerun vs before |
|---|---:|---:|---:|---:|---:|
| amber shipped | 8.51 | 9.46 | 8.97 | -5.2% | +5.4% |
| amber k1.4 | 8.66 | not reported | 9.85 | not reported | +13.7% |
| magma k1.8 | 11.35 | 13.63 | 12.78 | -6.2% | +12.6% |
| rosewood | 8.26 | not reported | 9.18 | not reported | +11.1% |
| dusk | 7.83 | not reported | 8.48 | not reported | +8.3% |
| verdigris | 8.26 | 10.17 | 11.92 | +17.2% | +44.3% |

Travel is higher than the before value for all six palettes, so the directional claim reproduces. Amber and magma reproduce their appendix after values within 10%; Verdigris does not.

The metric's strict "no neon" conclusion does not reproduce. Eleven of 18 static frames have non-zero neon share, with a maximum of 0.004 for Verdigris at 3 bands per unit. This is a small share and neither inspected frame looks acid-bright, but zero and non-zero are distinct recorded outcomes.

### Independent visual reading of the required frames

I inspected this run's `frames/magma-k1-8-b5.png` and `frames/rosewood-b5.png` before writing these answers.

- **Do the sheets still read as stacked light?** Yes. Both frames show multiple luminous, translucent layers whose overlaps brighten, rather than flat opaque surfaces.
- **Does the chaotic band still glow brighter than the periodic sheets?** Yes. In both frames the central chaotic sweep is the brightest near-white feature; the periodic rings and outer sheets remain visibly dimmer.
- **Is the palette hue visible on the cardioid sheet?** Yes. Magma shows a distinct lilac-magenta band around the cardioid sheet, while Rosewood shows rose-pink edges and a warm cream centre. Both are visible despite bright overlap regions.

## 4. Concrete counter-case

`magma_g1.2_k1.8` is the reverse counter-case. Offline it scores only **0.549**, seventh in the write-up's shipped-preset table, even though its texture terms are individually plausible: seam 93.7, 11.0 bands, mean chroma 0.101, and zero neon; it is penalised chiefly for a 165° hue span and 0.43 plateau share just beyond the chosen ranges. In the browser at 5 bands per unit it has the highest recorded edge density, **0.300**, tied-highest whole-frame chroma, **0.037**, and the highest rerun travel, **12.78**. By eye its hue remains visible on the cardioid sheet and its chaotic band is clearly brighter than the periodic sheets.

The offline metric cannot see this reversal. It scores a one-dimensional 256-texel ramp before the renderer uses boundary depth, sheet height, additive overlap, periodic-sheet softening, and the Cycle-only hue-preserving shader branches. Those operations determine whether a ramp survives on the cloud. The offline score can filter texture properties, but it cannot support a cloud-quality ordering.

## 5. Acceptance commands

`npm run verify` exited **0**. Its final build message was:

```text
✓ built in 814ms
```

The kernel suite reported `tests 374`, `pass 374`, `fail 0`; typechecking and the production build also completed successfully. This is a real pass.

`scripts/check-contract-test-gate.sh --worktree` exited **2** and printed, verbatim:

```text
contract-gate: no relevant changed files to inspect in the working tree
```

This is the card's expected **nothing to inspect** outcome: the sole tracked claim is this audit document, and the stage has no contract test or frozen assertion block.
