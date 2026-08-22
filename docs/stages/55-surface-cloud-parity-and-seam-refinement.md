# Stage card 55-surface-cloud-parity-and-seam-refinement: full cloud detail, smooth seams

## Metadata

- **Authored:** 2026-08-22
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Verifier panel:** false
- **Pairing rationale:** quota is being spread across pools this window
  (stage 54 worker was Opus), so Terra takes the worker seat; Opus flips
  to the verifier seat for the cross-family check and runs the browser
  pass headless. No Requires GUI declaration: the Claude verifier is
  unsandboxed by nature, and the Codex worker needs no browser, so it
  keeps its sandbox.

## Objective

Operator review of the live hybrid (screenshots in the session log,
2026-08-22, second round): two defects stand between this and the plain
point cloud.

1. **The hybrid's chaotic cloud is far thinner than cloud mode.** The
   plain cloud renders visibly more points in the same chaotic regions
   than the hybrid does; the operator reads that as lost detail. Find
   where the hybrid build path drops cloud density relative to the
   cloud-mode path (sample count, point budget share, draw density, or
   subsampling) and bring the hybrid's chaotic-region point density to
   parity with cloud mode, or as close as the triangle and memory budgets
   allow, with the gap measured and reported.
2. **Jagged black tears across sheet interiors.** Sheets show stepped
   zigzag seams (black sawtooth lines cutting across otherwise smooth
   surface, per the operator's captures). Diagnose what the seams are
   (fold lines, sheet self-intersections, adjacent-cell tessellation
   disagreement, or period-boundary transitions) and smooth them:
   targeted refinement along the seam, welding or feathering across it,
   whichever the diagnosis supports. The stage-40 finding that the
   sawtooth is geometric, and the stage-53 curve tracer
   (`src/app/orbitSurfaceCurves.ts`), are prior art; consume them where
   they help.

## Inputs (read these in your own context)

- `state/verifiers/54-surface-coverage-and-edge-saturation.json`
- `docs/plans/2026-08-22-surface-coverage-and-edge-saturation.md`
- `docs/plans/2026-08-19-edge-analysis-findings.md`
- `src/app/orbitSurface.ts`
- `src/app/orbitSurfaceComponents.ts`
- `src/app/orbitSurfaceCurves.ts`
- `src/app/orbit3d.ts`
- `src/app/webglRenderer.ts`
- `scripts/analyze-sheet-edges.cjs`
- `src/sims/logistic-mandelbrot/kernel.test.cjs`
- `docs/verification.md`

## Deliverables

1. Hybrid chaotic-cloud density at parity with cloud mode (or the
   measured closest the budgets allow), with before-and-after point
   counts for the same framing in the findings note.
2. A seam diagnosis (what the zigzag tears are, with the evidence) and
   the smoothing that follows from it, in the same findings note under
   `docs/plans/`.
3. `scripts/analyze-sheet-edges.cjs` extended with a seam metric
   (maximum step discontinuity along detected seams, or the diagnosis's
   natural measure) so the improvement is harness-visible.
4. Updated pure fixtures in `src/sims/logistic-mandelbrot/kernel.test.cjs`
   where the new behaviour is testable purely.

## Constraints

- Cloud mode (the factory default) stays byte-identical; every change is
  gated behind hybrid mode.
- `buildOrbitSurface`'s public contract is unchanged; extend rather than
  rewrite.
- Chord error at or below 0.75 px and alternation at or below 0.15 remain
  the floor.
- Stage-54 coverage and band density do not regress; the harness proves
  it.
- The 8 ms median slice discipline holds (timer-quantum readings adjacent
  to 8.0 are acceptable per the stage-54 note); the 1,199,999 triangle
  cap holds; report peak geometry.
- No new dependency; no git mutations by the worker; stop cleanly on
  budget exhaustion; relative paths; UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green.
2. `node scripts/analyze-sheet-edges.cjs` meets the frozen chord and
   alternation targets, holds the stage-54 coverage and band figures, and
   shows the seam metric improving, byte-identical across two runs.
3. Verifier-side headless browser check against the operator's captures
   and the stage-54 evidence: chaotic regions in hybrid read as dense as
   cloud mode at the same framing; the zigzag tears across sheet
   interiors are gone or visibly smoothed at review zoom; no new sparkle
   or shimmer during rotation.
4. Median slice time within the 8 ms discipline; maximum slice,
   finalisation, peak geometry and triangle count reported with
   before-and-after figures.
5. Cloud mode indistinguishable from the stage-54 state; no console or
   WebGL errors.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Wiring the stage-53 analytic tracer into tessellation as a general
  mechanism (only consume it where the seam fix naturally uses it);
  merging to dev or main; presets, thumbnails, other simulations.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 60 minutes

## Verifier handoff

The envelope states: where the hybrid was losing cloud density and the
parity now achieved with numbers, the seam diagnosis and the fix, the
seam metric definition and its before-and-after values, the harness
numbers, the slice and memory figures, and the files touched.

## Family-specific notes

- **Codex (worker):** the sandbox cannot reach the window server; do not
  launch a browser. The harness and pure fixtures are your feedback loop.
- **Claude (verifier):** run the browser pass fully headless; never
  attach to the operator's Chrome or open a headed window.

## Re-brief (2026-08-22, attempt 2)

Attempt 1 (committed for reference as `wip/55-attempt-1`, 2135ab4) was
verified FAIL on the density clause only. Keep its good parts, close the
real gap:

- **What stands from attempt 1:** the seam diagnosis and fix (the 0.16
  exposed-edge fade darkening period-transition vertices; verifier
  confirmed every strong pixel change is a brightening and no shimmer),
  the restored 3 by 3 refinement lattice, and the harness seam metric.
  Start from that WIP commit rather than re-deriving it.
- **The defect:** parity was proven against the harness's synthetic 3 by 3
  resample of 3, 10 and 35 chaotic coarse sites, not the live cloud path.
  Live figures at identical framing: hybrid 1,903,136 points total
  (749,544 chaotic-cloud) against cloud mode's 13,254,080; lit-pixel share
  in chaotic regions is about 60 per cent of cloud mode at every luminance
  threshold. The rendered hybrid is visibly thinner, which is exactly what
  the operator reported.
- **The target:** hybrid chaotic regions reach at least 90 per cent of
  cloud mode's lit-pixel share at the same framing, measured the
  verifier's way (fractional-rect luminance share at matched camera
  state), or the findings note documents the binding budget that prevents
  it with the closest achievable figure. Match the live cloud path's
  per-cell orbit sample density inside hybrid chaotic cells; the point
  budget, not a synthetic resample, is the lever.
- **Harness honesty:** the harness's cloud reference must be derived from
  the live cloud path's actual density so its parity figures carry to the
  rendered view; the findings note must not claim parity the live view
  does not show.
- All other constraints, criteria and figures from the original card and
  the stage-54 baselines stand unchanged.
