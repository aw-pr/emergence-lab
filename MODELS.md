# MODELS.md — Model-boundary discipline

## The rule

**One lead model owns each project's trunk. Comparison happens only in the
bench-marks repo, never on trunk.**

Any comparison of models on a specific task is done by forking that task into a
separate private benchmark workspace, never on this trunk. Trunk is the
integration point for production-quality output from each model's designated
area.

## Ownership table

| Area | Lead model | Paths |
|---|---|---|
| Full stack: kernels, renderer, controls, gallery, presets, performance | **Cursor** | `src/**` |
| Architecture, interface contract, essays, root docs and config | **Claude** | `docs/INTERFACE.md`, `essays/**`, root docs and config |

This is a deliberate change from the earlier three-model split. The simulation
kernels and the frontend renderer are now refined together by one model so that
GPU acceleration and numerics can be co-designed. Codex no longer holds an
active trunk role; historical Codex kernel work is now under Cursor
stewardship. Cross-model comparison still happens only in the benchmark repo.

## The contract boundary

The kernel-to-renderer contract is a TypeScript interface defined in
`docs/INTERFACE.md` and **owned by Claude**. It remains the single
architectural seam even though one model now sits on both sides of it.

- **Cursor** implements *and* consumes the interface across `src/**`. It does
  not change the interface shape.
- **Claude** defines and evolves the interface. Any change to the interface
  must be committed before dependent Cursor work begins.

Keeping the contract Claude-owned preserves architectural control and keeps
kernels deterministic and renderer-independent even though implementation
latitude is now unified.

## Current direction

Full-stack refinement pass: quality-first WebGL2/GPU renderer, decoupled
sim/render rates, per-pane performance and graphics-quality bounds, and a
review of every sim's initial conditions and default parameters for a usable
frame rate. The diffusion (Gray-Scott) model is the priority. See
`START-PROMPT-cursor.md` and `HANDOFF.md`.

## Cross-model comparison

To compare how two models handle a task, fork it into a separate private
benchmark workspace and document prompt, outputs, and criteria there. Do not
run comparisons on this trunk.
