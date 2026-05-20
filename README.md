# emergence-lab

A local lab for playing with emergent behaviour and complex-adaptive-systems
simulations. Each simulation has a deterministic TypeScript kernel behind a
shared interactive renderer.

Status: active prototype with a solid set of working simulations. The public
branch is clean and publish-ready, but the project is primarily a personal
experimentation space. The current phase is **hone**: refinement, parameter
tuning, performance, and UX polish — including a quality-first WebGL2/GPU
renderer for current Chrome and Safari on modern Macs, decoupled sim/render
rates, per-pane performance and graphics-quality bounds, and tuned initial
conditions across every sim. The diffusion model (Gray-Scott) is the priority
kernel.

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

emergence-lab is in the **hone phase** — refinement on a working set of sims.
The code trunk is single-lead.

| Area | Lead model | Paths |
|---|---|---|
| Code: kernels, renderer, controls, gallery, presets, performance | **Codex** | `src/**` |
| Architecture, interface contract, essays, root directives | **Claude** | `docs/INTERFACE.md`, `essays/**`, root directive docs |

Codex owns the whole code trunk so numerics and rendering can be co-designed.
Claude maintains the `SimKernel` contract in `docs/INTERFACE.md`, the per-sim
essays, and the root directive documents. Cross-model comparison happens only
in a separate benchmark repo, never on this trunk.

See `MODELS.md` for the full discipline statement.

---

## Repository layout

```
emergence-lab/
  src/                    # Codex owns — full code stack
    app/                  #   renderer, gallery, controls, presets
    sims/<name>/
      kernel.ts           #   deterministic sim kernel
  essays/                 # Claude owns — one .md per sim
  docs/
    INTERFACE.md          # Claude owns — kernel<->renderer contract (TypeScript)
    PUBLISH-WORKFLOW.md   # Publish-safety workflow and guard hooks
  HANDOFF.md              # Current handoff and next-run brief
  CLAUDE.md               # Instructions for Claude sessions in this repo
  AGENTS.md               # General agent-guidance for this repo
  MODELS.md               # Model-boundary discipline statement
```

---

## Adding a new simulation

1. Claude defines or extends the `SimKernel` interface in `docs/INTERFACE.md`
   if the new sim requires it.
2. Codex adds the kernel under `src/sims/<name>/` and wires the gallery /
   renderer in `src/app/**`.
3. Claude writes the essay in `essays/<name>.md`.

Code lives under Codex; architecture, interface contract, essays, and root
directives live under Claude.

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
