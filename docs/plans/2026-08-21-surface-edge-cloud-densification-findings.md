# Surface edge-cloud densification findings

## Decision

Use an 8-cell sheet dissolve band and add up to four bounded-chaotic sub-cell
sites around each coarse chaotic site in that band. Candidates come from a
deterministic 5 by 5 grid spanning 0.25 coarse cells. Periodic and escaped
candidates are rejected with the same period classification and periodic
distance field that drive the dissolve coverage. The original coarse sites are
left in place, so cloud density outside the band is unchanged.

Tighten the projected chord target from 0.75 px to 0.5 px and allow depth 5.
Keep the 32,768-leaf cap. The bulb fixture reaches depth 5 to meet 0.5 px, while
the full-window fixture stops at depth 4. A uniform depth-5 pass is still poor
value, so depth 5 remains an adaptive ceiling rather than a fixed depth.

## Constants

- `ORBIT_SURFACE_EDGE_ERROR_PX = 0.5`
- `ORBIT_SURFACE_MAX_REFINEMENT_DEPTH = 5`
- `ORBIT_SURFACE_REFINEMENT_CELL_BUDGET = 32_768`
- `ORBIT_SURFACE_DISSOLVE_BAND_CELLS = 8`
- `ORBIT_SURFACE_BAND_CANDIDATE_SUBDIVISION = 5`
- `ORBIT_SURFACE_BAND_SAMPLES_PER_CELL = 4`
- `ORBIT_SURFACE_BAND_SAMPLE_SPAN_CELLS = 0.25`

## Fixed-harness measurements

`node scripts/analyze-sheet-edges.cjs` was byte-identical across two runs.

| Window | Adaptive leaves before | Adaptive leaves after | Deepest after | Chord before | Chord after | Alternation before | Alternation after |
|---|---:|---:|---:|---:|---:|---:|---:|
| full-default | 165 | 216 | 4 | 0.736184 px | 0.482036 px | 0.042553 | 0.046875 |
| period-2-bulb | 202 | 307 | 5 | 0.743364 px | 0.500000 px | 0.000000 | 0.000000 |

| Window | Band points before | Band points after | Density uplift | Peak fixture geometry before | Peak fixture geometry after |
|---|---:|---:|---:|---:|---:|
| full-default | 24 | 104 | 4.333x | 89,532 bytes | 111,872 bytes |
| period-2-bulb | 96 | 480 | 5.000x | 178,356 bytes | 248,232 bytes |

The fixed-depth table confirms the knee. Full-window mean deviation improves
from 0.001336 at depth 4 to 0.000465 at depth 5, but costs 41,472 more leaves.
The bulb improves from 0.000791 to 0.000326 for 67,584 more leaves, and its
maximum deviation worsens from 0.020661 to 0.030486. Adaptive depth 5 obtains
the required bulb chord result with only 105 leaves above the old pass.

## Runtime cost telemetry

The stage-43 browser baseline reported a 0.007709 refined-cell share, 8.0 to
8.2 ms median slices, 48.2 to 110.7 ms maximum slices, 1,220 to 6,134 ms
finalisation, 7,200,016 points and 417,670 triangles. Stage 52 now publishes
`data-orbit3d-band-points` and `data-orbit3d-peak-geometry-bytes` alongside the
existing refined-cell, slice and finalisation fields. The worker sandbox cannot
run the card's browser measurement, so the verifier must record the stage-52
runtime row from those attributes and confirm the 8 ms median discipline. The
pure harness figures above cover the deterministic before-and-after geometry
cost without inventing browser timings.
