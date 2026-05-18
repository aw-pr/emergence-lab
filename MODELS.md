# MODELS.md — Model-boundary discipline

## The rule

**One lead model owns each project's trunk. Comparison happens only in the bench-marks repo, never on trunk.**

Any comparison of models on a specific task — kernel quality, rendering approach, essay style — is done by forking that task into a separate private benchmark workspace, never on this trunk. Trunk is the integration point for production-quality output from each model's designated area.

## Ownership table

| Area | Lead model | Paths |
|---|---|---|
| Simulation kernels and sim-specific numerics | **Codex** | `src/sims/**/kernel.ts` |
| Front end: renderer, controls, gallery UI | **Cursor** | `src/app/**` |
| Architecture decisions, interface contract, essays | **Claude** | `docs/INTERFACE.md`, `essays/**`, root docs and config |

No model creates or edits files outside its designated area. If a task spans areas, it is split into separate, scoped prompts for the appropriate model.

## The contract boundary

The kernel-to-renderer contract is a TypeScript interface defined in `docs/INTERFACE.md` and owned by Claude. It is the only shared surface between Codex and Cursor.

- **Codex** receives the interface and implements it in `src/sims/<name>/kernel.ts`. It does not define or modify the interface.
- **Cursor** receives the interface and consumes it in `src/app/**`. It does not define or modify the interface.
- **Claude** defines and evolves the interface. Any change to the interface must be committed before dependent model prompts are issued.

This arrangement means:
- Kernels and the renderer can be built and iterated independently.
- The contract is the single point of coordination, and it is version-controlled.
- No model has to read another model's files to do its job.

## Current renderer direction

The current frontend renderer is CPU Canvas 2D. The next planned frontend pass is
a Cursor-owned WebGL/GPU renderer rewrite under `src/app/**`, with CPU Canvas 2D
kept as a fallback if practical. The goal is better local experimentation:
higher effective resolution, smoother continuous systems, and crisp grid models.

Do not change `docs/INTERFACE.md` for this rewrite unless there is an explicit
architecture decision to version the kernel contract.

## Cross-model comparison

If you want to compare how Codex and Cursor (or any other pairing) handle a task, fork the task into a separate private benchmark workspace. Document the prompt, the outputs, and the evaluation criteria there. Do not run comparisons on this trunk.
