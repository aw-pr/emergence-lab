# START-PROMPT-cursor.md

Paste the block below into a Cursor session when continuing the renderer work.

---

## Task: WebGL/GPU renderer rewrite for emergence-lab

You are working in the `emergence-lab` repository. Your task is strictly scoped
to the frontend under `src/app/**`.

The project is a personal emergent-behaviour lab. Favour excellent graphics,
smooth interaction, and room to experiment over minimal showcase polish.

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

Replace or parallelise the CPU Canvas 2D renderer with a WebGL/GPU renderer
that gives better visuals and smoother high-resolution rendering while keeping
the kernel contract stable.

This is a renderer rewrite, not a simulation rewrite. Kernels still compute
their own state. The renderer should upload `Float32Array` state to the GPU and
map it to pixels with shader-based colour mapping where practical.

### Desired architecture

- Keep the existing app shell, gallery, routing, controls, presets, and kernel
  loader.
- Introduce a WebGL renderer implementation behind a clean boundary.
- Preserve the existing `Renderer` public behaviour where possible so
  `simView.ts` does not become complicated.
- Keep CPU Canvas 2D as a fallback if WebGL is unavailable.
- Avoid per-simulation rendering branches except where there is a clear visual
  mode distinction such as smooth trajectory fields versus pixel-grid fields.
- Continue to normalise using `kernel.channelRanges`.
- Continue to support 1, 2, 3+ channel states.
- Keep fractal zoom/pan and colour cycling working.
- Keep the Lorenz attractor smooth and continuous-looking.

### Visual priorities

- Higher effective resolution and less fuzz on large screens.
- Smooth colour ramps and palette controls.
- Crisp pixel-grid rendering for cellular automata and lattice models.
- Smooth rendering for continuous/trajectory models such as Lorenz.
- Avoid giant blocky pixels unless a user explicitly chooses that look.

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
- Do not add heavy dependencies unless the payoff is clear.
- Do not push to GitHub from Cursor unless explicitly asked.

### Output

Summarise:

- files changed,
- renderer architecture chosen,
- known limitations,
- verification run,
- manual routes tested.
