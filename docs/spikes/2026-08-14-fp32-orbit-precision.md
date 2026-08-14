# fp32 orbit precision spike

## Decision

**Go with mitigation, not as a direct all-fp32 replacement.** Run stable bulb
interiors in fp32, but retain fp64 CPU sampling for the chaotic band and bulb
boundary band. The stable-interior sample had no period mismatches and a worst
sample-value error of `1.133e-6`; the full production sample had a `1.3265%`
period mismatch globally and `1.7687%` on boundary-classified cells. A
split-double shader is the alternative if the whole c-plane must run on GPU.
Retuning the convergence constant alone is not sufficient because most of the
full-field disagreement comes from orbit and escape divergence at boundaries,
not from the early-exit decision.

> [!IMPORTANT]
> These are **not GPU measurements**. `Math.fround` after every arithmetic
> result models one non-fused fp32 execution in Node and provides only a lower
> bound on possible GPU error, not an estimate of it. Real GLSL `highp` can
> contract a multiply and add into an FMA with one rounding, which can reduce
> error; it can flush denormals to zero, which can increase error; and `highp`
> is a minimum precision guarantee rather than an exact cross-driver format.

## Method

The deterministic script is `scripts/spike-fp32-orbit.mjs`. From the repository
root, reproduce the figures with:

```sh
npm run build:test
node scripts/spike-fp32-orbit.mjs
```

The script imports the compiled sampler through `.test-build/`, as the baker
does, and first checks its instrumented fp64 implementation against
`sampleAttractorCell`. It iterates the complex quadratic map
`z -> z^2 + c`; it does not implement the real logistic recurrence. The fp32
path rounds the input coordinates and every multiply, add, subtract, square,
square-root result, period delta, and multiplier update separately with
`Math.fround`.

The PRNG seed is `0x34f032` (`3469362`). The 12,288 cells are:

| Stratum | Cells | Construction |
| --- | ---: | --- |
| Main-cardioid interior | 1,024 | Seeded samples in multiplier space with `abs(mu) <= 0.82`, mapped by `c = mu/2 - mu^2/4` |
| Period-2 interior | 1,024 | Seeded samples within 82% of the exact radius-0.25 bulb |
| Period-4 interior | 1,024 | Seeded samples within 72% of a numerically traced radial boundary around the superattracting centre |
| Real chaotic band | 1,536 | Low-discrepancy points on `cIm = 0`, `-1.99 <= cRe <= -1.405`, retained when the deep fp64 probe is bounded and has no period up to 32 |
| Main-cardioid boundary band | 4,096 | 1,024 angles at four inward/outward offsets: 0.2% and 1% |
| Period-2 boundary band | 2,048 | 512 angles at the same four offsets around the exact circular boundary |
| Period-4 boundary band | 1,536 | 384 radial boundary traces at the same four offsets |

The real chaotic interval lies on the Mandelbrot boundary in the complex
plane. It is therefore included in both the chaotic stratum and the
boundary-only denominator: 9,216 boundary-classified cells in total.

Both production (`1500` warmup, `8` samples) and baker (`20000`, `64`) settings
were measured. Period mismatch uses all 12,288 cells and treats an escape/non-
escape disagreement as a mismatch. Boundary mismatch uses all 9,216
boundary-classified cells. Value divergence compares corresponding stored `zr`
samples only where both precisions remain non-escaping. These are raw,
index-aligned differences; a cycle reached at a different phase can have a
large value difference while retaining the same period and point set.

## fp32 against the fp64 CPU sampler

| Setting | Comparable non-escaped cells | Max abs `zr` | p99 abs `zr` | Period mismatch, all | Period mismatch, boundary | Escape mismatch |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Production, 1500 / 8 | 10,034 | 3.899438 | 2.631105 | 163 / 12,288 = **1.3265%** | 163 / 9,216 = **1.7687%** | 158 / 12,288 = 1.2858% |
| Baker, 20000 / 64 | 9,910 | 3.937639 | 2.627417 | 22 / 12,288 = **0.1790%** | 22 / 9,216 = **0.2387%** | 9 / 12,288 = 0.0732% |

The large raw value errors are dominated by chaotic phase divergence. They
make a full-field, index-by-index value tolerance unhelpful: passing 99% of the
observations would require about `2.7`, over half the full `[-2, 2]` sample
range. The deeper warmup improves period and escape agreement, but does not
make chaotic sample indices align.

The regional split shows why a hybrid is viable:

| Region | Production period mismatch | Baker period mismatch | Production p99 / max abs `zr` | Baker p99 / max abs `zr` |
| --- | ---: | ---: | ---: | ---: |
| Main-cardioid interior | 0 / 1,024 | 0 / 1,024 | `5.960e-8` / `1.192e-7` | `5.960e-8` / `1.192e-7` |
| Period-2 interior | 0 / 1,024 | 0 / 1,024 | `2.310e-7` / `4.321e-7` | `2.310e-7` / `4.321e-7` |
| Period-4 interior | 0 / 1,024 | 0 / 1,024 | `5.327e-7` / `1.133e-6` | `5.327e-7` / `1.133e-6` |
| Chaotic band | 1 / 1,536 | 13 / 1,536 | `3.382802` / `3.899438` | `3.377893` / `3.937639` |
| Cardioid boundary | 63 / 4,096 | 0 / 4,096 | `0.560400` / `1.072586` | `0.593714` / `1.079584` |
| Period-2 boundary | 71 / 2,048 | 2 / 2,048 | `0.260714` / `1.341864` | `0.259657` / `0.449448` |
| Period-4 boundary | 28 / 1,536 | 7 / 1,536 | `0.040353` / `0.179487` | `0.060819` / `0.286066` |

`PERIOD_TOLERANCE = 1e-4` itself is representable comfortably enough in fp32:
near magnitude one it spans roughly 839 fp32 spacings. The zero period
mismatches in all 3,072 stable-interior cells at both settings confirm that the
period comparison is not intrinsically too fine. Boundary orbits diverging
before the comparison, rather than representation of `1e-4`, cause the
observed mismatches.

## The convergence-tolerance trap

The `1e-18` squared convergence threshold is fp64-shaped. Near magnitude one,
distinct fp32 values are too widely spaced to satisfy it, so it is effectively
an exact-equality test. The measurement confirms that almost all fp32
convergence exits were exact: 3,838 of 3,876 at production and 7,980 of 8,092
for the baker. The remaining 38 and 112 exits had a positive sub-threshold
distance near zero, where fp32 spacing is much finer than it is near one.

### Cost

| Setting | fp64 convergence exits | fp32 convergence exits | fp64 exits lost to full fp32 warmup | Full warmup among comparable non-escaped, fp64 / fp32 | Mean warmup iterations, fp64 / fp32 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production | 3,668 = 29.8503% | 3,876 = 31.5430% | 3 = 0.0244% of all cells; 0.0818% of fp64 convergence exits | 63.4443% / 61.3713% | 1029.86 / 1003.96 |
| Baker | 7,998 = 65.0879% | 8,092 = 65.8529% | 73 = 0.5941% of all cells; 0.9127% of fp64 convergence exits | 19.2936% / 18.3451% | 7056.78 / 5868.13 |

The feared loss exists, but it does not dominate this corpus. fp32's finite
state space also snaps more attracting orbits onto exact cycles, creating more
new exact-equality exits than it loses. Mean fp32 warmup work was 2.5% lower at
production and 16.8% lower for the baker. This is not a GPU speedup estimate:
fragment lanes execute together, so a lane-level early exit saves little until
the whole executing group exits, and real driver arithmetic can alter which
lanes converge.

### Correctness of early exit versus forced full warmup

For both precisions and both settings, forcing the full warmup caused **zero
period mismatches and zero escape mismatches** across all 12,288 cells.

| Setting and precision | Cells with any changed sample | Max / p99 abs `zr` | Max / p99 interior difference |
| --- | ---: | ---: | ---: |
| Production fp64 | 5.4367% | `3.552538` / `0.424337` | `9.414e-8` / `3.486e-10` |
| Production fp32 | 9.9724% | `3.558501` / `0.529802` | `1.842e-5` / `3.934e-6` |
| Baker fp64 | 36.2105% | `3.157271` / `0.466306` | `1.575e-6` / `1.080e-7` |
| Baker fp32 | 45.3995% | `3.876438` / `0.623557` | `8.082e-4` / `1.318e-4` |

The changed values are principally cycle-phase changes: early exit starts the
sample window at a different iteration, while the detected period remains the
same. They matter to strict array parity and can slightly redistribute density
when the sample count is not a multiple of the period, but they did not change
the colour-driving period or escape classification in this measurement.

## Acceptance tolerances for stages 35 and 36

For the recommended hybrid path, apply the GPU parity gate only to cells the
CPU boundary classifier marks as stable interior:

- **Absolute sampled-value tolerance: `2e-6` per `zr`.** This is 1.77 times the
  measured stable-interior maximum (`1.133e-6`) and 3.75 times the measured
  stable-interior p99 (`5.327e-7`) at both settings. It leaves limited room for
  FMA/driver variation without accepting boundary-scale divergence.
- **Maximum period-mismatch fraction: `0.05%` of GPU-eligible cells.** The
  observed rate was 0 of 3,072 at both settings. Allowing roughly one cell in
  2,000 acknowledges that `Math.fround` is only a lower-bound model, while
  still rejecting the measured full-field production rate by a wide margin.

Both gates must pass at production and baker settings, and the boundary band
must remain on the fp64 CPU path. If stage 35 instead sends the whole field to
plain fp32, these tolerances should fail it. Raising the full-field value gate
to about `2.7` or the period gate toward the observed `1.77%` boundary rate
would merely encode visible disagreement as success. Use split-double
arithmetic before relaxing those gates.
