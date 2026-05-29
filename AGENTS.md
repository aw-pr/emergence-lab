# AGENTS.md — emergence-lab

## Phase: hone

emergence-lab is in the **hone phase** — refinement, parameter tuning,
performance, and UX polish on a working set of 12 simulations. See `MODELS.md`.

## Working model

There is **no per-model ownership** of areas of this repo. Whichever agent
picks up a task may edit any part of it — code (`src/**`), docs, architecture.
Multi-agent work is run through **autometta** (stage cards under `docs/stages/`,
see `docs/dispatch-contract.md`) when you want parallel workers and
cross-checking; otherwise just do the work directly.

## Interface contract

The kernel-to-renderer contract in `docs/INTERFACE.md` is a reviewed boundary,
not owned by any one model. Code that consumes or implements it must stay in
step with the committed version and must not change its shape casually. A change
to its *shape* is versioned: bump the version, record it, and commit it before
dependent code work begins.

## Adding a simulation

1. Confirm `docs/INTERFACE.md` covers the new sim's needs.
2. Implement the kernel under `src/sims/<name>/` and wire the gallery.
3. Write the essay in `essays/<name>.md`.

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

- `docs/INTERFACE.md` — kernel contract (reviewed boundary, v1.0.1)
- `MODELS.md` — model policy (no area ownership; autometta for multi-agent)
- `HANDOFF.md` — current status and next-run brief
- `docs/PUBLISH-WORKFLOW.md` — publish-safety workflow and guard hooks
