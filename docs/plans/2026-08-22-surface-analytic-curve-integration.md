# Surface analytic-curve integration findings

## Result

Hybrid tessellation uses traced hyperbolic-component boundaries wherever
continuation succeeds. Periods 1 and 2 use the closed cardioid and circle
forms. Higher periods start from the stage-54 catalogue seed and multiplier
angle. A deterministic 128-step continuation ceiling keeps each live trace
bounded. Failures retain the stage-55 sampled contour and are reported.

The fatal attempt-2 failure is reproduced by a pure 768 by 768 fixture before
the fix. It throws the verifier's exact error,
`Orbit surface sample was not prepared at 414,610.5`, through
`buildOrbitSurface`, `vertexAtTransition`, and
`locateOrbitSurfaceTransition`. The surface builder previously ran six
categorical midpoint lookups before checking whether a traced curve already
provided the exact crossing. It now resolves the analytic crossing first and
runs categorical bisection only for sampled fallback edges. The same fixture
passes and emits triangles after the change.

## Integration design

The surface builder's return contract is unchanged. Its options accept closed
boundary polylines. Triangle-edge crossings come from those polylines, and
curve-intersecting cells enter refinement even when all four coarse corners
share a label. Analytic refinement stops at depth 4. Its allowance is 5,592
leaves, leaving the live build's 622 sampled-fallback leaves unchanged and
holding the stage-55 total ceiling of 6,214.

Adaptive leaves carry their owning coarse quad, so integer sub-cell boundaries
remain attached to the correct tessellation cell. The harness now mirrors the
live two-part preparation protocol: the planning sampler prepares adaptive
points, then an edge scan prepares the categorical bisection points needed by
fallback contours. Tessellation uses a strict lookup-only sampler. The full
768 by 768 default-window build therefore exercises the same prepared-sample
invariant as the live path rather than a small proxy.

Analytic work stays inside the sliced phase loop. Catalogue tracing runs one
bounded component at a time, grid relabelling runs cell by cell, and
curve-distance grading runs cell by cell. The browser alone can measure timer
quantisation and finalisation because the worker sandbox cannot launch it.

## Curve-distance grading

The traced path supplies membership and distance in grid-cell units. Inside a
covered component, sheet dissolve comes from true distance to that component
curve. Outside it, cloud-band selection and weight use true curve distance
within the 12-cell band. The sampled distance field remains unchanged for
untraced components and points outside analytic influence. An exact curve
crossing has dissolve zero.

Curve lookup rejects components by bounding box before polyline distance is
evaluated, avoiding a full point comparison against every curve.

## Deterministic harness result

Two complete `node scripts/analyze-sheet-edges.cjs` runs were byte-identical.
SHA-256: `4f6c8d1ebd491d01bcd7bd06bee971575a9190d9040c18f3d42a15e4f2a0ce13`.

| Window | Curve-trimmed components | Fallback components | Boundary vertex error | Silhouette chord error | Prepared invariant |
|---|---|---|---:|---:|---|
| full-default | p1@49, p2@100, p3@30, p3@115, p7@51, p7@203 | p3@220 did not close; p4@118 singular corrector | 0.000004 px | 0.247848 px | pass |
| period-2-bulb | p1@104, p2@70, p6@47, p6@362, p8@52, p8@388 | p4@189 singular corrector | 0.000008 px | 0.220530 px | pass |
| period-8-cascade | none | p4@19 singular corrector; p8@91 did not close | not applicable | not applicable | pass |

The cascade fixture honestly remains sampled because neither catalogue
component closes under the existing tracer. Extending continuation robustness
is outside this stage.

## Live component split

The pure default-window build traces 49 components and falls back on 9.

- Trimmed: p1@108761; p2@222969; p3@291900, p3@487389;
  p4@126532, p4@439111; p5@4340, p5@105051, p5@117885, p5@182206,
  p5@294239, p5@294947, p5@387679, p5@406462, p5@450427, p5@484443,
  p5@585716; p6@35042, p6@184945, p6@216795, p6@227938, p6@294277,
  p6@294920, p6@355426, p6@405361; p7@3551, p7@46522, p7@97912,
  p7@110366, p7@163934, p7@227950, p7@335456, p7@362350, p7@415070,
  p7@470558, p7@491896, p7@543418, p7@586463; p8@108706, p8@111720,
  p8@126545, p8@205264, p8@212990, p8@264027, p8@323931, p8@384208,
  p8@459089, p8@472739, p8@478056.
- Fallback: p3@48859 did not close; p4@278189 hit complex division by zero;
  p5@189535 did not close; p6@293434 did not converge at angle 0;
  p6@358107 and p6@542689 did not close; p7@250207 did not close;
  p8@291229 did not converge at angle 0; p8@368895 did not close.

## Held figures

| Window | Coverage | Stage-54 band points | Sampled chord | Alternation |
|---|---:|---:|---:|---:|
| full-default | 0.954545 | 144 | 0.482036 px | 0.040000 |
| period-2-bulb | 0.959839 | 888 | 0.500000 px | 0.000000 |
| period-8-cascade | 0.854772 | 4,712 | 0.480163 px | 0.000000 |

Period-transition seam darkness remains 0.00, with all 33 fixture transition
vertices at full intensity. The deterministic 3 by 3 fallback and live
cloud-parity constants remain unchanged.

## Measured pure-build cost

| Window | Refined leaves | Analytic/fallback | Triangles | Mesh bytes |
|---|---:|---:|---:|---:|
| full-default | 413 | 402/11 | 2,233 | 144,348 |
| period-2-bulb | 799 | 797/2 | 5,585 | 279,564 |
| period-8-cascade | 155 | 0/155 | 4,204 | 194,256 |
| live-default-768 | 6,214 | 5,592/622 | 431,129 | 16,194,780 |

The live point buffers remain 371,114,240 bytes at 13,254,080 points. Adding
the measured mesh gives a pure-computable peak geometry figure of 387,309,020
bytes. The triangle count is below the 1,199,999 cap. The refinement total is
equal to, not above, the stage-55 figure, while every sampled fallback leaf is
retained.

| Figure | Stage 55 | Stage 56 pure after |
|---|---:|---:|
| Median slice | 8.000 ms | verifier to measure |
| Maximum slice | 37.400 ms | verifier to measure |
| Finalisation | 2,004.500 ms | verifier to measure |
| Peak geometry | 388,734,260 B | 387,309,020 B |
| Triangles | 445,023 | 431,129 |
| Refined leaves | 6,214 | 6,214 |

The verifier should measure the three browser timing rows, confirm cloud-mode
pixel identity, inspect the cardioid and period-2 circle at review zoom, and
rotate the view to check for sparkle or shimmer.
