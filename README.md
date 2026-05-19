# emergence-lab

A local lab for playing with emergent behaviour and complex-adaptive-systems
simulations. Each simulation has a deterministic TypeScript kernel behind a
shared interactive renderer.

Status: active prototype with a solid set of working simulations. The public
branch is clean and publish-ready, but the project is primarily a personal
experimentation space. The current pass is a Cursor-owned full-stack refinement:
quality-first WebGL2/GPU renderer for current Chrome and Safari on modern Macs,
decoupled sim/render rates, per-pane performance and graphics-quality bounds,
and tuned initial conditions across every sim (diffusion model first).

---

## Stack

- **Vite** with **TypeScript** throughout.
- Renderer: moving to a quality-first WebGL2/GPU path with CPU Canvas 2D kept
  as a fallback/debug path. Legacy browser support is not a priority.
- No runtime dependencies in kernel files. Kernels are deterministic numerics.

---

## Run it

```bash
npm install
npm run dev
```

Open the local URL Vite prints, normally `http://localhost:5173/`.

Useful checks:

```bash
npm run verify
npm test
npm run build
```

`npm run verify` runs TypeScript checks, all kernel tests, and a production
build.

---

## Simulations

The current gallery includes:

- Gray-Scott reaction diffusion
- Abelian sandpile
- Game of Life
- Belousov-Zhabotinsky reaction waves
- Boids
- Lorenz attractor
- Diffusion-limited aggregation
- Elementary cellular automata
- Brian's Brain
- Mandelbrot
- Julia set
- Burning Ship

---

## Model boundary

This repository enforces a strict discipline: each area of the codebase is owned by one lead model. Models do not cross into each other's areas.

| Area | Lead model | Paths |
|---|---|---|
| Full stack: kernels, renderer, controls, gallery, presets, performance | **Cursor** | `src/**` |
| Architecture, interface contract, essays | **Claude** | `docs/INTERFACE.md`, `essays/**`, root config, `MODELS.md` |

Cursor refines kernels and the renderer together so GPU acceleration and
numerics can be co-designed. The contract that binds kernels to the renderer is
a TypeScript interface defined in `docs/INTERFACE.md` — Claude owns this file;
Cursor implements and consumes it but does not change its shape. This is a
deliberate change from an earlier three-model split (Codex's kernel role has
been retired).

See `MODELS.md` for the full discipline statement.

---

## Repository layout

```
emergence-lab/
  src/                    # Cursor owns — full stack
    app/                  #   renderer, gallery, controls, presets
    sims/<name>/
      kernel.ts           #   deterministic sim kernel
  essays/                 # Claude owns — one .md per sim
  docs/
    INTERFACE.md          # Claude owns — kernel<->renderer contract (TypeScript)
    PUBLISH-WORKFLOW.md   # Publish-safety workflow and guard hooks
  HANDOFF.md              # Current handoff and next-run brief
  CLAUDE.md               # Instructions for Claude sessions in this repo
  MODELS.md               # Model-boundary discipline statement
  START-PROMPT-cursor.md  # Current full-stack Cursor prompt
```

---

## Adding a new simulation

1. Claude defines or extends the `SimKernel` interface in `docs/INTERFACE.md` if the new sim requires it.
2. Give Cursor a prompt to add the kernel under `src/sims/<name>/` and wire the gallery/renderer in `src/app/**`.
3. Claude writes the essay in `essays/<name>.md`.

Claude never edits under `src/**`; Cursor never edits the interface contract,
essays, or root docs. Cross-area changes are split into separate prompts.

---

## Secrets

Never put secrets, tokens, or API keys in code or committed files. Use `.env.local` (git-ignored).

## Publish state

This branch has been squashed to a clean public history (5 commits). Historical
private work was backed up outside the repo before the public branch was
created. Publish-guard git hooks are armed (`pre-commit` blocks personal/secret
patterns; `pre-push` keeps non-public branches off the public remote). The full
workflow, including the one-time remote setup, is in
[`docs/PUBLISH-WORKFLOW.md`](docs/PUBLISH-WORKFLOW.md).

Before pushing to a host, run:

```bash
npm run verify
git rev-list --all --count
```

Expected: tests pass and history is intentionally small.
