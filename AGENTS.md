# AGENTS.md — emergence-lab

## Model boundary — read this first

This repository enforces a strict model-boundary discipline. Keep edits inside
the area owned by the model doing the work.

| Area | Lead model | Paths |
|---|---|---|
| Simulation kernels and sim-specific numerics | Codex | `src/sims/**/kernel.ts`, `src/sims/**/kernel.test.cjs` |
| Front end: renderer, controls, gallery UI | Cursor | `src/app/**` |
| Architecture, interface contract, essays, root docs | Claude / Codex coordination | `docs/**`, `essays/**`, root docs and config |

Codex owns:
- `docs/INTERFACE.md` — the TypeScript interface contract between kernels and the renderer
- `essays/**` — one essay per simulation
- Root configuration files, `AGENTS.md`, `README.md`, `MODELS.md`
- Architecture decisions and module interface changes

Cursor owns `src/app/**`. Codex should not edit frontend files directly; give
Cursor a targeted prompt or use Cursor Agent for those changes. Cursor should
not edit kernels or tests under `src/sims/**`.

See `MODELS.md` for the full discipline statement and rationale.

## Current renderer direction

The app currently uses a CPU Canvas 2D renderer in `src/app/renderer.ts`.
The next major frontend task is a Cursor-owned GPU/WebGL renderer rewrite for
better graphics and smoother high-resolution experimentation. Keep the
`SimKernel` contract unchanged unless there is an explicit architecture pass.
See `HANDOFF.md` and `START-PROMPT-cursor.md` before starting that work.

## Interface contract

The kernel-to-renderer contract lives in `docs/INTERFACE.md`. Any change to the `SimKernel` TypeScript interface requires updating that file. Codex implements the interface; Cursor consumes it. Changes must be agreed and committed before either model is given a new prompt that depends on them.

## Adding a simulation

1. Update or confirm `docs/INTERFACE.md` covers the new sim's needs.
2. Draft `START-PROMPT-codex.md` (or a sim-specific variant) for Codex.
3. Write the essay in `essays/<name>.md` once the kernel is working.
4. Coordinate with the Cursor prompt if the gallery needs extending.

## Secrets

Never put secrets, tokens, or API keys in code or committed files. Use `.env.local` (already git-ignored). Remind the user if a prompt asks for credentials inline.

## Related

- `docs/INTERFACE.md` — kernel contract (FINAL v1.0, owned by Codex)
- `MODELS.md` — full model-boundary discipline
- `START-PROMPT-codex.md` — first kernel prompt (Gray-Scott)
- `START-PROMPT-cursor.md` — current Cursor prompt, now focused on WebGL renderer rewrite
- `HANDOFF.md` — current status and next-run brief
