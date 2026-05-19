# AGENTS.md — emergence-lab

## Model boundary — read this first

This repository enforces a strict model-boundary discipline. Keep edits inside
the area owned by the model doing the work.

| Area | Lead model | Paths |
|---|---|---|
| Full stack: kernels, renderer, controls, gallery, presets, performance | Cursor | `src/**` |
| Architecture, interface contract, essays, root docs | Claude | `docs/INTERFACE.md`, `essays/**`, root docs and config |

Cursor owns the whole of `src/**` — simulation kernels and tests under
`src/sims/**` and the frontend under `src/app/**`. Kernels and renderer are
refined together so GPU acceleration and numerics can be co-designed.

Claude owns:
- `docs/INTERFACE.md` — the TypeScript interface contract between kernels and the renderer
- `essays/**` — one essay per simulation
- Root configuration files, `AGENTS.md`, `CLAUDE.md`, `README.md`, `MODELS.md`, `HANDOFF.md`, `START-PROMPT-*.md`
- Architecture decisions and module interface changes

This is a deliberate change from the earlier three-model split: Codex no
longer holds an active trunk role. See `MODELS.md` for the rationale.

## Current direction

Full-stack refinement pass: quality-first WebGL2/GPU renderer for current
Chrome and Safari on modern Macs, sim/render rate decoupling, per-pane
performance and graphics-quality bounds, and a review of every sim's initial
conditions and defaults for a usable frame rate. The diffusion (Gray-Scott)
model is the priority. See `HANDOFF.md` and `START-PROMPT-cursor.md`.

## Interface contract

The kernel-to-renderer contract lives in `docs/INTERFACE.md` and is
Claude-owned. Cursor implements and consumes it but must not change its shape.
If the `SimKernel` interface needs to change, stop and write the proposed
change as a note — do not edit `docs/INTERFACE.md`. Changes must be agreed and
committed by Claude before dependent work.

## Adding a simulation

1. Confirm `docs/INTERFACE.md` covers the new sim's needs (Claude).
2. Extend `START-PROMPT-cursor.md` with the new sim scope.
3. Cursor implements the kernel under `src/sims/<name>/` and wires the gallery.
4. Claude writes the essay in `essays/<name>.md`.

## Secrets

Never put secrets, tokens, or API keys in code or committed files. Use
`.env.local` (already git-ignored). Remind the user if a prompt asks for
credentials inline.

## Publishing

This repo uses armed publish-guard git hooks and the private → public mirror
model. See `docs/PUBLISH-WORKFLOW.md`. Do not push to a public remote from an
agent session unless explicitly asked.

## Related

- `docs/INTERFACE.md` — kernel contract (FINAL v1.0, owned by Claude)
- `MODELS.md` — full model-boundary discipline
- `START-PROMPT-cursor.md` — current full-stack Cursor prompt
- `HANDOFF.md` — current status and next-run brief
- `docs/PUBLISH-WORKFLOW.md` — publish-safety workflow and guard hooks
