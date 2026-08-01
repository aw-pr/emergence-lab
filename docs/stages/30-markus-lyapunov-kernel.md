# Stage card 30-markus-lyapunov-kernel: Markus–Lyapunov fractal — alternating logistic-map stability map

## Metadata

- **Authored:** 2026-08-01
- **Orchestrator:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** The kernel is well-specified numerical work (a known
  closed-form Lyapunov exponent per pixel, two exact analytic test cases given
  below) that reuses most of the existing escape-time fractal plumbing — a
  good fit for a Codex worker. The stability-sign colour split and the two
  closed-form Lyapunov values (ln 0.5, ln 2) are easy to get subtly wrong
  (off-by-one in warmup/sample split, wrong derivative term), so a frontier
  Claude tier cross-family-verifies against the closed forms and the
  literature.

## Objective

Create a new simulation, slug `markus-lyapunov`: the Markus–Lyapunov fractal.
For each pixel, treat its position as a pair `(a, b)` in the plane (canonical
range roughly `a, b ∈ [2, 4]`, the classic "Zircon Zity" window of the
logistic map's chaotic regime). Iterate the logistic map

```
x ← r·x·(1 − x)
```

where `r` alternates between `a` and `b` according to a periodic sequence
(e.g. `"AB"`, `"AABAB"`) — the sequence selects, at each step, whether
`r = a` or `r = b`. After a transient warmup (discarded, default e.g. 200
iterations), accumulate the Lyapunov exponent over the next `n` iterations
(default e.g. 500):

```
λ = (1/n) Σ log|d/dx[r_k·x_k·(1 − x_k)]| = (1/n) Σ log|r_k·(1 − 2·x_k)|
```

`λ < 0` means the alternating orbit is stable (converges to a fixed point or
periodic cycle at that `(a, b)`); `λ > 0` means it is chaotic. Colour must
make the sign legible at a glance: `λ < 0` on a classic yellow/brown
("stable") ramp, `λ > 0` on a blue-toward-black ("chaotic") ramp, with the
`λ = 0` boundary between them clearly visible.

## What's reusable vs. new (read before starting)

**Reusable as-is** from `src/sims/fractal/detail.ts`:
`effectiveIterationLimit`, `MAX_FRACTAL_ZOOM`, `MAX_BASE_ITERATIONS` — these
are already parameter-grid-generic (adaptive iteration count vs. zoom), not
Mandelbrot-specific. Use them for the `(a, b)`-plane pan/zoom exactly as
`mandelbrot/kernel.ts` uses them for the `c`-plane.

**Reusable as an idiom, not as code:** the `centerX`/`centerY`/`zoom`
`paramSchema` triple and the per-pixel `computeBase()` → cache →
`writeStateFromBase()` split from `src/sims/mandelbrot/kernel.ts`
(`palettePhase`/`cycleSpeed` are optional — only add them if a palette-cycle
animation makes sense for a signed stability map; if in doubt, omit them and
say so in the verifier handoff).

**Not reusable:** `isInMandelbrotMainBodies` (an interior short-circuit
specific to the Mandelbrot cardioid/bulb geometry — there is no analogous
cheap interior test here; every pixel must actually be iterated).

**Explicitly out of scope for this stage** (see Out of scope): wiring this
sim into `FRACTAL_SLUGS` / `FractalSlug` / `complexAtPoint` in
`src/app/fractalCanvas.ts` and `src/app/fractalView.ts` for interactive
drag-to-pan and scroll-to-zoom. Those are shared files touching all three
existing 2D fractal sims and are a follow-up stage, exactly as
`logistic-mandelbrot`'s interactive 3D camera was split into its own later
stage (18–19) after the kernel stage (17). This stage's `centerX`/`centerY`/
`zoom` are plain numeric slider params, functional but not gesture-driven.

## Inputs (read these in your own context)

- `docs/INTERFACE.md`
- `src/app/types.ts`
- `src/sims/fractal/detail.ts`
- `src/sims/mandelbrot/kernel.ts` (pan/zoom param idiom, per-pixel compute
  loop, escape-time kernel shape)
- `src/sims/logistic-mandelbrot/kernel.test.cjs` (test idiom for a
  fractal-family sim with closed-form assertions)
- `src/app/colormap.ts` — read `RAMPS`, `rampColour`, `twoChannelColour`, the
  `sand` and `chemical` two-channel cases specifically (composite-ramp
  precedent), and the `case "mandelbrot"` / `case "burning-ship"` branches of
  `defaultColourOptionsFor`
- `docs/verification.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/sims/markus-lyapunov/model.ts` — pure sampler: given a grid spec
   (`centerX`, `centerY`, `zoom`, following the `mandelbrot` convention where
   `centerX`/`centerY` address the `(a, b)` plane), a sequence (see param note
   below), warmup count, and sample count `n`, returns a Float32Array of `λ`
   per grid cell using the formula above. Deterministic, no DOM, no WebGL.
2. `src/sims/markus-lyapunov/kernel.ts` — `SimKernel` implementation.
   **`channelCount = 2`**: channel 0 = stability magnitude
   (`max(0, −λ)`, clamped to a documented ceiling, zero when chaotic), channel
   1 = chaos magnitude (`max(0, λ)`, clamped to a documented ceiling, zero
   when stable). This two-channel split (rather than one signed channel) lets
   the colour mapper treat the two regimes as genuinely distinct ramps with an
   exact `λ = 0` boundary, in the same spirit as the existing `sand` and
   `chemical` two-channel composites in `colormap.ts` (read those before
   designing this). `paramSchema` exposes at minimum: `centerX`, `centerY`,
   `zoom`, `warmupIterations`, `sampleIterations`, and `sequence`. **Note:**
   `ParamDescriptor` has no free-text string type — `sequence` must be an
   `enum` with a curated set of options (e.g. `"AB"`, `"AABB"`, `"AABAB"`,
   `"AAB"`, `"ABB"`, `"AAAABBBBBB"` — worker's choice of a sensible curated
   list covering at least one short alternation and one longer/asymmetric
   one). Include exported `selfTest()`.
3. `src/app/colormap.ts` — one new named preset (e.g. `"lyapunov"`) added to
   `ColourPreset`, `COLOUR_PRESETS`, and handled inside `twoChannelColour`:
   stable channel (channel 0) renders on a yellow/brown ramp (reuse the
   existing `amber` ramp via `rampColour("amber", ...)` — do not invent a new
   ramp for this half), chaotic channel (channel 1) renders on a
   blue-toward-black ramp (reuse the existing `ice` ramp similarly, or a new
   ramp stop set if `ice`'s bright endpoint reads wrong here — worker's
   judgement, document the choice). One new `case "markus-lyapunov":` in
   `defaultColourOptionsFor` selecting this preset.
4. `src/sims/markus-lyapunov/kernel.test.cjs` — asserts at minimum:
   - Metadata: `name`, `channelCount === 2`, `channelLabels`, `channelRanges`,
     `paramSchema` keys match the kernel.
   - **Closed-form stable point.** At `a = b = 0.5` (sequence irrelevant when
     `a = b`), the logistic map has fixed point `x* = 0` with derivative
     `r(1 − 2x*) = 0.5` there, so with enough warmup `λ → ln(0.5) ≈
     −0.6931`. Assert the computed `λ` at that grid point is within a
     documented tolerance (e.g. ±0.01) of `ln(0.5)`.
   - **Closed-form chaotic point.** At `a = b = 4`, the fully chaotic logistic
     map has the well-known exact Lyapunov exponent `λ = ln(2) ≈ 0.6931`.
     Assert the computed `λ` at that grid point is within a documented, wider
     tolerance (e.g. ±0.05, finite-`n` variance) of `ln(2)`.
   - **Sequence sensitivity.** At an `(a, b)` point with `a ≠ b` inside the
     alternating regime, two different sequences (e.g. `"AB"` vs. `"AABB"`)
     produce measurably different `λ` values — assert they differ by more
     than a small epsilon, demonstrating the sequence parameter actually
     threads through the computation.
   - Grid output dimensions and channel ranges honour the contract.
5. Registry entry in `src/app/registry.ts`, family "Escape-Time Fractals"
   (alongside `mandelbrot`, `julia-set`, `burning-ship`, `logistic-mandelbrot`),
   with `name`, `subtitle`, `description` matching the repo's existing tone.
6. `src/app/presets.ts` — a `markus-lyapunov` entry with at least two presets:
   one centred on the classic `a, b ∈ [2, 4]` "Zircon Zity" view with an
   alternating sequence, and one zoomed into a visually striking
   stable/chaotic boundary region.

## Constraints

- New files under `src/sims/markus-lyapunov/` plus the registry entry, the
  presets entry, and the `colormap.ts` additions in deliverable 3 only. Do
  not modify the renderer, other sims, the `SimKernel` contract, or
  `src/app/fractalCanvas.ts` / `src/app/fractalView.ts` (see Out of scope).
- Sampler must be deterministic for identical params (no `Math.random`).
- Clamp `λ`'s two derived channels to documented finite ceilings — the raw
  exponent is unbounded below near superstable points (`log(0)` singularity)
  and must not produce `NaN`/`Infinity` in `channelRanges`.
- Kernel `init` + first `step` must stay responsive at default grid sizes; if
  full recomputation per param change is too slow at high `sampleIterations`,
  follow the `mandelbrot` cache-and-recompute-only-on-init pattern rather than
  recomputing every frame.
- Do not run `git commit`, `git add`, or any git mutation; the dirty working
  tree is the deliverable.
- Use relative paths; never embed absolute home-directory paths.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes.
2. `kernel.test.cjs` passes, including the `ln(0.5)`, `ln(2)`, and
   sequence-sensitivity assertions above, and those assertions genuinely
   encode the closed-form values stated there.
3. Browser smoke on `/#/markus-lyapunov` renders a recognisable
   Markus–Lyapunov fractal (a stable/chaotic boundary shape, not a blank or
   uniform field) with the classic `a, b ∈ [2, 4]` preset.
4. Stable regions (`λ < 0`) render on the yellow/brown ramp and chaotic
   regions (`λ > 0`) render on the blue/black ramp, with a visually legible
   boundary at `λ = 0` — report a screenshot or frame description in the
   verifier handoff.
5. Switching the `sequence` param visibly changes the fractal's shape (not
   just its colour), demonstrating the alternation is genuinely per-step and
   not collapsed to a single effective `r`.
6. No files outside the deliverable list are modified, except this stage
   card.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Interactive drag-to-pan / scroll-to-zoom (wiring into `FRACTAL_SLUGS`,
  `FractalSlug`, `complexAtPoint` in `src/app/fractalCanvas.ts` /
  `src/app/fractalView.ts`) — plain numeric sliders only, this stage.
- Palette-phase cycling animation (`palettePhase`/`cycleSpeed`), unless the
  worker judges it clearly adds value for a signed stability map — optional,
  not required for acceptance.
- Deep-zoom / perturbation techniques.
- Free-text sequence entry (not expressible via `ParamDescriptor`; curated
  enum only, see deliverable 2).
- Essay content and thumbnail generation.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 30 minutes

## Verifier handoff

Worker returns: files created, `npm run verify` output, the computed `λ`
values for the two closed-form test points with the tolerances used, the
chosen channel clamp ceilings with a one-paragraph rationale, the curated
sequence enum list, and browser smoke notes for acceptance criteria 3–5.
Verifier returns `overall: PASS|FAIL`, per-criterion results, and
independently re-derives the `ln(0.5)` and `ln(2)` closed forms against the
model output.

## Family-specific notes

- Codex worker: headless `codex exec`; do not wait on stdin; do not commit —
  leave changes uncommitted for orchestrator integration.
- Claude verifier: run tests via `npm run verify` from repo root; do not edit
  worker files, report only. Criterion 4 requires visually confirming a
  colour-sign split, not just that `channelRanges` are non-degenerate —
  inspect actual rendered pixels at known stable and chaotic points.
