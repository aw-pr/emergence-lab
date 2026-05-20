# MODELS.md — Model-boundary discipline

## The rule

**One lead model owns each project's trunk. Comparison happens only in the
bench-marks repo, never on trunk.**

Any comparison of models on a specific task is done by forking that task into
a separate private benchmark workspace. Trunk is the integration point for
production-quality output from the lead model.

## Ownership (hone phase)

emergence-lab is in the **hone phase** — refinement, parameter tuning,
performance, and UX polish on a working set of 12 simulations. The code trunk
is single-lead. Claude continues to maintain architecture, the interface
contract, and root directives.

| Area | Lead model | Paths |
|---|---|---|
| Code: kernels, renderer, controls, gallery, presets, performance | **Codex** | `src/**` |
| Architecture, interface contract, essays, root directives | **Claude** | `docs/INTERFACE.md`, `essays/**`, root directive docs |

Codex owns the whole code trunk (`src/**`) — kernels and renderer together —
so numerics and rendering can be co-designed. Claude continues to maintain the
`SimKernel` contract (`docs/INTERFACE.md`), the per-sim essays, and the root
directive documents (this file, `CLAUDE.md`, `AGENTS.md`, `README.md`,
`HANDOFF.md`).

Inside Cursor IDE, Claude may delegate code work in `src/**` to Codex
subagents rather than editing directly. This keeps the discipline cheap to
follow without making it a rigid file-area ban.

## History (context only)

- **Build phase**: three-model split — Codex kernels, Cursor renderer, Claude
  docs. Useful while the kernel/renderer seam was being shaped.
- **Consolidation phase**: dropped to two — Cursor full stack, Claude docs.
  Cursor multiplexed models internally, so cross-model variance was already
  unobservable inside that role.
- **Hone phase** (current): single-lead Codex over the code trunk, Claude
  over directives and essays.

## The contract boundary

The kernel-to-renderer contract is a TypeScript interface defined in
`docs/INTERFACE.md` and **owned by Claude**. Code agents implement and consume
it across `src/**` but do not change its shape. Any change to the interface
must be agreed and committed by Claude before dependent code work begins.

Keeping the contract Claude-owned preserves architectural review of the kernel
seam.

## Cross-model comparison

To compare how two models handle a task, fork it into a separate private
benchmark workspace and document prompt, outputs, and criteria there. Do not
run comparisons on this trunk.
