# Stage card 35-logistic-mandelbrot-gpu-sampler: compute the orbit point cloud in a fragment shader

## Metadata

- **Authored:** 2026-08-14
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Pairing rationale:** The defect mode here is a cloud that renders and looks
  broadly right while being quietly wrong at bulb boundaries — precisely what a
  worker reviewing its own output will pass. So the roles are split by
  capability, not just by family: the codex worker is sandboxed and *cannot*
  run WebGL, which makes it structurally unable to self-verify, exactly as the
  contract's sandbox-as-role-boundary property intends. The Claude verifier
  gets `Requires GUI` and is the only role that ever executes the shader. That
  asymmetry is the point of this pairing, not an accident of it.
- **Verifier transport:** cli.

## Depends on

**Stage 34 must have completed with a go or go-with-mitigation recommendation.**
Read `docs/spikes/2026-08-14-fp32-orbit-precision.md` before starting. Its
recommended tolerances are the acceptance thresholds below — this card
deliberately does not restate them, because a copy would drift from the
measurement. If stage 34 recommended a mitigation, implement that mitigation;
it is part of this stage's scope, not an optional extra.

If stage 34 said no-go, stop and report that rather than proceeding.

## Objective

Move orbit sampling for the logistic-Mandelbrot point cloud off the CPU and
into a WebGL2 fragment shader, so a cloud can be built in a frame or two
instead of tens of seconds, without the prebaked ELPC file.

The CPU sampler stays. It remains the reference implementation, the parity
oracle, and the fallback. This stage adds a path; it does not remove one.

## Background you need

The orbit is the **complex quadratic map `z -> z^2 + c`**
(`src/sims/logistic-mandelbrot/model.ts:154-158`), the ordinary Mandelbrot
recurrence. The "logistic" in the sim's name describes what the reveal plots —
attractor samples arranged so the period-doubling cascade reads like a logistic
bifurcation diagram — not the map being iterated. Implement `z^2 + c`.

The current build is CPU and time-sliced: `rebuild()` (`orbit3d.ts:1008`)
allocates the point arrays, then `buildSlice()` (`orbit3d.ts:1112`) walks cells
under an 8ms budget (`BUILD_SLICE_MS`, `orbit3d.ts:378`), re-arming itself via
`setTimeout` (`orbit3d.ts:1167`, `:1221`) and calling `sampleAttractorCell` per
cell (`orbit3d.ts:1126`, `:1194`). At the `extreme` preset that is 1920x1920
cells (`resolutionPreset.ts:26`), which is the tens of seconds the prebake
exists to avoid.

Note the two call sites: there is a base sweep and a cascade-tail refinement
pass. Both need covering, or the refined detail silently disappears.

## Inputs (read these in your own context)

- src/app/orbit3d.ts — `rebuild()` from line 1008 to roughly 1230, the
  `applyPrebaked()` path at 982, `setPlottedIterations()` at 935, and the
  point-array layout at 1073-1077
- src/sims/logistic-mandelbrot/model.ts — `sampleAttractorCell` (130),
  `estimatePeriod` (97), `cellCoordinate` (80), and the constants at 17-48
- src/app/webglRenderer.ts — `supportsOrbit3d()` and `supportsDirectRendering()`
  around lines 1342-1356, and the `EXT_color_buffer_float` probe at 1273
- docs/spikes/2026-08-14-fp32-orbit-precision.md — stage 34's findings
- docs/INTERFACE.md — the `SimKernel` contract, sections on `step()` and
  `readState()`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A GPU sampling path that, for a grid of c-cells, computes warmup iterations,
   emits `sampleCount` attractor samples per surviving cell, and detects the
   period — writing to float render targets rather than to CPU arrays. Put the
   new GLSL and its host code in a **new file** (suggested
   `src/app/orbitSampler.ts`) rather than growing `orbit3d.ts`, which is
   already 1842 lines.
2. Wiring in `orbit3d.ts` so `rebuild()` uses the GPU path when available and
   falls back to the existing time-sliced CPU sweep when not. Cover **both**
   the base sweep and the cascade-tail refinement.
3. A capability gate consistent with the file's existing style: the GPU path
   requires WebGL2 and `EXT_color_buffer_float`, exactly as the Kuramoto path
   and the accumulation target already do. Missing either must fall back
   silently and correctly, not throw.
4. Expose which path ran through the existing `canvas.dataset` convention that
   `webglRenderer.ts:1490-1500` already uses (`orbit3d-fallback-field`,
   `cpu-kernel`). Add a value distinguishing GPU-sampled from CPU-sampled
   clouds. Stage 36's tests and the verifier both need to assert on this, and
   an unobservable fallback is one that silently rots.

## Constraints

- **Do not remove, bypass, or regress the CPU sampler.** It is the parity
  oracle for stage 36 and the fallback for machines without float targets.
- **Do not change `src/sims/logistic-mandelbrot/model.ts`.** It is the
  reference implementation. If the GPU disagrees with it, the GPU is wrong.
  This also protects `scripts/bake-orbit3d.mjs`, which consumes it.
- **Do not change the ELPC format, the baker, or `applyPrebaked()`.** A
  prebaked cloud must still load and still take precedence where present.
- Do not change the `SimKernel` interface. `docs/INTERFACE.md` is a versioned
  boundary; a shape change is a separate decision with its own commit, and
  this stage is not it.
- Do not touch `src/app/renderModes.ts`, quality profiles, or resolution
  presets.
- Respect the fixed point budget: cells x samples is a budget, not a target
  (`kernel.ts:45-50`). Going faster must not silently inflate the cloud.
- Mind the early-exit divergence stage 34 measured. GPU lanes run in lockstep,
  so a per-invocation `break` saves nothing unless the whole warp breaks. Do
  not assume the CPU's Brent-style exit transfers; implement what the spike's
  numbers actually support.
- No new runtime dependencies.
- Nothing on the `feat/logistic-mandelbrot-hybrid-surface` branch is in scope
  or is a valid reference. It is a parked, visually-rejected experiment that
  rewrites these same internals; do not import from it or reconcile with it.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` green (typecheck + kernel tests + production build).
2. `src/sims/logistic-mandelbrot/model.ts`, `scripts/bake-orbit3d.mjs`, and
   `src/app/renderModes.ts` are unchanged — confirm by diff, explicitly.
3. **Parity with the CPU sampler, executed not reasoned about.** Run both paths
   over the same seeded c-cells and compare. Sampled values must agree within
   stage 34's recommended value tolerance, and the fraction of cells whose
   detected period differs must be at or under stage 34's recommended maximum.
   Report the boundary-band figure separately from the global one; boundaries
   are where this fails first. State the actual numbers you measured.
4. **Visual check, with the browser you have been granted.** Load the
   logistic-mandelbrot route, let a GPU-sampled cloud build, and compare
   against a CPU-sampled one at the same params and camera. The bifurcation
   cascade must remain legible and bulb boundaries must not be visibly
   smeared, doubled, or eaten. Capture screenshots of both into the e2e
   screenshot directory and say plainly which you judged and how. This
   criterion is the reason this pairing exists — do not reduce it to a
   numerical check that criterion 3 already covers.
5. The prebaked ELPC path still loads and still wins where a bake is present.
   Verify against the machine-local bake if one exists; if none does, say so
   rather than claiming a pass you could not observe.
6. Fallback works: with the GPU path disabled or its extension unavailable, the
   cloud still builds via the CPU sweep and the sim remains usable. Exercise
   this, do not assume it from reading the gate.
7. The `canvas.dataset` value correctly reports which path ran, in all of:
   GPU-sampled, CPU-sampled, prebaked, and the `orbit3d-fallback-field` case.
8. Both the base sweep and the cascade-tail refinement go through the GPU path.
   A GPU base sweep with a still-CPU refinement pass is an incomplete stage —
   check the second call site explicitly.
9. Build time measurably improves at the `extreme` preset. State before and
   after figures. A GPU path that is not faster has no reason to exist.
10. No regression to Kuramoto's GPU path, the three GPU fractals, or the
    orbit3d camera and marker-drag behaviour, all of which share this
    renderer. Spot check each.

## Contract test

- **Test file:** None required at this stage; stage 36 owns the frozen parity
  harness. If you add assertions here, put them beside the existing kernel
  tests and expect stage 36 to absorb them.
- **Assertions digest:** None

## Out of scope

- Deleting or deprecating the CPU sampler, or the prebake pipeline.
- The ELPC format, the baker, or the bake manifest.
- Markus–Lyapunov, or any other sim's GPU path.
- `SimKernel` interface changes.
- Quality profiles, resolution presets, render mode selection.
- Any push, publish-branch, or merge work.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 75 minutes

## Verifier handoff

Worker reports: the shader's warmup/sample/period strategy and how it handles
the lockstep divergence problem; which stage-34 mitigation was implemented, if
any; how the capability gate is structured and what happens on each failure
path; the exact `canvas.dataset` values emitted for each of the four cases;
how both the base sweep and the refinement pass were covered; measured build
times before and after at the `extreme` preset; and the parity figures the
worker obtained, with the explicit caveat that the worker could not run the
shader itself and so those figures are predictions for the verifier to check,
not measurements.

## Family-specific notes

Codex worker: stdin is redirected from `/dev/null` by the dispatch wrapper.
The worker cannot execute WebGL — its sandbox aborts every browser at
NSApplication init. This is deliberate and is the role boundary; the worker
must write the shader without running it and must not claim to have verified
its output. `Requires GUI: true` on this card is for the Claude verifier,
which is the only role that executes the shader.
