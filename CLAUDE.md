# CLAUDE.md — emergence-lab

## Phase: hone

emergence-lab is in the **hone phase** — refinement, parameter tuning,
performance, and UX polish on a working set of 12 simulations. The code trunk
is single-lead Codex. See `MODELS.md`.

Claude maintains:

- `docs/INTERFACE.md` — the TypeScript `SimKernel` contract
- `essays/**` — one essay per simulation
- Root directives: `MODELS.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`,
  `HANDOFF.md`
- Architecture and interface-contract decisions

Code work in `src/**` is Codex's lead. From within Cursor IDE, Claude
delegates code changes to Codex subagents (model slug
`gpt-5.3-codex-high-fast`, author identity `Codex GPT-5 <codex-gpt-5@local>`)
rather than editing `src/**` directly. Claude does not edit `src/**` unless
making a change that is architecturally entangled with an interface decision
and the user explicitly authorises it.

## Current direction

Refinement of defaults, initial conditions, and controls UX across all 12
sims, plus landing the in-flight WebGL2 renderer work. The diffusion model
(Gray-Scott) is the priority kernel. The controls panel is gaining
user-overridable slider min/max with localStorage persistence and a
"Reset to defaults" button. See `HANDOFF.md`.

## Interface contract

Changes to the `SimKernel` interface in `docs/INTERFACE.md` are still made
here. If Codex proposes a change, write it up as a note for Claude review;
commit the contract update before any dependent code work.

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

- `docs/INTERFACE.md` — kernel contract (FINAL v1.0, owned by Claude)
- `MODELS.md` — model-boundary discipline statement
- `HANDOFF.md` — current status and next-run brief
- `docs/PUBLISH-WORKFLOW.md` — publish-safety workflow and guard hooks
