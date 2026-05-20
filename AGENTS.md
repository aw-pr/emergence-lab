# AGENTS.md — emergence-lab

## Phase: hone

emergence-lab is in the **hone phase** — refinement, parameter tuning,
performance, and UX polish on a working set of 12 simulations. The code trunk
(`src/**`) is single-lead Codex. Claude maintains architecture, the interface
contract, essays, and root directives. See `MODELS.md`.

## Ownership

| Area | Lead model | Paths |
|---|---|---|
| Code: kernels, renderer, controls, gallery, presets, performance | Codex | `src/**` |
| Architecture, interface contract, essays, root directives | Claude | `docs/INTERFACE.md`, `essays/**`, root directive docs |

There is no longer a strict file-area enforcement. The practical division is:
Codex writes code, Claude writes prose and architecture decisions. Where work
crosses the boundary (e.g. a code change motivated by an interface decision),
Claude handles the interface side and delegates the code side to a Codex
subagent.

## Interface contract

The kernel-to-renderer contract lives in `docs/INTERFACE.md` and is
Claude-owned. Code that consumes or implements it must not change its shape.
If a change is needed, write it up as a proposal note in your summary —
do not edit `docs/INTERFACE.md`. The contract update must be agreed and
committed by Claude before dependent code work begins.

## Adding a simulation

1. Confirm `docs/INTERFACE.md` covers the new sim's needs (Claude).
2. Implement the kernel under `src/sims/<name>/` and wire the gallery
   (Codex).
3. Write the essay in `essays/<name>.md` (Claude).

## Commit discipline

Atomic commits, one logical change each. Author identity tracks the model
that wrote the change; committer is always the human user. The verify gate
`npm run verify` must be green before any commit lands on `main`. See
`.cursor/rules/git-strategy.mdc`.

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
- `MODELS.md` — model-boundary discipline statement
- `HANDOFF.md` — current status and next-run brief
- `docs/PUBLISH-WORKFLOW.md` — publish-safety workflow and guard hooks
