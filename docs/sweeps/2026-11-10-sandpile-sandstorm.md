# Sandpile "Sandstorm" preset (2026-11-10)

Card: `docs/stages/159-sandpile-sandstorm-preset.md`.

## Provenance

The operator tuned the Abelian sandpile by hand to every slider's maximum and saved it as "Test1" (`el:saved-presets:v1`). `docs/UAT/uat.md` note 2 records the verdict: "sandpile seems to be better with higher topple, see the preset test1". The orchestrator chose the label "Sandstorm" after a live look; the operator may rename it.

## Values

| Parameter | Value |
|---|---|
| initialPile | 15650000 |
| toppleThreshold | 12 |
| grainsPerStep | 1000 |
| topplesPerStep | 2000000 |

Shipped as the fourth sandpile preset, after Classic critical, Fast avalanches and High threshold. Classic critical stays the kernel default; the thumbnail is unchanged.

## Measured cost

Worker's machine, headless Chromium with `--use-angle=metal --enable-gpu`, 1440x900 viewport. The sandpile steps on the CPU. The display frame cap is about 60 Hz (a bare requestAnimationFrame loop measured 54 Hz in the same headless session).

| Grid | Iteration | Reported fps |
|---|---|---|
| ultra | 300 (read at 337) | 13 |
| ultra | 600 (read at 636) | 12-13 |
| high | 300 (read at 336) | 13 |
| high | 600 (read at 637) | 13 |

Iterations overshoot the targets slightly because the counter was polled every 100 ms. The cost is the CPU topple budget, not the grid size, so ultra and high read the same.

Screenshots (git-ignored) under `e2e/artifacts/sandpile-sandstorm-2026-11-10/`:

- `sandstorm-ultra-300.png`
- `sandstorm-ultra-600.png`

The pile is larger at 600 than at 300 (disc about 565 px across against about 495 px) and keeps its triangular and diamond motifs along the rim.

## Comparison

High threshold at the ultra grid ran at 64 fps at iteration 540, against 13 fps for Sandstorm: about five times slower, in exchange for a much larger, finer-grained pile. The operator accepted the cost for this preset.

## Open decision

The 2026-11-08 "Dense mandala" candidate (60000 / 5 / 32, `docs/sweeps/2026-11-08-operator-rerun.md`) remains an open operator decision. This card does not supersede it.
