# 2D Ising: the Coarse domains trial (stage 157), 2026-11-10

Card 146's Ising second pass ranked `146-ising-c04` third of 48 (score 0.565, temporal flux 0.060), and the 2026-11-08 judge called it the only plausible lead: an ordered-phase regime whose domains keep moving. Card 146 failed verification, so none of its evidence stands. This report re-measures the candidate from scratch, renders it at the app's desktop grid beside Critical domains, and ships it as a read-only research-bench trial so it can be seen in the app. No shipped preset, kernel, default or quality profile changed.

**Candidate.** `146-ising-c04`, named "Coarse domains": temperature 2.38, coupling 1.4, external field 0, 0.5 updates per frame, random start (seed 7 in the sweep). At field 0 the dynamics depend only on T/J, so this is T/J = 1.7, below the critical ratio 2.269: the ordered phase, quenched from a random start.

**In the app.** Presets library, "From the research bench", badge `Trial · stage 157`, or the deep link:

```
#/ising-model?preset=trial-157-ising-model-temperature2.38_coupling1.4
```

The trial id is `trial-157-ising-model-temperature2.38_coupling1.4` and its source configuration reads `157:ising-model:temperature2.38_coupling1.4:146-ising-c04`. The nine stage-144 trials keep their ids, names, rows, params and source ids.

## Method

Card 146's `growth-criticality-v1` method, unchanged, using its `sweep-146-ising-model` configuration:

- 128×128 grid, flux gap 4, dt 1, channel 0, coverage threshold 0.5.
- Captures at 100, 300 and 900 steps on a fresh seeded kernel per measurement. Each capture is scored with the unchanged `scoreFrames`; the row's metrics are the `summarizeMetrics` mean over the three captures. Diagnostics (magnetisation, domain-wall density, non-finite and endpoint fractions) sit beside the metrics and never feed the score.
- Rows: the candidate and the four `146-current-*` references (the shipped presets with seed 7 pinned). The candidate is ranked among those five only; the other 47 card-146 candidates were not re-run.
- Validation for every row: finite size at 64² and 256², a long-horizon capture at 3000 steps, and seeds 7, 11 and 23.
- App renderer: the real WebGL2 `Renderer` through `rdRender`, now given an optional view, on a 1440×856 CSS canvas (the app's canvas at a 1440×900 desktop viewport) at Ising's desktop default preset (ultra). That gives a 1440×856 grid, the grid the app runs at that window. The candidate and Critical domains are each rendered at 300, 1500 and 3000 iterations from seed 7. Each frame's spin field is read back for domain statistics.

Reproduce with:

```bash
SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 157 " --workers=1
```

It needs a Vite server for this tree on `localhost:5173` (the Playwright config starts one if none is listening) and took 236 s on Chromium 148.0.7778.96, Node v26.5.0, darwin. The first run writes `docs/sweeps/data/2026-11-10/157/ising-model.json`. A later run finds that file, writes `ising-model.replay.json` beside it, and fails if any ranked metric, reference metric, validation reading or app-frame statistic moved by more than 1e-9.

## Ranked row and references

| # | Row | T | J | Field | Updates | Score | Entropy | Variance | Autocorr | Coverage | Flux | Wall density |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | **Coarse domains** (`146-ising-c04`) | 2.38 | 1.4 | 0 | 0.5 | **0.565397** | 0.197384 | 0.245491 | 0.869826 | 0.561239 | 0.059591 | 0.0640 |
| 2 | Cold quench (`146-current-cold-quench`) | 0.7 | 1 | 0 | 0.8 | 0.553586 | 0.169972 | 0.201900 | 0.955376 | 0.321350 | 0.013774 | 0.0195 |
| 3 | Critical domains (`146-current-critical`) | 2.269 | 1 | 0 | 0.5 | 0.459723 | 0.198511 | 0.247431 | 0.673443 | 0.469401 | 0.170614 | 0.1615 |
| 4 | Positive field (`146-current-field-sweep`) | 1.8 | 1 | 0.02 | 0.5 | 0.422122 | 0.142413 | 0.162163 | 0.777687 | 0.768311 | 0.059672 | 0.0655 |
| 5 | Hot noise (`146-current-hot-noise`) | 4.5 | 1 | 0 | 1 | 0.225766 | 0.199976 | 0.249958 | 0.246868 | 0.499023 | 0.479268 | 0.3766 |

The candidate reproduces card 146's reading (0.565, flux 0.060) and ranks first of the five, 0.012 above Cold quench and 0.106 above Critical domains. Full-precision values are in the retained JSON.

## Seed spread

| Row | Seed 7 | Seed 11 | Seed 23 | SD | Flux (7/11/23) |
|---|---:|---:|---:|---:|---|
| Coarse domains | 0.5654 | 0.5697 | 0.5574 | 0.0051 | 0.0596 / 0.0581 / 0.0608 |
| Cold quench | 0.5536 | 0.5725 | 0.5578 | 0.0081 | 0.0138 / 0.0183 / 0.0147 |
| Critical domains | 0.4597 | 0.4622 | 0.4555 | 0.0027 | 0.1706 / 0.1695 / 0.1723 |
| Positive field | 0.4221 | 0.4678 | 0.4204 | 0.0219 | 0.0597 / 0.0657 / 0.0632 |
| Hot noise | 0.2258 | 0.2173 | 0.2249 | 0.0038 | 0.4793 / 0.4836 / 0.4867 |

The candidate's lead over Critical domains is about twenty seed standard deviations, so it is not a lucky seed. Its lead over Cold quench is not robust: seed 11 puts Cold quench ahead, and so does the 64² grid, by 0.0002.

## Finite size and long horizon

| Row | 64² mean score | 128² | 256² mean score | t3000 score | t3000 flux |
|---|---:|---:|---:|---:|---:|
| Coarse domains | 0.5651 | 0.5654 | 0.5664 | 0.5817 | 0.0426 |
| Cold quench | 0.5653 | 0.5536 | 0.5629 | 0.0000 | 0.0001 |
| Critical domains | 0.4467 | 0.4597 | 0.4588 | 0.4628 | 0.1683 |
| Positive field | 0.2057 | 0.4221 | 0.4017 | 0.0165 | 0.0366 |
| Hot noise | 0.2223 | 0.2258 | 0.2257 | 0.2232 | 0.4915 |

The candidate's score holds within 0.002 from 64² to 256², and its flux at 64² and 256² (0.058, 0.060) matches 128². At 3000 steps it is still moving (flux 0.043) and scores 0.582. Cold quench has frozen to a single state by then (score 0, flux 0.0001), and Positive field has saturated. Among the shipped-preset references, only Critical domains and Hot noise also keep moving at 3000 steps, and both are much finer.

## App-grid renders

Both rows on the 1440×856 grid, ultra, WebGL2, seed 7. Wall density is the share of unlike nearest-neighbour pairs. Mean run length (its reciprocal) is the average distance between domain walls in cells. "Changed" is the share of cells that differ from the previous frame.

| Row | Iterations | Wall density | Mean run length | Autocorr | Changed |
|---|---:|---:|---:|---:|---:|
| Coarse domains | 300 | 0.0541 | 18.49 | 0.8916 | n/a |
| Coarse domains | 1500 | 0.0364 | 27.44 | 0.9268 | 0.2450 |
| Coarse domains | 3000 | 0.0320 | 31.27 | 0.9356 | 0.1372 |
| Critical domains | 300 | 0.1225 | 8.16 | 0.7549 | n/a |
| Critical domains | 1500 | 0.1034 | 9.67 | 0.7928 | 0.3146 |
| Critical domains | 3000 | 0.0983 | 10.18 | 0.8025 | 0.2213 |

At equal iterations the candidate's domains are 2.3× (300), 2.8× (1500) and 3.1× (3000) wider than Critical domains, and they keep coarsening. Between 1500 and 3000 iterations, 13.7% of its cells change: the field drifts and has not stopped. My own look at the frames agrees. At 1500 and 3000 the candidate shows large smooth yellow and blue blobs with clean boundaries and light thermal speckle inside. Critical domains at 1500 is a ragged, speckled camouflage several times finer. Neither looks like Cold quench's frozen blocks.

In the live app the trial opens at the shipped "ultra" preset. The live grid follows the window, and the app injects a fresh seed, so a live run will not match these frames pixel for pixel. The domain scale and the drift should match.

## Images

All in `docs/images/sweeps-2026-11-10/` (git-ignored, local to the machine that ran the sweep, like every sweep's images):

- App renderer, candidate: `157-app-146-ising-c04-t300.png`, `157-app-146-ising-c04-t1500.png`, `157-app-146-ising-c04-t3000.png`
- App renderer, Critical domains: `157-app-146-current-critical-t300.png`, `157-app-146-current-critical-t1500.png`, `157-app-146-current-critical-t3000.png`
- Kernel fields, candidate: `157-146-ising-c04-field-128-seed7-strip-t100.png`, `157-146-ising-c04-field-128-seed7-strip-t300.png`, `157-146-ising-c04-field-128-seed7-strip-t900.png`, `157-146-ising-c04-field-64-seed7-size-t300.png`, `157-146-ising-c04-field-256-seed7-size-t300.png`, `157-146-ising-c04-field-128-seed7-long-t3000.png`, `157-146-ising-c04-field-128-seed7-seed-t300.png`, `157-146-ising-c04-field-128-seed11-seed-t300.png`, `157-146-ising-c04-field-128-seed23-seed-t300.png`
- Kernel fields, references: the same nine names with `146-current-critical`, `146-current-cold-quench`, `146-current-hot-noise` or `146-current-field-sweep` in place of `146-ising-c04`.

Data: `docs/sweeps/data/2026-11-10/157/ising-model.json` (git-ignored). Summary table: `e2e/artifacts/sweep-157-ising-model/report.md`.

## Decision for the operator

Three options:

1. **Promote** to a fifth shipped Ising preset. It is the only Ising regime measured that is both coarse and still moving at 3000 steps. It leads the shipped set at every seed, size and horizon except two readings against Cold quench (seed 11, and the 64² grid by 0.0002), and Cold quench is frozen by 3000 steps. It does not duplicate an existing preset: Cold quench freezes and Critical domains is three times finer. Promotion would be a new card (preset entry, ordering, its own oracle); this card does not do it.
2. **Keep as a trial**, the default if you do nothing. It stays in the research bench and behind the deep link, and you can save a personal copy.
3. **Drop** it if the look does not earn a place. A later card would remove the row; the nine stage-144 trials do not depend on it.

My recommendation is to look at the trial live first. Option 1 is justified if the drifting blobs read as distinct from Critical domains on your screen. The name "Coarse domains" is a placeholder chosen from its appearance; rename it at the look if you like.
