# Logistic Mandelbrot sheet-edge findings

## Decision

The sawtooth is **geometric**. At the current depth 2, consecutive signed
silhouette residuals flip side at rates of 0.383817 in the full window and
0.392105 in the period-2 bulb close-up. The signature remains at 0.438640 and
0.461936 respectively at depth 4, so lighting is not creating the alternating
vertex positions.

The verifier evidence set uses these names:

- `40-bulb-normal.png`: the ordinary lit baseline.
- `40-bulb-flat-colour.png`: uniform albedo with lighting and edge fade removed;
  the same triangular nicks remain, which confirms geometric silhouette error.
- `40-bulb-normals-as-colour.png`: stored normals mapped directly to RGB; normal
  changes follow the already notched outline rather than creating a different
  outline.

Activate the captures with no `surfaceDiagnostic` query value for normal,
`?surfaceDiagnostic=flat` for flat colour, and
`?surfaceDiagnostic=normals` for normals-as-colour. The canvas reports the
resolved state as `data-orbit3d-surface-diagnostic="off|flat|normals"`; the
default is `off`.

## Measurement

`node scripts/analyze-sheet-edges.cjs` samples with 1,500 warmup iterations and
8 orbit samples. It compares emitted rank-zero contour vertices against a
depth-5 reference with 12 fixed bisection steps. Deviations are fractions of a
coarse cell. The full window uses `[-2, 1] x [-1, 1]`; the named close-up uses
`[-1.32, -0.68] x [-0.34, 0.34]` around the period-2 bulb.

| Window | Depth | Boundary segments | Refined leaf cells | Mean deviation | Maximum deviation | Alternation |
|---|---:|---:|---:|---:|---:|---:|
| full-default | 1 | 238 | 216 | 0.012430 | 0.329828 | 0.407563 |
| full-default | 2 | 482 | 864 | 0.005856 | 0.151904 | 0.383817 |
| full-default | 3 | 1,041 | 3,456 | 0.003132 | 0.072297 | 0.432277 |
| full-default | 4 | 2,412 | 13,824 | 0.002098 | 0.072977 | 0.438640 |
| period-2-bulb | 1 | 374 | 352 | 0.021394 | 0.417225 | 0.318182 |
| period-2-bulb | 2 | 760 | 1,408 | 0.011255 | 0.147775 | 0.392105 |
| period-2-bulb | 3 | 1,782 | 5,632 | 0.007482 | 0.124938 | 0.379910 |
| period-2-bulb | 4 | 4,256 | 22,528 | 0.003304 | 0.063398 | 0.461936 |

The boundary selection covers 54 of 216 coarse quads in the full window, a
0.25 refined-cell share, and 88 of 400 in the bulb window, a 0.22 share.

## Refinement payoff

| Window | Added depth | Mean-deviation gain | Added leaf cells | Gain per 1,000 added cells |
|---|---:|---:|---:|---:|
| full-default | 1 to 2 | 0.006574 | 648 | 0.010145 |
| full-default | 2 to 3 | 0.002724 | 2,592 | 0.001051 |
| full-default | 3 to 4 | 0.001034 | 10,368 | 0.000100 |
| period-2-bulb | 1 to 2 | 0.010139 | 1,056 | 0.009601 |
| period-2-bulb | 2 to 3 | 0.003773 | 4,224 | 0.000893 |
| period-2-bulb | 3 to 4 | 0.004178 | 16,896 | 0.000247 |

Payoff collapses beyond depth 2. The gain per added cell falls by about 90 per
cent from depth 2 to depth 3 in both windows, while the full-window maximum
does not improve from depth 3 to depth 4, moving from 0.072297 to 0.072977.
A deeper fixed depth is therefore rejected: it spends 13,824 or 22,528 leaf
cells without removing the 0.438640 or 0.461936 alternation signature.

## Stage 41 recommendation

Use a combination of **error-driven pixel-budget refinement** and
**trimmed-polygon tessellation regularisation with contour-wise boundary-height
smoothing**. Refinement alone reduces mean deviation, but the depth-4
alternation rates above show that it does not remove the notch pattern.

Export these budgets from `src/app/orbit3d.ts`:

- `ORBIT_SURFACE_EDGE_ERROR_PX = 0.75`
- `ORBIT_SURFACE_MAX_REFINEMENT_DEPTH = 4`
- `ORBIT_SURFACE_REFINEMENT_CELL_BUDGET = 32_768`
- `ORBIT_SURFACE_DISSOLVE_BAND_CELLS = 2.5`

The named acceptance criterion is **sub-pixel regular silhouette**: at the
verifier's fixed bulb camera and viewport, every accepted contour segment has
screen-space chord error at or below 0.75 px, the flat-colour capture has no
alternating triangular notch above 1 px, and the harness alternation rate is
at or below 0.15. The cell cap remains 32,768 and the existing triangle cap
remains unchanged.

The adaptive pass should split a boundary cell only while its projected
bisected contour differs from the emitted polygon edge by more than 0.75 px,
up to depth 4 and the cell budget. Regularisation should join the two
transition points in each trimmed half-quad with a consistent diagonal and
smooth only equal-period, equal-rank boundary heights along each contour chain.
Interior vertices and period selection remain unchanged.

## Sheet-to-cloud dissolve band

The prepared transition edges already locate the period-to-chaos contour.
During finalisation, derive signed distance in coarse-cell units from those
locations for sheet vertices and period-zero cloud points, without adding
attractor samples. Over 2.5 cells, sheet coverage ramps from zero at the
contour to one on the periodic side, while period-zero point energy and keep
density ramp from zero to one on the chaotic side.

Do not multiply this ramp by the existing edge-fade rings at a chaos
transition. Use the dissolve value there and retain `edgeFades` for outer and
height-rejection edges, avoiding a double-dark rim. In glass mode, multiply
premultiplied sheet alpha by the dissolve coverage and keep depth writes off.
In opaque mode, do not blend fractional alpha: apply deterministic
screen-space coverage discard, write opaque colour and depth only for retained
fragments, and let the cloud remain additive. This preserves opaque occlusion
without introducing alpha sorting artefacts.

Stage 41 should touch only:

- `src/app/orbitSurface.ts`
- `src/app/orbit3d.ts`
- `src/app/webglRenderer.ts`
- `src/sims/logistic-mandelbrot/kernel.test.cjs`
- `e2e/smoke.spec.ts`

`Cloud`, the 8 ms slicing contract, presets, thumbnails, and
`docs/INTERFACE.md` remain unchanged.
