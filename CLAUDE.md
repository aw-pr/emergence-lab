# CLAUDE.md — emergence-lab

## Model boundary — read this first

This repository enforces a strict model-boundary discipline. Claude's role is
architecture, interface-contract stewardship, essays, and root documentation.
Do not write or edit files outside that scope.

| Area | Lead model | Paths |
|---|---|---|
| Full stack: kernels, renderer, controls, gallery, presets, performance | Cursor | `src/**` |
| Architecture, interface contract, essays, root docs | Claude | `docs/INTERFACE.md`, `essays/**`, root docs and config |

Claude owns:
- `docs/INTERFACE.md` — the TypeScript interface contract between kernels and the renderer
- `essays/**` — one essay per simulation
- Root configuration files, `CLAUDE.md`, `AGENTS.md`, `README.md`, `MODELS.md`, `HANDOFF.md`, `START-PROMPT-*.md`
- Architecture decisions and module interface changes

Do not create or edit anything under `src/**`. The full stack — simulation
kernels (`src/sims/**`) and the frontend (`src/app/**`) — now belongs to
Cursor, refined together so GPU acceleration and numerics can be co-designed.
If a change is needed under `src/**`, describe it clearly so Cursor can be
given a targeted prompt.

This is a deliberate change from the earlier three-model split: Codex no
longer holds an active trunk role. See `MODELS.md` for the rationale.

## Current direction

Full-stack refinement pass owned by Cursor: quality-first WebGL2/GPU renderer
for current Chrome and Safari on modern Macs, sim/render rate decoupling,
per-pane performance and graphics-quality bounds, and a review of every sim's
initial conditions and defaults for a usable frame rate. The diffusion
(Gray-Scott) model is the priority. Keep the `SimKernel` contract unchanged
unless there is an explicit architecture pass. See `HANDOFF.md` and
`START-PROMPT-cursor.md`.

## Interface contract

The kernel-to-renderer contract lives in `docs/INTERFACE.md` and is Claude-owned.
Cursor now both implements and consumes it but must not change its shape. Any
change to the `SimKernel` TypeScript interface requires updating that file and
must be agreed and committed before Cursor is given a prompt that depends on it.

## Adding a simulation

1. Update or confirm `docs/INTERFACE.md` covers the new sim's needs.
2. Draft or extend `START-PROMPT-cursor.md` with the new sim scope.
3. Write the essay in `essays/<name>.md` once the kernel is working.

## Secrets

Never put secrets, tokens, or API keys in code or committed files. Use `.env.local` (already git-ignored). Remind the user if a prompt asks for credentials inline.

## Publishing

This repo uses the private-work → public-mirror model with armed git guard
hooks. See `docs/PUBLISH-WORKFLOW.md` before pushing anywhere.

## Related

- `docs/INTERFACE.md` — kernel contract (FINAL v1.0, owned by Claude)
- `MODELS.md` — full model-boundary discipline
- `START-PROMPT-cursor.md` — current full-stack Cursor prompt
- `START-PROMPT-codex.md` — historical kernel prompt (Codex role retired)
- `HANDOFF.md` — current status and next-run brief
- `docs/PUBLISH-WORKFLOW.md` — publish-safety workflow and guard hooks
