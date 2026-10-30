# Shared fractal helper coverage — 2026-10-30

`src/sims/fractal/detail.ts` is shared implementation, not a simulation. It
exports zoom/iteration caps, the adaptive iteration-limit calculation and the
analytic main-cardioid/period-two-bulb interior shortcut. There is no independent
fractal sweep, ranking or preset.

| Consumer | Research report | Coverage status at stage 137 |
|---|---|---|
| Mandelbrot | [Boundary sweep](mandelbrot-interestingness.md) | Worker measurement completed: 48 coarse + 24 refined views, four current references, three evidence finalists; independent stage verification pending. No promotion proposed. |
| Burning Ship | [Boundary sweep](burning-ship-interestingness.md) | Pending card 138; report link is a reserved destination, not completed evidence. |
| Julia Set | [Connectivity sweep](julia-set-interestingness.md) | Pending card 139; report link is a reserved destination, not completed evidence. |
| Markus–Lyapunov | [Sign-mix sweep](markus-lyapunov-interestingness.md) | Pending card 140; report link is a reserved destination, not completed evidence. Its Lyapunov field is not an escape-membership mask. |

Consumer imports were checked directly in the four kernel modules. No consumer
was counted twice or invented from the helper directory. Card 149 reconciles
the final destinations and completed/pending/failed status after the serial run.

## Iteration-limit method

The helper bounds the rounded base limit to 16–2048. With automatic detail off,
that base is the actual limit. With it on:

```text
boost = floor(48 * log2(max(1, zoom)))
effective = min(4096, boundedBase + boost)
```

Therefore doubling the base does not double the effective limit. Stage 137
computes the actual boost and requests `base2 = 2 * effective - boost` only
when both the base and effective caps permit it. Every measured comparison
records both parameter objects and both actual effective limits. If a requested
doubling is blocked, measure the attainable limit against a lower reference,
mark the result cap-limited and retain uncertainty. Do not label it a doubling.

The [Mandelbrot result JSON](data/2026-10-30/137/mandelbrot.json) includes seven
256² comparisons with exact effective doubling and a separate cap probe:
base 2048 at zoom 417.6 yields **2465**, compared against **1232** at base 815.
The unattainable requested doubling would require effective 4930/base 4513.
The probe changes 1.6556% of zero/nonzero pixels and remains explicitly
cap-limited. Neither the nominal 4096 ceiling nor an unchanged palette proves
convergence.

For escape fields, zero means analytically recognised interior or failure to
escape before the cutoff. It is not a mathematical membership guarantee. The
opt-in `static-boundary-v1` instrument in `e2e/harness/metrics.ts` reads that
zero/nonzero distinction at 128², validates selected views at 256² and has no
temporal bonus. Consumers must document their own field semantics and calibration
before reusing it. No numerical connectivity or aesthetic classification is
implied by these measurements.
