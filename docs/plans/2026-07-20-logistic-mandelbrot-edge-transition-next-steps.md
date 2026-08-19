# Logistic Mandelbrot hybrid surface: edge and transition next steps

Status: analysis backlog for a later session this week (from operator review,
2026-07-20). Stage 28 (contour-following sheet edges, commit on
`feat/logistic-mandelbrot-hybrid-surface`) landed and verified 9/9; the
operator judged the bulb silhouettes clearly better but not yet publishable.
The branch stays as a worktree, rebased onto `dev`, until this work is done.

## Operator verdict on stage 28

1. **Edges are still grainy.** A close-up of a bulb silhouette shows a
   regular sawtooth of small triangular nicks along the contour: the
   interpolated boundary is followed at cell scale, but the trimmed polygons
   leave an alternating notch pattern instead of a clean curve.
2. **No smooth hand-over from sheet to cloud.** Approaching chaos the sheet
   simply stops and the point cloud simply starts; there is no visual
   dissolve between the two regimes. The eye should read a continuous
   transition as period-doubling accelerates into chaos.

## Analysis to run first (the "fractal raster" question)

Before another implementation stage, spend an analysis pass characterising
the residual error rather than guessing:

- **Classify the sawtooth.** Determine whether the nicks are geometric
  (silhouette vertex positions alternating around the true contour) or
  shading (normals and edge fades at trimmed vertices disagreeing with the
  interior). Render with flat colour and with normals-as-colour to separate
  the two. Candidate causes: per-half-quad trimming emitting alternating
  polygon shapes row by row; bisection heights taken from the deepest
  matching sample oscillating between neighbouring boundary vertices; the
  depth-2 refinement floor still quantising the contour between refined and
  unrefined neighbours.
- **Measure boundary complexity against refinement depth.** For a set of
  zoom levels, log contour segment counts and residual deviation at depths
  1 to 4 to find where extra depth stops paying. This is the empirical basis
  for whether a deeper or error-driven adaptive raster is worth it.
- **Evaluate an error-driven refinement criterion.** Instead of a fixed
  depth everywhere on the boundary, refine while the screen-space deviation
  between the bisected contour and the emitted polygon edge exceeds a pixel
  budget. Compare against a period-domain criterion (refine only where the
  neighbouring detected periods differ by more than one doubling).
- **Prototype the sheet-to-cloud dissolve.** The promising shape: a
  transition band on the chaotic side of the contour where sheet opacity
  feathers to zero over distance-to-boundary while point density and
  brightness ramp up, so sheets dissolve into particulate chaos rather than
  butting against it. The refined boundary cells already know their
  distance to the contour, so the band can be driven from data the build
  already produces. Check interaction with the existing edge-fade rings and
  with opaque mode (opacity 1 currently writes depth; the band must not
  reintroduce sorting artefacts).

## Candidate stage 29 scope (to be confirmed after analysis)

- Fix whichever sawtooth cause the analysis confirms (likely trimmed-polygon
  tessellation regularisation plus boundary-vertex height smoothing along
  the contour).
- Error-driven adaptive boundary refinement replacing the fixed depth-2,
  with a pixel-budget constant and a cell budget cap.
- The sheet-to-cloud transition band, driven by distance-to-contour, active
  in both glass and opaque modes.

## Ground rules carried forward

- Same worktree and topology: `feat/logistic-mandelbrot-hybrid-surface`
  worktree, Sol worker, Claude Fable 5 verifier, isolated driver under the
  dedicated controller home, verifier-side Playwright.
- Cloud stays the untouched default; interior sheet geometry stays
  byte-identical; `docs/INTERFACE.md` shape unchanged; no new dependency.
- Do not merge or deploy the branch until the operator approves the edges
  visually.
