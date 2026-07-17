# Stage card 17-logistic-mandelbrot-kernel: Logistic Mandelbrot — orbit sampler + CPU reference kernel

## Metadata

- **Authored:** 2026-07-17
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Claude Fable 5 <claude-fable-5@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier panel:** false
- **Pairing rationale:** The orbit-attractor sampler is novel numerical work with subtle correctness traps (transient warmup, escape clipping, period detection); the frontier Claude tier writes it, and Codex cross-family-verifies against the acceptance math and kernel tests.

## Objective

Create the maths core of a new sim, slug `logistic-mandelbrot`: the 3D object
formed by the Mandelbrot set in the c-plane with orbit attractors as height.
For each c in a grid over Re(c) ∈ [−2, 1], Im(c) ∈ [−1, 1], iterate
z ← z² + c from z = 0, discard a transient warmup (default 200 iterations),
then record the next K (default 48) values of Re(z), clipped to |Re(z)| ≤ 2.
Escaping orbits (|z| > 2 during warmup or sampling) contribute nothing. On the
real axis this point set IS the logistic-map bifurcation diagram (via
c = r/2·(1 − r/2)); over each interior bulb the samples land on a period-q
limit cycle.

This stage delivers a reusable sampler module plus a contract-conforming CPU
kernel whose 2D top-down projection (attractor density + estimated period per
cell) proves the maths and serves as the testable reference for the later GPU
stage. No renderer changes in this stage.

## Inputs (read these in your own context)

- `docs/INTERFACE.md`
- `src/app/types.ts`
- `src/sims/mandelbrot/kernel.ts` (escape-time reference and param-schema idiom)
- `src/sims/kuramoto-oscillators/model.ts` (model-module-beside-kernel idiom)
- `src/sims/abelian-sandpile/kernel.test.cjs` (test idiom)
- `docs/verification.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/sims/logistic-mandelbrot/model.ts` — pure sampler: given a c-grid
   spec, warmup count, and sample count K, returns typed arrays of attractor
   samples (c-index → K values of Re(z), plus escaped flag and estimated
   period). Deterministic, no DOM, no WebGL.
2. `src/sims/logistic-mandelbrot/kernel.ts` — `SimKernel` implementation
   projecting the sample set top-down into the grid: channel 0 = attractor
   sample density, channel 1 = estimated period (0 for escaped cells).
   `paramSchema` exposes at minimum: warmup iterations, samples K, plotted
   iterations (1..K, drives later cascade animation), and a real-slice-only
   boolean. Include exported `selfTest()`.
3. `src/sims/logistic-mandelbrot/kernel.test.cjs` — asserts at minimum:
   c = 0 yields fixed point 0 (period 1); c = −1 yields the 2-cycle {0, −1};
   c = −1.76 (period-3 window) yields period 3; c = 0.5 escapes; grid output
   dimensions and channel ranges honour the contract.
4. Registry entry in `src/app/registry.ts` (family "Escape-Time Fractals") so the
   kernel is loadable; placeholder subtitle/description acceptable.

## Constraints

- New files under `src/sims/logistic-mandelbrot/` plus the single registry
  entry only. Do not modify the renderer, other sims, or the SimKernel
  contract.
- Sampler must be deterministic for identical params (no Math.random).
- Kernel `init` + first `step` must stay responsive at default grid sizes
  (amortise sampling across steps if needed).
- Do not run `git commit` from the worker phase.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes.
2. `kernel.test.cjs` passes, including the period-1/2/3 and escape assertions
   above, and those assertions genuinely encode the mapped logistic-map
   fixed-point/cycle values.
3. Browser smoke on `/#/logistic-mandelbrot` renders a recognisable Mandelbrot
   silhouette in the density channel with period bands over the bulbs
   (period-2 disc distinct from the main cardioid), not a blank or uniform
   field.
4. Lowering "plotted iterations" from K to 1 visibly collapses the period
   structure (period bands merge), demonstrating the cascade parameter works.
5. No files outside the deliverable list are modified, except this stage card.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- 3D rendering, point clouds, cameras, or any `webglRenderer.ts` change
  (stage 18).
- Ground-plane fractal shading, presets, essay, thumbnail (stage 21).
- Perturbation/deep-zoom techniques.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 25 minutes

## Verifier handoff

Worker returns: files created, `npm run verify` output, chosen default grid /
warmup / K values with a one-paragraph rationale, and browser smoke notes for
acceptance criteria 3–4. Verifier returns `overall: PASS|FAIL`, per-criterion
results, and independently re-derives the c = −1 two-cycle and period-3 window
check against the sampler output.

## Family-specific notes

- Claude worker: do not commit; leave changes uncommitted for orchestrator
  integration.
- Codex/GPT verifier: run tests via `npm run verify` from repo root; do not
  edit worker files, report only.
