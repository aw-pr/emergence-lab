# Shared fractal helper coverage — 2026-10-30

`src/sims/fractal/detail.ts` is shared implementation, not a simulation. It
exports zoom/iteration caps, the adaptive iteration-limit calculation and the
analytic main-cardioid/period-two-bulb interior shortcut. There is no independent
fractal sweep, ranking or preset.

| Consumer | Research report | Final research status reconciled by stage 149 (2026-11-01) |
|---|---|---|
| Mandelbrot | [Boundary sweep](mandelbrot-interestingness.md) | 137 verifier PASS, merged `ce6e2a16d`: 48 coarse +24 refined, 4 current references. Fine boundary remains iteration-sensitive; no promotion. |
| Burning Ship | [Boundary sweep](burning-ship-interestingness.md) | 138 retry verifier PASS, merged `abfec1e65`: 48 coarse +24 refined, 4 current references. Report bounds/links repaired; archived scientific evidence reused under re-brief, no new search claimed. No promotion. |
| Julia Set | [Connectivity sweep](julia-set-interestingness.md) | 139 verifier PASS, merged `b4d05e01d`: 64 constants +24 refined views, 3 current references. Cropping/iteration sensitivity and fragmented negative retained; no promotion. |
| Markus–Lyapunov | [Sign-mix sweep](markus-lyapunov-interestingness.md) | 140 verifier PASS, merged `c57dec8a8`: 48 coarse +24 refined, 2 current references. Shelved route; actual Renderer evidence rather than full app page. Its Lyapunov field is not an escape-membership mask. No promotion. |

Consumer imports were checked directly in the four kernel modules. No consumer
was counted twice or invented from the helper directory. All four merged commits
are ancestors of stage 149's dispatch base `c8a256767`. The
[batch close-out](2026-10-30-interestingness-results.md) links worker/verifier
records, exact manifests, retained images and the separate failed-stage outcomes.
Research PASS accepts evidence on dev; operator visual sign-off remains separate
from any production preset promotion. Stage 149 itself awaits verification.

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
