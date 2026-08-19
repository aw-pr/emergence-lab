# Surface-branch reference set

Source: `feat/logistic-mandelbrot-hybrid-surface` at commit `e4d6f44`
(stage 41 state: sub-pixel regular silhouettes and the sheet-to-cloud
dissolve band, verifier 7/7 PASS). This branch, `feat/logistic-mandelbrot-surface-v2`,
was cut from `dev` at `a23ef03` (GPU orbit sampler era, stages 34 to 39c).

## Carried verbatim onto this branch (live code and docs)

- `src/app/orbitSurface.ts` - the pure surface builder at stage-41 state
  (consistent-diagonal trimmed tessellation, contour-chain height
  smoothing). Adapt call sites to it; do not rewrite it.
- `scripts/analyze-sheet-edges.cjs` - the edge harness with the frozen
  stage-41 targets. It may not run until the wiring stage lands; that is
  expected.
- `docs/plans/2026-07-19-logistic-mandelbrot-hybrid-surface.md`,
  `docs/plans/2026-07-20-logistic-mandelbrot-edge-transition-next-steps.md`,
  `docs/plans/2026-08-19-edge-analysis-findings.md` - the design and
  findings record.
- `docs/stages/26|27|28|40|41-*.md` - the stage history of this line.

## Reference only (this directory; never import or compile)

The source branch's wired files, for consulting while re-implementing the
integration against the current GPU-sampler renderer:

- `orbit3d.ts` - source-branch renderer wiring: hybrid build path, stage-41
  error-driven refinement and the four exported budget constants, stage-40
  diagnostic modes.
- `webglRenderer.ts`, `renderer.ts`, `simView.ts` - draw path (glass and
  opaque sheets, dissolve band, opacity redraw without rebuild), data
  attributes, geometry/opacity param plumbing.
- `kernel.ts` - the `geometryMode` and `surfaceOpacity` descriptors as
  shipped on the source branch.
- `kernel.test.cjs` - the source branch's full test file, including the
  pure surface fixtures (stage-28 synthetic boundaries, stage-41
  regularisation assertions). Port the surface fixtures into the current
  test file; do not overwrite the current file with this one, because dev's
  version gained GPU-sampler-era tests the source branch lacks.
- `tsconfig.test.json` - shows how the source branch included the pure
  builder in the test build.

## Why a port, not a merge

The source branch diverged before stages 34 to 39c rewrote the same
`orbit3d` internals; a rebase attempt died on structural conflicts and a
second merge would be worse. The pure module ports verbatim; only the
wiring is re-implemented, which is stage 43.
