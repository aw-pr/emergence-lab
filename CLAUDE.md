# CLAUDE.md — emergence-lab

## Phase: hone

emergence-lab is in the **hone phase** — refinement, parameter tuning,
performance, and UX polish on a working set of 19 simulations. See `MODELS.md`.

There is **no per-model ownership** of areas of this repo. Whichever agent is
working a task may edit any part of it — code (`src/**`), docs, architecture.
Multi-agent work runs through **autometta** when you want parallel workers and
cross-checking (stage cards under `docs/stages/`, see
`docs/dispatch-contract.md`); otherwise just do the work directly.

## Current direction

The logistic-Mandelbrot bifurcation reveal is landed and validated, including
free camera navigation and the machine-local prebaked point cloud (see
"Baking a local point cloud" in `README.md`). No required implementation work
remains. Gray-Scott stays the priority kernel for future refinement.

## Worktrees and branches

**Take new worktrees from `dev`.** `dev` is the live branch in practice; `main`
advances from it and `publish` is the mirror boundary. A worktree branched from
anywhere else inherits a history the rest of the fleet is not working against.

Two long-lived branches are not `dev` and should not be treated as a base:

- `feat/logistic-mandelbrot-hybrid-surface` (worktree `../emergence-lab-surface`)
  is **an experiment whose fate is undecided.** It rewrites `orbit3d.ts`
  internals and adds `src/app/orbitSurface.ts`; operator visual review rejected
  its output on 2026-07-20 (sawtooth silhouette, no sheet-to-cloud dissolve) and
  it has been parked since. Do not branch from it, import from it, reconcile
  against it, or treat its approach as precedent. Do not delete it or propose
  deleting it either — the decision is the operator's and has not been made.
  Follow-up notes live at
  `docs/plans/2026-07-20-logistic-mandelbrot-edge-transition-next-steps.md`.
- `feat/logistic-mandelbrot-gpu-sampler` (worktree `../emergence-lab-gpu`) is the
  active autometta run for stages 34-36, moving orbit sampling to a WebGL2
  fragment shader. Branched from `dev`.

Both touch the same `orbit3d.ts` internals, and a rebase between them has
already failed once with eight structural conflicts. They are deliberately
allowed to diverge.

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
- `state/handoffs/README.md` — structured handoff envelope
- `docs/PUBLISH-WORKFLOW.md` — publish-safety workflow and guard hooks
