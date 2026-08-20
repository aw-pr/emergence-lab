# Stage card 53-surface-analytic-edge-curves: model the sheet edges as curves

## Metadata

- **Authored:** 2026-08-20
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Sol carries the surface line; the Claude verifier
  re-runs the harness, checks the mathematics in the findings note, and
  judges the result in the browser.

## Objective

Operator direction: today the sheet edge is inferred from where sampled
cloud cells stop, then cleaned up by refinement. Model the edge as what it
actually is: a curve.

The sheet boundaries of the logistic-Mandelbrot surface are bifurcation
loci of the iterated map: the places where an attracting cycle loses or
gains stability. Those are defined by equations (cycle condition plus
multiplier magnitude equal to one), which means the edge curve can be
traced directly to near machine precision instead of being estimated from
samples.

1. **Findings first.** A short mathematical note: which boundary each
   visible sheet edge corresponds to for the periods the surface renders,
   the defining equations, and where a closed form exists against where
   numerical continuation is needed.
2. **Curve extraction.** A pure module that traces each edge as a
   polyline by predictor-corrector continuation (root-finding on the
   defining equations), resolution-adaptive to curvature, deterministic.
3. **Tessellate against the curve.** Feed the traced curves to the
   tessellation as exact boundary constraints: sheet cells trim to the
   curve rather than to a refined-sample estimate, and the dissolve band
   and stage-52 densification key off true curve distance.
4. **Prove the gain.** Extend the edge harness to measure silhouette
   error against the traced curve; the stage-41 chord target should fall
   substantially (aim for at or below 0.25 px) with fewer refined cells,
   since refinement no longer has to discover the edge.

This is a research stage. If full tessellation integration does not fit
the budget, the findings note, the working curve tracer with tests, and
the harness comparison are a complete, passing deliverable on their own;
say exactly where integration stopped.

## Inputs (read these in your own context)

- `docs/plans/2026-08-19-edge-analysis-findings.md`
- `state/verifiers/52-surface-edge-cloud-densification.json` (if stage 52 has run)
- `src/app/orbitSurface.ts`
- `src/app/orbit3d.ts`
- `scripts/analyze-sheet-edges.cjs`
- `src/sims/logistic-mandelbrot/kernel.ts`
- `src/sims/logistic-mandelbrot/kernel.test.cjs`
- `docs/verification.md`

## Deliverables

1. `docs/plans/2026-08-2x-analytic-edge-curves.md` - the mathematical
   findings note.
2. A pure curve-tracer module (sibling to `orbitSurface.ts`), unit-tested:
   known boundary points recovered to stated tolerance, determinism,
   adaptive resolution behaviour.
3. Integration per objective point 3, or a clean partial with the stopping
   point recorded.
4. Harness extension comparing silhouette error against the traced curve,
   with before and after numbers.

## Constraints

- Cloud mode stays byte-identical; all changes gated behind hybrid mode.
- The tracer is pure and renderer-independent; no WebGL types in it.
- Do not regress the stage-41 chord and alternation floors or stage-52
  band density if that stage has landed.
- No new dependency; no git mutations by the worker; stop cleanly on
  budget exhaustion; relative paths; UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green, including the tracer tests.
2. The findings note is mathematically sound (verifier checks the cycle
   and multiplier conditions) and matches what the tracer implements.
3. The harness shows silhouette error against the traced curve, with the
   integrated path at or below 0.25 px chord error, or the partial
   deliverable clearly recording where integration stopped and the
   tracer-only comparison numbers.
4. Verifier-side browser check (if integrated): edge quality at close
   zoom visibly at least as good as stage 52 with equal or fewer refined
   cells; no console or WebGL errors.
5. Byte-identical harness output across two runs.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Re-deriving the interior surface from theory; periods the renderer does
  not draw; merging to dev or main; other simulations.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 60 minutes

## Verifier handoff

The envelope states: which boundaries were modelled and their defining
equations, the tracer's tolerance and test evidence, how far integration
got, the harness numbers against the traced curves, and the files touched.

## Family-specific notes

- **Codex (worker):** the sandbox cannot reach the window server; do not
  launch a browser. The tracer tests and the harness are your feedback
  loop; browser judgement is verifier-side.
