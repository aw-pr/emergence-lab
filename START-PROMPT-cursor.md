# START-PROMPT-cursor.md

Paste the block below into a Cursor session when continuing the renderer work.

---

## Task: Quality-first WebGL/GPU renderer rewrite for emergence-lab

You are working in the `emergence-lab` repository. Your task is strictly scoped
to the frontend under `src/app/**`.

The project is a personal emergent-behaviour lab. Favour excellent graphics,
smooth interaction, and room to experiment over minimal showcase polish. Do not
optimise for old browsers. Target current Chrome and Safari on modern Macs.

### Read first

1. `AGENTS.md`
2. `MODELS.md`
3. `docs/INTERFACE.md`
4. `HANDOFF.md`
5. Existing frontend files under `src/app/**`

### Model boundary

You own:

```text
src/app/**
```

Do not edit:

```text
src/sims/**
docs/INTERFACE.md
package.json
package-lock.json
root docs
```

If you believe the `SimKernel` interface needs to change, stop and write the
proposed change as a note instead of editing the contract.

### Current state

The app currently uses a CPU Canvas 2D renderer in `src/app/renderer.ts`.
Kernels expose state as `Float32Array` through the stable `SimKernel` contract:

- `init(width, height, params)`
- `step(dt)`
- `readState()`
- `channelCount`
- `channelRanges`
- `channelLabels`
- `paramSchema`
- `destroy()`

There are 12 simulations registered in `src/app/registry.ts`.

### Goal

Replace or parallelise the CPU Canvas 2D renderer with a quality-first GPU
renderer that gives better visuals and smoother high-resolution rendering while
keeping the kernel contract stable.

This is a renderer rewrite, not a simulation rewrite. Kernels still compute
their own state. The renderer should upload `Float32Array` state to the GPU and
map it to pixels with shader-based colour mapping where practical.

Prefer the best modern web graphics path for current Chrome and Safari:

1. Use **WebGL2** as the required baseline renderer. Do not spend effort on
   WebGL1 or legacy browser support.
2. If it is clean and bounded, optionally add a **WebGPU experimental path** or
   a feature-detection seam for one. Do not let WebGPU exploration destabilise
   the WebGL2 implementation.
3. Keep CPU Canvas 2D only as a graceful fallback or debug path, not as the
   quality target.

### Desired architecture

- Keep the existing app shell, gallery, routing, controls, presets, and kernel
  loader.
- Introduce a WebGL2 renderer implementation behind a clean boundary.
- Preserve the existing `Renderer` public behaviour where possible so
  `simView.ts` does not become complicated.
- Keep CPU Canvas 2D as a fallback if WebGL2 is unavailable.
- Avoid per-simulation rendering branches except where there is a clear visual
  mode distinction such as smooth trajectory fields versus pixel-grid fields.
- Continue to normalise using `kernel.channelRanges`.
- Continue to support 1, 2, 3+ channel states.
- Keep fractal zoom/pan and colour cycling working.
- Keep the Lorenz attractor smooth and continuous-looking.
- Use highp shader precision where available and avoid visible banding in colour
  ramps.
- Treat device pixel ratio and large canvases deliberately. Prioritise quality
  on current Mac hardware over old-device compatibility.

### Visual priorities

- Higher effective resolution and less fuzz on large screens.
- Smooth shader colour ramps and palette controls.
- Crisp pixel-grid rendering for cellular automata and lattice models.
- Smooth rendering for continuous/trajectory models such as Lorenz.
- Avoid giant blocky pixels unless a user explicitly chooses that look.
- Latest Chrome and Safari are the target browsers. Compatibility with older
  browsers is not a goal for this pass.

### Verification

Run:

```bash
npm run verify
```

Also manually smoke-test these routes in the browser:

```text
/#/lorenz-attractor
/#/mandelbrot
/#/diffusion-limited-aggregation
/#/game-of-life
/#/boids
```

Check that:

- the canvas is nonblank,
- the WebGL2 path is actually active in current Chrome or Safari,
- controls still update params,
- reset still works,
- FPS is acceptable,
- fractal pan/zoom still works,
- Lorenz renders as smooth curves rather than chunky dots,
- grid/cell simulations remain crisp.

### Do not do yet

- Do not move simulation logic into `src/app/**`.
- Do not change kernel files.
- Do not rewrite the UI framework.
- Do not add heavy dependencies unless the payoff is clear. Raw WebGL2 or a very
  thin local helper is preferred over a full rendering engine.
- Do not push to GitHub from Cursor unless explicitly asked.

### Output

Summarise:

- files changed,
- renderer architecture chosen,
- how to confirm WebGL2 is active,
- known limitations,
- verification run,
- manual routes tested.
