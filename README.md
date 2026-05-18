# emergence-lab

A local lab for playing with emergent behaviour and complex-adaptive-systems
simulations. Each simulation has a deterministic TypeScript kernel behind a
shared interactive renderer.

Status: active prototype. The public branch is clean and publish-ready, but the
project is primarily a personal experimentation space. The next major upgrade
is a Cursor-owned quality-first WebGL2/GPU renderer rewrite for current Chrome
and Safari on modern Macs.

---

## Stack

- **Vite** with **TypeScript** throughout.
- Current renderer: CPU Canvas 2D in `src/app/renderer.ts`.
- Planned renderer: WebGL2/GPU path owned by Cursor, keeping the `SimKernel`
  interface stable if possible. Legacy browser support is not a priority for
  that pass.
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

## Three-model boundary

This repository enforces a strict discipline: each area of the codebase is owned by one lead model. Models do not cross into each other's areas.

| Area | Lead model | Paths |
|---|---|---|
| Simulation kernels | **Codex** | `src/sims/**/kernel.ts` and any sim-specific numerics |
| Front end: renderer, controls, gallery UI | **Cursor** | `src/app/**` |
| Architecture, interface contract, essays | **Claude** | `docs/INTERFACE.md`, `essays/**`, root config, `MODELS.md` |

The contract that binds kernels to the renderer is a TypeScript interface defined in `docs/INTERFACE.md`. Claude owns this file. Codex implements it. Cursor consumes it. No model edits outside its area.

See `MODELS.md` for the full discipline statement.

---

## Repository layout

```
emergence-lab/
  src/
    app/                  # Cursor owns — renderer, gallery, controls
    sims/
      <name>/
        kernel.ts         # Codex owns — deterministic sim kernel
  essays/                 # Claude owns — one .md per sim
  docs/
    INTERFACE.md          # Claude owns — kernel<->renderer contract (TypeScript)
  HANDOFF.md              # Current handoff and next-run brief
  CLAUDE.md               # Instructions for Claude sessions in this repo
  MODELS.md               # Model-boundary discipline statement
  START-PROMPT-codex.md   # Kernel prompt
  START-PROMPT-cursor.md  # Cursor prompt for the WebGL renderer rewrite
```

---

## Adding a new simulation

1. Claude defines or extends the `SimKernel` interface in `docs/INTERFACE.md` if the new sim requires it.
2. Give Codex a prompt scoped to `src/sims/<name>/kernel.ts` only, pointing it at the interface contract.
3. Give Cursor a prompt to extend the gallery and renderer in `src/app/**` to support the new kernel.
4. Claude writes the essay in `essays/<name>.md`.
5. Open a PR. The commit history should show clear authorship separation.

No model ever edits outside its designated area. If a change is needed across areas, it is split into separate prompts for the appropriate model.

---

## Secrets

Never put secrets, tokens, or API keys in code or committed files. Use `.env.local` (git-ignored).

## Publish state

This branch has been squashed to a clean public history. Historical private
work was backed up outside the repo before the public branch was created.
Before pushing to a host, run:

```bash
npm run verify
git rev-list --all --count
```

Expected: tests pass and history is intentionally small. For the full
publish-safety sweep, use the local publish-guard runbook rather than copying
machine-specific patterns into public documentation.
