# emergence-lab

A repository of canonical emergent-behaviour and complex-adaptive-systems simulations. Each simulation is self-contained: a deterministic kernel, a shared visual front end, and a short essay explaining the dynamics and their significance.

Status: scaffold. No simulations exist yet. The structure, contracts, and starting prompts are in place; the first simulation (Gray-Scott reaction-diffusion) is ready to be built via the starting prompts in `START-PROMPT-codex.md` and `START-PROMPT-cursor.md`.

---

## Stack

- **Vite** with **TypeScript** throughout. A single language keeps the boundary between kernel and renderer clean and type-safe.
- No framework on the front end beyond what Vite provides; Canvas or WebGL for rendering.
- No runtime dependencies in kernel files. Kernels are pure numerics.

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
  CLAUDE.md               # Instructions for Claude sessions in this repo
  MODELS.md               # Model-boundary discipline statement
  START-PROMPT-codex.md   # Ready-to-paste prompt for Codex: first kernel
  START-PROMPT-cursor.md  # Ready-to-paste prompt for Cursor: renderer + gallery
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
