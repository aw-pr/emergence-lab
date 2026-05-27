# Stage card 12-final-fixes-bugfix-intake: Final publish bug fix queue

## Metadata

- **Authored:** 2026-05-27
- **Orchestrator:** GPT-5.5 <gpt-5-5@local>
- **Worker:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Verifier:** GPT-5.5 <gpt-5-5@local>
- **Pairing rationale:** Codex/GPT owns the implementation design and final verification pass for publish readiness; Claude executes the code change against that design. This deliberately reverses the usual code-owner route for a final bug-fix pass while keeping verification independent of the worker.

## Objective

Track the final publish bug-fix queue before dispatching concrete Autometta cards. Codex/GPT designs each fix, Claude executes it, and Codex/GPT verifies the diff, app behaviour, and publish-safety gate.

The concrete cards are:

- `docs/stages/13-reset-all-controls-to-defaults.md` — shared reset correctness across visible controls.
- `docs/stages/14-fractal-colour-cycle-pacing.md` — Mandelbrot, Julia Set, and Burning Ship colour-cycle pacing.
- `docs/stages/15-boids-density-motion-tuning.md` — Boids density, point size, and movement speed.
- `docs/stages/16-sandpile-larger-slower.md` — Abelian Sandpile larger/slower tuning.

## User issue list

- Fractals: colour cycling is jumpy at lower multipliers; set fractal multiplier minimum to `0.5x`.
- Fractals: colour cycling is too fast overall; investigate slowing with lower defaults, shared renderer scale, or more colour spread.
- Julia Set: target `cycleSpeed` default `0.1` unless the pacing investigation finds a better equivalent.
- Reset: colour multiplier and other visible controls should reset to defaults when pressing Reset to defaults.
- Boids: make points much larger, increase count about 10x, and increase movement rate about 10x.
- Abelian Sandpile: make the pattern bigger and slow it down by about 5x.
- Integration: keep each model fix independent so the eventual commits are separable.

## Inputs (read these in your own context)

- `AGENTS.md`
- `HANDOFF.md`
- `docs/INTERFACE.md`
- `docs/dispatch-contract.md`
- `docs/verification.md`
- `docs/PUBLISH-WORKFLOW.md`
- The concrete stage cards listed above.

Do not dispatch this queue card directly. Dispatch the concrete cards one at a time.

## Deliverables

1. Maintain this queue as a navigation/index card.
2. Dispatch concrete cards independently.
3. Keep eventual commits independent by model or shared-control concern:
   - reset correctness,
   - fractal colour pacing,
   - Boids tuning,
   - Abelian Sandpile tuning.

## Constraints

- Claude executes the implementation. Codex/GPT designs the route and verifies the result.
- Do not change `docs/INTERFACE.md`. If the issue appears to require a contract change, stop and return a proposal note instead of editing the contract.
- Keep changes scoped to the active concrete card. No opportunistic refactors.
- Preserve the 12-simulation gallery and existing kernel metadata shape.
- No secrets, tokens, local paths, or machine-specific values in committed content.
- Do not run `git commit` from the worker or verifier phase.
- `npm run verify` must pass before the orchestrator integrates.
- If frontend behaviour changes, verify in a browser on the relevant simulation or screen, not only by static inspection.

## Acceptance criteria

1. The queue lists every current user-reported bug or polish item.
2. Each queue item has a concrete stage card.
3. Each concrete card has a worker, verifier, inputs, deliverables, constraints, and acceptance criteria.
4. The eventual implementation commits stay independent by model or shared-control concern.
5. `npm run verify` passes for each implementation card before integration.
6. Any new or changed user-visible behaviour is manually checked in the running app.
7. The verifier confirms no `docs/INTERFACE.md` contract shape changed for each implementation card.
8. The verifier confirms no publish-safety violations were introduced:
   - no absolute home paths,
   - no secret-manager URI references,
   - no `.env*`, local settings, auth files, logs, or secret material tracked.
9. The worker and verifier leave the working tree uncommitted for orchestrator integration.

## Out of scope

- Adding a new simulation.
- Rewriting the renderer architecture.
- Changing the kernel-to-renderer interface contract.
- Broad visual redesign unrelated to the filled issue.
- Publishing, pushing, or changing repository visibility.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 20 minutes

## Verifier handoff

Verifier returns:

- `overall: PASS` or `overall: FAIL`.
- Files changed.
- Acceptance evidence for each criterion.
- Exact `npm run verify` result.
- Browser/manual test notes, if applicable.
- Any residual risk or follow-up card suggestion.

## Family-specific notes

- Codex/GPT designer: call `agent-whoami` before authoring the final prompt if attribution needs to be recorded.
- Claude worker: read only the card and named inputs first; do not run `git commit`; leave changes uncommitted.
- Codex/GPT verifier: run acceptance outside the worker context; do not trust the worker's self-report without checking the diff and commands.
