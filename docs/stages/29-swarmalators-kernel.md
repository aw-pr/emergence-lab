# Stage card 29-swarmalators-kernel: Swarmalators — the O'Keeffe–Hong–Strogatz model

## Metadata

- **Authored:** 2026-08-01
- **Orchestrator:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Worker:** Codex GPT-5.3 <codex-gpt-5-3@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** The kernel is well-specified numerical ODE integration
  (given equations, given parameter regions, given closed-form sanity checks)
  with no open design questions — a good fit for a Codex worker. The five
  canonical states and the two-particle equilibrium test carry subtle
  correctness traps (sign conventions, N=2 degeneracy, phase/space decoupling
  at K=0), so a frontier Claude tier cross-family-verifies against the
  literature and the closed-form checks below.

## Objective

Create a new simulation, slug `swarmalators`: N particles in the plane, each
with position x_i ∈ R² and phase θ_i ∈ [0, 2π), coupled by the
O'Keeffe–Hong–Strogatz (OHS) model ("Oscillators that sync and swarm", Nature
Communications, 2017). Position dynamics:

```
dx_i/dt = (1/N) Σ_{j≠i} [ (x_j−x_i)/|x_j−x_i| · (A + J·cos(θ_j−θ_i)) − B·(x_j−x_i)/|x_j−x_i|² ]
```

Phase dynamics:

```
dθ_i/dt = ω_i + (K/N) Σ_{j≠i} sin(θ_j−θ_i)/|x_j−x_i|
```

`A` (self-attraction) and `B` (self-repulsion) set the spatial length scale;
`J` (spatial-phase coupling) and `K` (sync strength) are the parameters whose
sign and magnitude select the model's five canonical collective states:

1. **Static sync** — particles collapse to a static disc, phases fully
   synchronised (uniform colour).
2. **Static async** — static disc, but each particle's phase locks to its
   angular position in the disc (a rainbow ring, incoherent as a whole but
   frozen in space).
3. **Static phase wave** — a static annulus/ring in which phase varies
   continuously around the ring (a colour wave that does not move).
4. **Splintered phase wave** — the ring fragments into rotating or drifting
   clusters, each a shard of a phase wave.
5. **Active phase wave** — the whole formation keeps moving; the phase wave
   itself rotates or drifts continuously and never settles.

`ω_i` is each particle's natural frequency. Default all `ω_i = 0` (identical
oscillators), matching the OHS paper's derivation of the five states above;
expose an optional `frequencySpread` parameter (default 0) that draws `ω_i`
from `[-frequencySpread, frequencySpread]` for a heterogeneous variant, in the
same idiom as `kuramoto-oscillators`' `frequencySpread`.

Distance in both equations is Euclidean, not toroidal — the OHS geometry is
not periodic. Particles are not wrapped at the grid edges.

## Inputs (read these in your own context)

- `docs/INTERFACE.md`
- `src/app/types.ts`
- `src/sims/boids/kernel.ts` (continuous-position particle kernel rasterised
  to a grid; brute-force pairwise force idiom; `seedBoids`/`rasterise` shape)
- `src/sims/boids/kernel.test.cjs` (test idiom)
- `src/sims/kuramoto-oscillators/kernel.ts` and `model.ts` (phase state,
  `frequencySpread`, seeded RNG idiom, `wrapTau`)
- `src/app/colormap.ts` — read `isCyclic`, `twoChannelColour`, and the
  `case "boids"` / `case "kuramoto-oscillators"` branches of
  `defaultColourOptionsFor` only
- `src/app/presets.ts` — read the `boids` and `kuramoto-oscillators` entries
  for the preset shape
- `docs/verification.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/sims/swarmalators/model.ts` — pure integrator: given particle count,
   `A`, `B`, `J`, `K`, `frequencySpread`, a seed, and `dt`, advances
   `x`, `y`, `theta` by one Euler step of the OHS equations above. Brute-force
   O(N²) all-pairs sum (no spatial binning — see Constraints). Deterministic
   given identical inputs; seeded RNG for initial positions/phases/frequencies
   in the `kuramoto-oscillators`/`boids` mulberry32-or-xorshift idiom.
2. `src/sims/swarmalators/kernel.ts` — `SimKernel` implementation.
   `channelCount = 2`: **channel 0 = density** (particle count per cell,
   normalised, brightness), **channel 1 = phase** (θ_i / 2π, hue) — this exact
   ordering is required so the existing `twoChannelColour` cyclic branch in
   `src/app/colormap.ts` (`isCyclic(preset)` → `c1` is hue, `c0` is
   brightness) renders it correctly with zero new colormap code. Rasterise
   particles into the grid the same way `boids.ts`'s `rasterise()` does
   (`floor(x)`, `floor(y)`, accumulate, average). `paramSchema` exposes at
   least: `particleCount`, `A`, `B`, `J`, `K`, `frequencySpread`, `timestep`,
   `seed`. Include exported `selfTest()`.
3. `src/sims/swarmalators/kernel.test.cjs` — asserts at minimum:
   - Metadata: `name`, `channelCount === 2`, `channelLabels`, `channelRanges`,
     and `paramSchema` keys match the kernel.
   - **Two-particle spatial equilibrium (closed form).** With `particleCount:
     2`, `J: 0`, `K` any value, `A: 1`, `B: 2`: for N=2 the position equation
     reduces to a single radial term `A·û − B·û/d` (the `1/N` factor and the
     single neighbour cancel the sum), which is zero exactly at separation
     `d = B/A = 2`. Run enough steps at a small stable `dt` and assert the
     final inter-particle distance converges to `2` within a documented
     tolerance (e.g. ±0.05).
   - **K=0, frequencySpread=0 decouples phase.** With `K: 0`,
     `frequencySpread: 0`, phases are unchanged after any number of steps
     (both terms of `dθ_i/dt` are zero) — assert exact equality (or
     float-equal within `1e-6`) between initial and post-step phases.
   - Grid output dimensions and channel ranges honour the contract (state
     length `= width * height * 2`, values within `channelRanges`).
4. Registry entry in `src/app/registry.ts`, family "Swarm & Flocking"
   (alongside `boids` and `particle-life`), with `name`, `subtitle`,
   `description` matching the repo's existing tone (see neighbouring
   entries).
5. `src/app/presets.ts` — a `swarmalators` entry with exactly five presets,
   one per canonical state named above (`static-sync`, `static-async`,
   `static-phase-wave`, `splintered-phase-wave`, `active-phase-wave` or
   similarly clear ids), each with `J`/`K` (and other params as needed) tuned
   by the worker against the qualitative descriptions above and verified by
   browser smoke check (report in the verifier handoff).
6. `src/app/colormap.ts` — one new `case "swarmalators":` in
   `defaultColourOptionsFor` returning `{ ...base, preset: "phase", ... }`
   (reusing the existing cyclic `phase` ramp; no new ramp or preset needed).
   Tune `contrast`/`gamma` by eye; no other change to this file.

## Constraints

- New files under `src/sims/swarmalators/` plus the registry entry, the
  presets entry, and the single `colormap.ts` case only. Do not modify the
  renderer, other sims, or the `SimKernel` contract.
- Brute-force O(N²) pairwise computation only — no spatial binning or
  neighbour-limit optimisation in this stage (out of scope, see below). Choose
  a conservative default `particleCount` and a maximum (suggested ceiling
  around 1000–1500, since O(N²) at this model's characteristic timestep must
  stay real-time) and justify the choice in the verifier handoff, in the same
  style as stage 17's grid/warmup/K rationale.
- Sampler/integrator must be deterministic for identical params (seeded RNG
  only, no unseeded `Math.random`).
- Distances are Euclidean; do not wrap positions at grid boundaries (no
  `torusDelta`-style periodicity).
- Do not run `git commit`, `git add`, or any git mutation; the dirty working
  tree is the deliverable.
- Use relative paths; never embed absolute home-directory paths.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes.
2. `kernel.test.cjs` passes, including the two-particle equilibrium and
   K=0/frequencySpread=0 phase-invariance assertions above, and those
   assertions genuinely encode the closed-form values stated there (not
   loosened to pass incidentally).
3. Browser smoke on `/#/swarmalators` renders a legible particle swarm, not a
   blank or single-pixel field.
4. Each of the five presets in deliverable 5, when selected, visibly matches
   its named state's qualitative description (static disc vs. moving swarm,
   uniform vs. rainbow vs. wave-around-ring colouring) — report per-preset
   browser smoke notes.
5. Colour comes from the reused cyclic `phase` ramp via the existing
   `twoChannelColour` machinery — no new colormap ramp or preset function was
   added.
6. No files outside the deliverable list are modified, except this stage
   card.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Spatial binning / neighbour-limit performance optimisation for large N
  (follow-up stage if the default proves too slow on typical hardware).
- A dedicated WebGL point-glyph renderer (particles render via the existing
  grid-rasterisation + colormap path, exactly as `boids` and `particle-life`
  do).
- Heterogeneous-frequency exploration beyond the `frequencySpread` knob
  (e.g. non-uniform frequency distributions).
- Essay content and thumbnail generation.
- Pointer interaction (`applyImpulse`).

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 35 minutes

## Verifier handoff

Worker returns: files created, `npm run verify` output, the chosen default
and maximum `particleCount` with a one-paragraph rationale, the five presets'
`J`/`K` values with a one-line note on how each was verified against its
named state, and browser smoke notes for acceptance criteria 3–4. Verifier
returns `overall: PASS|FAIL`, per-criterion results, and independently
re-derives the two-particle `d = B/A` equilibrium and the K=0 phase-invariance
check against the model output.

## Family-specific notes

- Codex worker: headless `codex exec`; do not wait on stdin; do not commit —
  leave changes uncommitted for orchestrator integration.
- Claude verifier: run tests via `npm run verify` from repo root; do not edit
  worker files, report only. Criterion 4 requires visually distinguishing five
  qualitatively different regimes — take screenshots or describe frame-by-frame
  observation per preset rather than asserting from code alone.

---

## Verifier findings (2026-08-01, Claude Fable 5 — round 1)

Worker round 1 is committed on dev as `2cf7a04` (iteration base). Kernel maths
CONFIRMED: closed-form contract tests pass, live run shows correct regime
behaviour per preset, webgl2 clean at ~90fps, no console errors. All five
presets registered and selectable.

**Criteria 3–4 FAIL — the rendering, not the model:**

- Each particle deposits into a single grid cell of the two-channel field, so
  at default resolution the sim reads as 1px specks on a uniform mid-blue
  zero-density background — not the card's "legible discs and rings".
  Confirmed the display Point-size control has no effect on this path.
- Required fix: make particles read as discs — either splat a small radius
  (2–4 cell gaussian/disc) into the density/phase channels, or reduce the
  effective deposit-grid resolution so particles occupy visibly more than one
  cell. Whichever fits the existing renderer contract with the least new
  machinery.
- Also set default display options so the sim is legible out of the box
  (cf. particle-life's factory-defaults precedent: trailFade/pointSize tuned
  in `defaultDisplayOptionsFor`), and check the zero-density background maps
  to a dark tone under "Phase silk (cyclic)" rather than pale blue.
- Do NOT change the model equations, the (J,K) preset values, or anything in
  the frozen contract-test block. Iterate from `2cf7a04`; keep
  `npm run verify` green.
