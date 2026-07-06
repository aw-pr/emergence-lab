# CLAUDE.md — emergence-lab

## Phase: hone

emergence-lab is in the **hone phase** — refinement, parameter tuning,
performance, and UX polish on a working set of 16 simulations. See `MODELS.md`.

There is **no per-model ownership** of areas of this repo. Whichever agent is
working a task may edit any part of it — code (`src/**`), docs, architecture.
Multi-agent work runs through **autometta** when you want parallel workers and
cross-checking (stage cards under `docs/stages/`, see
`docs/dispatch-contract.md`); otherwise just do the work directly.

## Current direction

Refinement of defaults, initial conditions, and controls UX across all 12
sims, plus landing the in-flight WebGL2 renderer work. The diffusion model
(Gray-Scott) is the priority kernel. The controls panel is gaining
user-overridable slider min/max with localStorage persistence and a
"Reset to defaults" button. See `HANDOFF.md`.

## Interface contract

The `SimKernel` interface in `docs/INTERFACE.md` is a reviewed boundary, not
owned by any one model. A change to its *shape* is a versioned decision: write
it up, bump the version, and commit the contract update before any dependent
code work begins.

## Commit discipline

Atomic commits, one logical change each. Author identity tracks the model
that wrote the change (`Claude Opus 4.7 <claude-opus-4-7@local>`,
`Codex GPT-5 <codex-gpt-5@local>`, etc.); committer stays the human user.
Verify gate `npm run verify` green before any commit lands on `main`. See
`.cursor/rules/git-strategy.mdc`.

## Secrets

Never put secrets, tokens, or API keys in code or committed files. Use
`.env.local` (already git-ignored).

## Publishing

This repo uses the private-work → public-mirror model with armed git guard
hooks. See `docs/PUBLISH-WORKFLOW.md` before pushing anywhere.

## Related

- `docs/INTERFACE.md` — kernel contract (reviewed boundary, v1.0.1)
- `MODELS.md` — model policy (no area ownership; autometta for multi-agent)
- `HANDOFF.md` — current status and next-run brief
- `docs/PUBLISH-WORKFLOW.md` — publish-safety workflow and guard hooks
