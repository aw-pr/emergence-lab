# CLAUDE.md — emergence-lab

## Phase: hone

emergence-lab is in the **hone phase** — refinement, parameter tuning,
performance, and UX polish on a working set of 20 simulations. See `MODELS.md`.

There is **no per-model ownership** of areas of this repo. Whichever agent is
working a task may edit any part of it — code (`src/**`), docs, architecture.
Multi-agent work runs through **autometta** when you want parallel workers and
cross-checking (stage cards under `docs/stages/`, see
`docs/dispatch-contract.md`); otherwise just do the work directly.

## Current direction

The logistic-Mandelbrot bifurcation reveal is landed and validated, including
free camera navigation and the machine-local prebaked point cloud (see
"Baking a local point cloud" in `README.md`). The analytic surface arc
(stages 52-56) is landed, deployed and mirrored publicly as of 2026-08-23.
Stage 57, an interestingness sweep harness scoring frames on entropy, spatial
autocorrelation, temporal flux and coverage, is queued and unstarted.
Gray-Scott stays the priority kernel for future refinement.

## Worktrees and branches

**Take new worktrees from `dev`.** `dev` is the live branch in practice; `main`
advances from it and `publish` is the mirror boundary. A worktree branched from
anywhere else inherits a history the rest of the fleet is not working against.

One long-lived branch is not `dev` and must not be treated as a base:

- `feat/logistic-mandelbrot-hybrid-surface` (worktree `../emergence-lab-surface`)
  is **an experiment whose fate is undecided.** It rewrites `orbit3d.ts`
  internals and adds `src/app/orbitSurface.ts`. Operator visual review rejected
  its output on 2026-07-20 (sawtooth silhouette, no sheet-to-cloud dissolve);
  stages 40 and 41 reopened it on 2026-08-19 to attack exactly those two
  defects, and it has been untouched since. It is 23 commits off a 2026-07-27
  merge base and touches 28 files. Do not branch from it, import from it,
  reconcile against it, or treat its approach as precedent. Do not delete it or
  propose deleting it either — the decision is the operator's and has not been
  made. Notes:
  `docs/plans/2026-07-20-logistic-mandelbrot-edge-transition-next-steps.md` and
  `docs/plans/2026-08-19-edge-analysis-findings.md`.

The surface problem it was cut to solve has since been solved another way. The
analytic edge-curve arc (stages 52-56, `docs/plans/2026-08-22-analytic-edge-curves.md`)
landed on `dev` on 2026-08-23 from `feat/logistic-mandelbrot-surface-v2`, whose
branch and worktree are retired. That makes the hybrid-surface branch superseded
in practice, which is context for the operator's decision, not the decision
itself.

Two earlier lines are closed and should not be looked for on disk:

- `feat/logistic-mandelbrot-gpu-sampler` (stages 34-36, WebGL2 fragment-shader
  orbit sampling) merged to `dev` at `636315c` on 2026-08-16; branch, worktree
  `../emergence-lab-gpu` and origin ref are gone. Background survives in
  `docs/plans/2026-08-15-logistic-mandelbrot-gpu-sampler-next-steps.md`.
- `feat/logistic-mandelbrot-surface-v2` (stages 52-56) merged and was deleted on
  2026-08-23.

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
