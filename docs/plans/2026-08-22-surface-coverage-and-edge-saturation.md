# Surface coverage and edge saturation findings

## Decision

Two independent levers, measured separately.

**Coverage.** Classify every bounded cell exactly instead of relying on the
empirical repeat test alone. For each candidate period q from 1 to 8, solve
f_c^q(z) - z = 0 by Newton iteration from a warmed-up orbit point and read the
cycle multiplier mu_q = d f_c^q / dz at the root. A quadratic map has one
critical point and therefore at most one attracting cycle, so any root with
|mu_q| < 1 is the attractor and the parameter lies inside the period-q
component. The empirical label stands wherever the classifier declines, so
coverage can only grow and no sheet can appear over chaotic parameter space.

**Edge saturation.** Widen the cloud-side band from 8 to 12 cells, raise the
sub-cell site count from 4 to 16 out of a 7 by 7 candidate grid, spread those
sites across 0.75 of a coarse cell rather than 0.25, and give each added site
half the energy of the coarse site it surrounds. Site count more than trebles
while band energy stays within a quarter of the stage-52 figure: the review
asked for a denser mist, not a brighter band.

The sheet-side dissolve width stays at 8 cells, so the sheets themselves read
exactly as reviewed at stage 52. Both ramps still come from the one shared
`orbitSurfaceDissolveCoverage` function; only the widths differ.

## Why the sampler misses whole components

`estimatePeriod` searches lags 1 to `count - 1`, so an eight-sample window can
never report period 8: the test needs one lag pair and period 8 leaves none.
Every period-8 component in the rendered domain was therefore dust by
construction, not by judgement. The second family the window misses is
components whose multiplier sits close to the unit circle, where 1,500 warmup
iterations leave the orbit short of the cycle.

Newton answers both. At c = -1.3815474, the centre of the real period-8
component, the sampler returns 0 and the classifier returns period 8 with
|mu| < 1e-9. The classifier costs 0.45 microseconds per parameter against
roughly 5 microseconds for the 1,500-iteration warmup it accompanies, so
coverage is bought at about a tenth of the sampling cost already being paid.

## Constants

- `ORBIT_SURFACE_MAX_COMPONENT_PERIOD = 8`
- `ORBIT_SURFACE_COMPONENT_MULTIPLIER_MARGIN = 0.02`
- `ORBIT_SURFACE_COMPONENT_WARMUP = 256`
- `ORBIT_SURFACE_DISSOLVE_BAND_CELLS = 8` (unchanged)
- `ORBIT_SURFACE_CLOUD_BAND_CELLS = 12`
- `ORBIT_SURFACE_BAND_CANDIDATE_SUBDIVISION = 7`
- `ORBIT_SURFACE_BAND_SAMPLES_PER_CELL = 16`
- `ORBIT_SURFACE_BAND_SAMPLE_SPAN_CELLS = 0.75`
- `ORBIT_SURFACE_BAND_SAMPLE_WEIGHT = 0.5`
- `ORBIT_SURFACE_EDGE_ERROR_PX = 0.5` (unchanged)
- `ORBIT_SURFACE_MAX_REFINEMENT_DEPTH = 5` (unchanged)
- `ORBIT_SURFACE_REFINEMENT_CELL_BUDGET = 32_768` (unchanged)

## Coverage measurements

`node scripts/analyze-sheet-edges.cjs`, byte-identical across two runs. Share is
of bounded cells, which is the population that could carry a sheet at all.

| Window | Bounded | Sampler sheets | Classified sheets | Share before | Share after | Uplift |
|---|---:|---:|---:|---:|---:|---:|
| full-default | 66 | 63 | 63 | 0.954545 | 0.954545 | 1.000x |
| period-2-bulb | 249 | 237 | 239 | 0.951807 | 0.959839 | 1.008x |
| period-8-cascade | 241 | 68 | 206 | 0.282158 | 0.854772 | 3.029x |

`period-8-cascade` is a new fixture window over the period-4 to period-8 stretch
of the real-axis cascade, c in [-1.4, -1.36] by [-0.02, 0.02]. It is the window
that isolates the effect, because it is dominated by exactly the components the
sample window cannot reach. The wide windows were already near their ceiling:
in the full default framing 95 per cent of bounded cells were periodic before
this stage, so the remaining dust there is genuinely chaotic and correctly stays
cloud. The live default view moves from 0.968625 to 0.971482, and the gain is
concentrated in the cascade tails and the small higher-period bulbs, which is
where the review saw dust.

The accepted multiplier margin is the overreach control. Coverage against it:

| Window | margin 0 | 0.005 | 0.02 | 0.05 | 0.15 |
|---|---:|---:|---:|---:|---:|
| full-default | 0.954545 | 0.954545 | 0.954545 | 0.954545 | 0.954545 |
| period-2-bulb | 0.991968 | 0.959839 | 0.959839 | 0.959839 | 0.959839 |
| period-8-cascade | 0.921162 | 0.912863 | 0.854772 | 0.817427 | 0.721992 |

Margin 0 admits everything with |mu| < 1, which is the mathematically complete
answer but puts the sheet edge exactly on the bifurcation locus, where the
Newton system is singular and the claimed cycle is only marginally attracting.
Margin 0.02 gives up 7 percentage points in the cascade window and holds the
sheet a measurable step inside every component. Beyond 0.05 the cost rises
faster than any stability gain, so 0.02 is the landing point.

## Component catalogue

The classifier's by-product is a component catalogue: connected same-period
regions with one interior seed each, chosen as the point of smallest multiplier
magnitude in the region because that is the best-conditioned continuation
start. The catalogue is what stage 53's tracer needs and could not build.

| Window | Period | Regions | Cells | Seed c | Seed \|mu\| |
|---|---:|---:|---:|---|---:|
| full-default | 1 | 1 | 48 | -0.026316, 0 | 0.051315 |
| full-default | 2 | 1 | 9 | -0.973684, 0 | 0.105263 |
| full-default | 3 | 3 | 3 | -1.763158, 0 | 0.670616 |
| full-default | 4 | 1 | 1 | -1.289474, 0 | 0.356327 |
| full-default | 7 | 2 | 2 | 0.131579, -0.615385 | 0.676304 |
| period-2-bulb | 1 | 1 | 24 | -0.695238, 0 | 0.944467 |
| period-2-bulb | 2 | 1 | 199 | -1.000000, 0 | 0.000000 |
| period-2-bulb | 4 | 1 | 6 | -1.304762, 0 | 0.100441 |
| period-2-bulb | 6 | 2 | 8 | -1.152381, -0.226667 | 0.732796 |
| period-2-bulb | 8 | 2 | 2 | -1.000000, 0.259048 | 0.416903 |
| period-8-cascade | 4 | 1 | 68 | -1.360952, 0 | 0.872527 |
| period-8-cascade | 8 | 1 | 138 | -1.381905, 0 | 0.027613 |

Each seed carries the `(period, c, cycle)` triple that
`correctOrbitSurfaceBoundaryPoint` takes as its predictor, so a later stage can
trace every listed component without rediscovering it. Nothing in this stage
consumes the catalogue; the renderer only uses the per-cell classification.

## Sheet-edge accuracy did not move

The frozen floors hold, and classification is neutral to slightly favourable on
both. Same settings, classification the only difference:

| Window | Chord, unclassified | Chord, classified | Alternation, unclassified | Alternation, classified |
|---|---:|---:|---:|---:|
| full-default | 0.482036 px | 0.482036 px | 0.046875 | 0.040000 |
| period-2-bulb | 0.500000 px | 0.500000 px | 0.000000 | 0.000000 |
| period-8-cascade | 0.480163 px | 0.480163 px | 0.000000 | 0.000000 |

All three are inside the 0.75 px chord and 0.15 alternation floors. Leaf counts
rise from 216 to 240, 307 to 332 and 99 to 155, all within the 32,768 budget,
because more classified sheets means more categorical contour to resolve.

An accepted classification also rewrites the cell's sample window from the exact
cycle rather than leaving a partly converged orbit in place, so the sheet sits
on the true attractor. That is why the alternation figure improves rather than
degrades while coverage grows.

## Band saturation tuning

All rows below hold classification fixed, so the energy column compares band
constants against band constants. Energy is the sum of per-site coverage weight
across the band, which is the quantity that sets how bright the mist reads.
`52 sheets54` is the stage-52 band constants re-measured under this stage's
sheet set, and is the honest before column.

| Window | Setting | Cells | Sub | Sites | Span | Weight | Band points | Uplift | Energy |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| period-2-bulb | 52 sheets54 | 8 | 5 | 4 | 0.25 | 1.00 | 400 | 5.000x | 2.971 |
| period-2-bulb | sites only | 8 | 7 | 16 | 0.75 | 0.50 | 888 | 11.100x | 3.326 |
| period-2-bulb | width only | 12 | 5 | 4 | 0.25 | 1.00 | 400 | 5.000x | 1.981 |
| period-2-bulb | weight 0.35 | 12 | 7 | 16 | 0.75 | 0.35 | 888 | 11.100x | 1.677 |
| period-2-bulb | weight 0.50 | 12 | 7 | 16 | 0.75 | 0.50 | 888 | 11.100x | 2.217 |
| period-2-bulb | weight 0.70 | 12 | 7 | 16 | 0.75 | 0.70 | 888 | 11.100x | 2.938 |
| period-2-bulb | weight 1.00 | 12 | 7 | 16 | 0.75 | 1.00 | 888 | 11.100x | 4.018 |
| period-2-bulb | band 16 | 16 | 7 | 16 | 0.75 | 0.50 | 888 | 11.100x | 1.663 |
| period-8-cascade | 52 sheets54 | 8 | 5 | 4 | 0.25 | 1.00 | 1384 | 4.943x | 15.912 |
| period-8-cascade | sites only | 8 | 7 | 16 | 0.75 | 0.50 | 4712 | 16.829x | 27.777 |
| period-8-cascade | width only | 12 | 5 | 4 | 0.25 | 1.00 | 1384 | 4.943x | 10.608 |
| period-8-cascade | weight 0.35 | 12 | 7 | 16 | 0.75 | 0.35 | 4712 | 16.829x | 13.608 |
| period-8-cascade | weight 0.50 | 12 | 7 | 16 | 0.75 | 0.50 | 4712 | 16.829x | 18.518 |
| period-8-cascade | weight 0.70 | 12 | 7 | 16 | 0.75 | 0.70 | 4712 | 16.829x | 25.065 |
| period-8-cascade | weight 1.00 | 12 | 7 | 16 | 0.75 | 1.00 | 4712 | 16.829x | 34.886 |
| period-8-cascade | band 16 | 16 | 7 | 16 | 0.75 | 0.50 | 4712 | 16.829x | 13.889 |

Reading the table. Site count is set entirely by the sub-cell geometry: 16 sites
from a 7 by 7 grid across 0.75 of a cell take band points from 400 to 888 in the
bulb window and from 1,384 to 4,712 in the cascade window. Widening the band
adds no sites in these fixtures, because a 21-cell window is already covered by
an 8-cell band; width is therefore justified by the live grid rather than by the
fixture, and the fixture's role is to confirm width costs nothing in chord or
alternation. Weight is the brightness dial, and it is close to linear in energy.
Weight 0.5 lands band energy at 0.75x the stage-52 figure in the bulb window and
1.16x in the cascade window, so brightness is preserved within a quarter either
way while the site count rises 2.2x and 3.4x. Weight 1.00 would have made the
band 1.35x to 2.19x brighter, and the review did not ask for a brighter band.
Band 16 was rejected because it lowers energy further without adding a single
site in any fixture.

## Cost

Fixed-fixture geometry, stage-52 state to stage-54 state:

| Window | Leaves before/after | Band points before/after | Geometry bytes before/after |
|---|---|---|---|
| full-default | 165/240 | 104/144 | 91,772/130,152 |
| period-2-bulb | 202/332 | 480/888 | 189,108/283,264 |
| period-8-cascade | 33/155 | 3,904/4,712 | 175,232/372,336 |

Live hybrid build, headless Chromium at 1280 by 720 with a 2560 by 1440 render
size, against the stage-52 verifier's recorded row:

| Figure | Stage 52 | Stage 54 |
|---|---:|---:|
| Median slice | 8.000 ms | 8.100 ms |
| Maximum slice | 38.600 ms | 48.200 ms |
| Finalisation | 1,306.100 ms | 1,984.300 ms |
| Peak geometry | 53,357,084 B | 64,419,576 B |
| Triangles | 420,737 | 430,838 |
| Band points | 175,648 | 553,216 |
| Refined-cell share | 0.007709 | 0.008166 |
| Sheet coverage share | not published | 0.971482 |
| Sampler coverage share | not published | 0.968625 |

Median slice sits one 0.1 ms timer quantum above the 8 ms budget. Chromium
coarsens `performance.now` to 100 microseconds without cross-origin isolation,
so 8.000 and 8.100 are adjacent representable values of the same budgeted loop;
the stage-43 baseline range was 8.0 to 8.2 ms on the same discipline. Maximum
slice and finalisation grew as the card allows: the band scan now tests 49
candidates per band cell instead of 25 across a band half again as wide, and
finalisation writes 3.15 times the band points.

## Where the next ceiling is

Peak geometry is 64.4 MB, up 20.7 per cent, and it is dominated by the five
per-point Float32 arrays at 28 bytes per point. Nothing in the pipeline is near
a hard limit yet:

- Triangles are 430,838 against the 1,199,999 cap in
  `ORBIT_SURFACE_TRIANGLE_LIMIT`, so the mesh has 2.8x headroom. Period-8 cells
  emit eight ranks each, so this is the limit that extending classification past
  period 8 would meet first.
- The point budget attribute reads 10,119,616 but the binding constraint is the
  per-site sample cap, not the budget: `pointSampleCount` is already at the
  full eight-sample window, so raising `POINT_BUDGETS` alone would add nothing.
  Extra points come only from extra sites, which is what the band spend buys.
- Adaptive leaves are 5,164 refined cells against the 32,768-cell budget, and no
  fixture window reported `budgetExhausted`.

The first real ceiling on this line is therefore the triangle cap, reached by
raising the classified period range rather than by any band setting.

## Scope not taken

The component catalogue is built and tested but nothing consumes it yet.
Wiring stage 53's tracer into tessellation stays its own stage, as the card
directs. The interior cloud outside the band is untouched, and cloud mode is
byte-identical: every change in `orbit3d.ts` lives inside `rebuildHybrid`, and
the new dataset attributes are written only in hybrid mode.
