# Surface analytic-curve integration findings

## Result

Hybrid tessellation uses traced hyperbolic-component boundaries wherever
continuation succeeds. Periods 1 and 2 use the closed cardioid and circle
forms. Higher periods start from the stage-54 catalogue seed and multiplier
angle. A deterministic 128-step continuation ceiling keeps each live trace
bounded. Failures retain the stage-55 sampled contour and are reported.

The sampled orbit is the sole membership authority (attempt-5 fix, commit
`9494820`). Traced curves never change a cell's period in either direction:
demotion near a curve cut straight facets into the sheets wherever a sparse
trace closed an arc with a chord, and containment rescue converted the
slow-converging chaotic ring inside each component into sheet, collapsing
the edge cloud band. Curves retain three refining roles: refinement
allocation near crossings, analytic transition-vertex snapping (resolved
before categorical bisection), and distance values applied only within 2
cells of agreement with the sampled field. The band and cloud figures are
therefore bit-identical to stage 55. The former hard-coded-coordinate
fixture is replaced by a genuine property test: an under-covering traced
curve must not bite the sampled silhouette
(`src/sims/logistic-mandelbrot/kernel.test.cjs`).

## Integration design

The surface builder's return contract is unchanged. Its options accept closed
boundary polylines. Triangle-edge crossings come from those polylines, and
curve-intersecting cells enter refinement even when all four coarse corners
share a label. Analytic refinement stops at depth 4 under a 5,592-leaf
allowance. Rescue-free integration keeps the whole stage-55 sampled
boundary (6,214 leaves at the verifier's DPR2 rig) and adds 769 analytic
leaves near curve crossings, landing at 6,983 within the 7,000 envelope.

Adaptive leaves carry their owning coarse quad, so integer sub-cell boundaries
remain attached to the correct tessellation cell. The harness now mirrors the
live two-part preparation protocol: the planning sampler prepares adaptive
points, then an edge scan prepares the categorical bisection points needed by
fallback contours. Tessellation uses the same total sampler as the live
path: a lookup miss self-heals by computing the sample on demand, and the
harness reports the on-demand count (zero in every window). The full 768 by
768 build projects through the verifier rig's device-pixel viewport (1280 by
720 at devicePixelRatio 2) and reproduces the live refinement spend and
triangle count exactly.

Analytic work stays inside the sliced phase loop. Catalogue tracing runs one
bounded component at a time, grid relabelling runs cell by cell, and
curve-distance grading runs cell by cell. The browser alone can measure timer
quantisation and finalisation because the worker sandbox cannot launch it.

## Curve-distance grading

The traced path supplies distance only, never membership. Inside a covered
component, sheet dissolve comes from true distance to that component curve
when that distance agrees with the sampled periodic field to within 2 cells;
where a trace diverges from the sampled edge, the sampled field wins, so the
dissolve band and the cloud band never migrate to a bogus chord. Cloud-band
selection uses the unmodified sampled distance field. An exact curve
crossing has dissolve zero.

Curve lookup rejects components by bounding box before polyline distance is
evaluated, avoiding a full point comparison against every curve.

## Deterministic harness result

Two complete `node scripts/analyze-sheet-edges.cjs` runs were byte-identical.
SHA-256: `a2a28795041109198be4c1c9b1121622af8bdd94658043ad200a152ff1d0875f`.

| Window | Curve-trimmed components | Fallback components | Boundary vertex error | Silhouette chord error | Demoted cells |
|---|---|---|---:|---:|---:|
| full-default | p1@49, p2@100, p3@30, p3@115, p7@51, p7@203 | p3@220 did not close; p4@118 singular corrector | 0.000004 px | 0.247848 px | 0 |
| period-2-bulb | p1@104, p2@70, p6@47, p6@362, p8@52, p8@388 | p4@189 singular corrector | 0.000008 px | 0.220530 px | 0 |
| period-8-cascade | none | p4@19 singular corrector; p8@91 did not close | not applicable | not applicable | 0 |

The live 768 by 768 row gates on zero demoted cells and measures the
silhouette chord against the traced curves at the live grid: maximum
0.428864 cells (worst component p1@108761), snapped boundary vertices at
0.000041 cells.

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

| Window | Triangles | Mesh bytes |
|---|---:|---:|
| full-default | 3,649 | 226,380 |
| period-2-bulb | 12,862 | 660,408 |
| period-8-cascade | 4,204 | 194,256 |
| live-default-768 | 436,766 | 16,833,624 |

The live row refines 6,983 leaves at the DPR2 rig viewport. The live point
buffers remain 371,114,240 bytes at 13,254,080 points; adding the measured
mesh gives a pure-computable peak geometry figure of 387,947,864 bytes. The
triangle count is below the 1,199,999 cap with 2.75x headroom. The
refinement total is 769 leaves above the stage-55 figure, the cost of
rescue-free analytic snapping, within the 7,000 envelope; every sampled
fallback leaf is retained.

| Figure | Stage 55 | Stage 56 pure after |
|---|---:|---:|
| Median slice | 8.000 ms | verifier to measure |
| Maximum slice | 37.400 ms | verifier to measure |
| Finalisation | 2,004.500 ms | verifier to measure |
| Peak geometry | 388,734,260 B | 387,947,864 B |
| Triangles | 445,023 | 436,766 |
| Refined leaves | 6,214 | 6,983 |

The verifier should measure the three browser timing rows, confirm cloud-mode
pixel identity, inspect the cardioid and period-2 circle at review zoom, and
rotate the view to check for sparkle or shimmer.
