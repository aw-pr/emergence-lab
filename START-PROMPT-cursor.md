# START-PROMPT-cursor.md

Paste the block below into a Cursor session to continue work on emergence-lab.

---

## Task: Full-stack refinement — GPU renderer, kernels, parameters, performance

You are working in the `emergence-lab` repository. You now own the **full
stack**: simulation kernels under `src/sims/**` and the frontend under
`src/app/**`. This is a refinement and acceleration pass, not a rewrite.

The project is a personal emergent-behaviour lab. Favour excellent graphics,
smooth interaction, and room to experiment over minimal showcase polish. Do not
optimise for old browsers. Target current Chrome and Safari on modern Macs.

### Read first

1. `AGENTS.md`
2. `MODELS.md`
3. `docs/INTERFACE.md` — the kernel/renderer contract (Claude-owned)
4. `HANDOFF.md`
5. Existing files under `src/sims/**` and `src/app/**`

### Model boundary

You own and may edit:

```text
src/sims/**     # kernels and kernel tests — numerics, initial conditions, params
src/app/**      # renderer, gallery, controls, presets
```

Do not edit:

```text
docs/INTERFACE.md     # the SimKernel contract — Claude-owned
essays/**
README.md, MODELS.md, CLAUDE.md, AGENTS.md, HANDOFF.md, START-PROMPT-*.md
package.json, package-lock.json, tsconfig*.json
```

You may now change both sides of the `SimKernel` interface's *implementation*,
but the **interface shape itself is still Claude-owned**. If you believe the
`SimKernel` TypeScript interface in `docs/INTERFACE.md` must change (new method,
new field, changed signature), stop and write the proposed change as a note in
your summary instead of editing the contract. Implementation behind the existing
contract is fully yours.

### Goals, in priority order

1. **Quality-first WebGL2/GPU renderer.** Upload kernel `Float32Array` state to
   GPU textures and do colour mapping in shaders. WebGL2 is the required
   baseline. CPU Canvas 2D stays only as a graceful fallback/debug path. An
   optional bounded WebGPU seam is fine but must not destabilise WebGL2. Use
   highp precision where available; avoid colour banding; treat device pixel
   ratio and large canvases deliberately. Grid models stay crisp; continuous /
   trajectory models (Lorenz) stay smooth.

2. **Performance and frame rate.** Decouple simulation steps from render frames.
   Every sim should hold a usable frame rate (target ~60 fps on a modern Mac,
   never below ~30 fps at default settings and default canvas size). Where a
   kernel is the bottleneck, you may move compute onto the GPU (fragment-shader
   or transform-feedback steps) provided `readState()` still returns a correct
   `Float32Array` and the kernel stays deterministic for its tests.

3. **Per-pane performance + graphics bounds.** Every simulation control pane
   must expose, in addition to its sim parameters:
   - **Simulation rate** — steps per rendered frame, with user-settable
     **min and max bounds** and a value slider within them. Pick sane
     per-sim defaults (see Gray-Scott below).
   - **Graphics quality** — an explicit control with **min and max bounds**
     governing render resolution scale / supersampling (e.g. 0.5×–2.0× device
     resolution) so the user can trade sharpness for frame rate.
   These bounds should be part of the control schema so they render
   consistently across the gallery, not hand-wired per sim. Persist the user's
   chosen bounds per sim where it is cheap to do so.

4. **Review every sim's initial conditions and default parameters.** Step
   through all 12 registered sims. For each, confirm the default parameters and
   seeding produce something visibly alive within a few seconds at a usable
   frame rate. Fix defaults that are static, off-screen, too slow to develop,
   or that pin the CPU. Keep presets meaningful and distinct.

### Focus: the diffusion model (Gray-Scott)

Gray-Scott is the priority. Current issues to address in
`src/sims/gray-scott/kernel.ts` and its controls/presets:

- **No steps-per-frame control.** Gray-Scott evolves slowly; one step per
  rendered frame looks nearly frozen. Add a `stepsPerFrame` parameter (default
  ~12–20, min 1, max ~60) and run that many `step()` iterations per frame, like
  the BZ and Lorenz kernels already do. This is the single biggest visible
  improvement.
- **Default regime is dull.** The current defaults sit in a fairly static
  region. Move the default into a lively Pearson regime and ship a richer,
  named preset table. Recommended values (community-standard f/k with this
  repo's Du≈0.2097 / Dv≈0.105 diffusion scaling — keep the 2:1 Du:Dv ratio):

  | Preset | F (feed) | k (kill) | Character |
  |---|---|---|---|
  | Mitosis / solitons | 0.0367 | 0.0649 | self-replicating spots, "cell division" — good default |
  | Coral / fingerprint | 0.0545 | 0.0620 | branching ridges |
  | Worms | 0.0540 | 0.0630 | meandering filaments |
  | Maze / labyrinth | 0.0290 | 0.0570 | space-filling corridors |
  | Spots | 0.0300 | 0.0620 | stable dot lattice |
  | Waves | 0.0140 | 0.0450 | travelling fronts |
  | U-skate (gliders) | 0.0620 | 0.0609 | drifting glider-like structures (narrow, sensitive) |

  Suggested new default: **Mitosis** (F=0.0367, k=0.0649) — it is the most
  immediately rewarding and is robust to small parameter drift.
- **Seeding.** Keep the central seeded patch but add a few smaller off-centre
  Gaussian nuclei (deterministically placed, no `Math.random` in the kernel —
  use a seeded sequence) so structure emerges across the field, not just from
  the centre. Random uniform noise alone does not produce good Gray-Scott
  patterns; clustered Gaussian nuclei do.
- **F/k slider ranges.** Widen/centre the `F` and `k` schema ranges around the
  Pearson region (F roughly 0.01–0.07, k roughly 0.04–0.07, step 0.0005) so
  the interesting band is easy to reach with the slider.
- Keep `Du`/`Dv` ratio guidance in a code comment so future tuning preserves
  stability under explicit Euler integration.

Background references for parameter regimes: Pearson's parameterisation at
MROB Xmorphia (`mrob.com/pub/comp/xmorphia`) and Karl Sims' reaction-diffusion
tutorial (`karlsims.com/rd.html`).

### Desired architecture

- Keep the existing app shell, gallery, routing, controls, presets, and kernel
  loader. Keep `simView.ts` simple.
- Introduce/keep the WebGL2 renderer behind a clean boundary
  (`rendererBackend.ts` / `webglRenderer.ts` / `canvasRenderer.ts` /
  `renderModes.ts` are already scaffolded — build on them, do not fork).
- Normalise using `kernel.channelRanges`; support 1, 2, 3+ channel states.
- Keep fractal pan/zoom and palette cycling working.
- No heavy rendering-engine dependency. Raw WebGL2 or a thin local helper only.

### Verification

```bash
npm run verify
```

This runs typecheck, all kernel tests, and a production build. Kernel tests
under `src/sims/**/kernel.test.cjs` must still pass — if you change kernel
numerics, update the tests in the same change and keep them deterministic.

Manually smoke-test these routes in current Chrome or Safari:

```text
/#/gray-scott
/#/belousov-zhabotinsky
/#/lorenz-attractor
/#/mandelbrot
/#/game-of-life
/#/boids
```

Confirm for each:

- canvas is nonblank and the WebGL2 path is active,
- visible motion/structure within a few seconds at defaults,
- frame rate stays usable (≥30 fps) at default settings,
- the simulation-rate and graphics-quality bound controls work and clamp,
- controls update params, reset works,
- Gray-Scott actually develops patterns (not near-frozen),
- fractal pan/zoom and palette cycling still work,
- grid sims stay crisp, Lorenz stays smooth.

### Do not do yet

- Do not change the `SimKernel` interface shape in `docs/INTERFACE.md` —
  propose it instead.
- Do not rewrite the UI framework or add a rendering engine.
- Do not edit essays, root docs, or package/tsconfig files.
- Do not push to GitHub from Cursor unless explicitly asked. The publish guard
  hooks are armed; route any publish through the workflow in
  `docs/PUBLISH-WORKFLOW.md`.

### Output

Summarise:

- files changed (kernels vs app),
- renderer architecture and how to confirm WebGL2 is active,
- per-sim parameter/init-condition review findings and fixes,
- Gray-Scott changes and new defaults/presets,
- any proposed `SimKernel` interface change (as a note, not an edit),
- verification run and manual routes tested,
- known limitations.
