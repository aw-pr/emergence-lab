# Stage card 52-surface-edge-cloud-densification: spend the bigger budget at the sheet edges

## Metadata

- **Authored:** 2026-08-20
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Sol carries the surface line (stages 26 to 28,
  40, 41, 43); the Claude verifier re-runs the harness and judges edge
  quality visually in the browser.

## Objective

Operator review of the stage-43 port: the hybrid mode is much improved,
but edge issues remain, while the point cloud itself is smooth. The
original memory constraint is gone (165 to 202 refined cells against a
budget of 32768), so spend some of that headroom exactly where the eye
goes: the band where sheets end and dissolve into the cloud.

1. **Denser cloud in the edge band.** Concentrate additional point-cloud
   samples in a band around each sheet silhouette (widen and densify the
   stage-41 dissolve region) so the transition from sheet to cloud carries
   far more points than the interior. The interior cloud density stays as
   it is; the budget goes to the band.
2. **Deeper refinement at the edge.** Re-tune the stage-41 budget
   constants for the new headroom: the stage-40 depth-payoff table showed
   payoff collapsing past depth 2 at the old budget; re-measure with the
   band densification in place and pick the knee. The constants are
   explicitly unfrozen for this stage; record the new values and the
   measurements that justify them.
3. **Cost discipline.** The 8 ms slice budget holds; report refined-cell
   share, band point count, median and maximum slice time, finalisation
   time, and peak geometry memory before and after.

## Inputs (read these in your own context)

- `state/verifiers/43-logistic-mandelbrot-surface-port.json`
- `docs/plans/2026-08-19-edge-analysis-findings.md`
- `src/app/orbitSurface.ts`
- `src/app/orbit3d.ts`
- `src/app/webglRenderer.ts`
- `scripts/analyze-sheet-edges.cjs`
- `src/sims/logistic-mandelbrot/kernel.ts`
- `src/sims/logistic-mandelbrot/kernel.test.cjs`
- `docs/verification.md`

## Deliverables

1. Edge-band cloud densification in the hybrid build path, driven by the
   same silhouette classification the dissolve band already uses.
2. Re-tuned budget constants with a measurement table in a short findings
   note under `docs/plans/`.
3. `scripts/analyze-sheet-edges.cjs` extended to report band point density
   alongside the existing chord and alternation metrics.
4. Updated pure fixtures in `src/sims/logistic-mandelbrot/kernel.test.cjs`
   where the new band behaviour is testable purely.

## Constraints

- Cloud mode (the factory default) stays byte-identical; every change is
  gated behind hybrid mode.
- `buildOrbitSurface`'s public contract is unchanged; extend rather than
  rewrite.
- Chord error at or below 0.75 px and alternation at or below 0.15 remain
  the floor; do not regress either while densifying.
- No new dependency; no git mutations by the worker; stop cleanly on
  budget exhaustion; relative paths; UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green.
2. `node scripts/analyze-sheet-edges.cjs` meets the frozen chord and
   alternation targets and shows the band density uplift, byte-identical
   across two runs.
3. Verifier-side browser check: the sheet-to-cloud transition at close
   zoom is visibly denser and smoother than the stage-43 state (captures
   against the stage-43 verifier evidence); no new sparkle or shimmer
   during rotation.
4. Slice-time and memory figures reported and within the 8 ms discipline.
5. Cloud mode indistinguishable from stage-43 state; no console or WebGL
   errors.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Modelling the edge as a curve (stage 53); changing the interior cloud;
  merging to dev or main; presets, thumbnails, other simulations.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 60 minutes

## Verifier handoff

The envelope states: the band definition and how points are allocated to
it, the new constant values with their measurement table, the harness
numbers, the slice and memory figures, and the files touched.

## Family-specific notes

- **Codex (worker):** the sandbox cannot reach the window server; do not
  launch a browser. The harness and pure fixtures are your feedback loop.
