# AGENTS.md — emergence-lab

## Model boundary — read this first

This repository enforces a strict three-model discipline. Codex's role is **architecture, the interface contract, and essays**. Do not write or edit files outside that scope.

| Area | Lead model | Paths Codex must NOT touch |
|---|---|---|
| Simulation kernels | Codex | `src/sims/**/kernel.ts` and any sim-specific numerics |
| Front end | Cursor | `src/app/**` |

Codex owns:
- `docs/INTERFACE.md` — the TypeScript interface contract between kernels and the renderer
- `essays/**` — one essay per simulation
- Root configuration files, `AGENTS.md`, `README.md`, `MODELS.md`
- Architecture decisions and module interface changes

**Do not create or edit `src/sims/**/kernel.ts` or anything under `src/app/`.** Those files belong to Codex and Cursor respectively. If a change is needed in those areas, describe it clearly so the appropriate model can be given a targeted prompt.

See `MODELS.md` for the full discipline statement and rationale.

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
- `START-PROMPT-cursor.md` — renderer + gallery prompt
