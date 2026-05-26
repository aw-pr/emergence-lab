# Stage card 07-cycling-units-mismatch: Unify cycleSpeed units between CPU and WebGL render paths

## Metadata

- **Authored:** 2026-05-26
- **Orchestrator:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Worker:** Codex GPT-5.3 <codex-gpt-5-3@local>
- **Verifier:** Claude Sonnet 4.6 <claude-sonnet-4-6@local>
- **Pairing rationale:** Cross-family per `memory/project-cross-family-verification-validated.md`. Touches one renderer path and three kernel.step() implementations; Claude verifier confirms the rate-per-second contract is documented and the test deltas hold across both render backends.

## Objective

The fractal kernels (Mandelbrot, Julia, Burning Ship) currently advance their palette `phase` per `step()` call:

```ts
step(_dt: number): void {
  this.phase = wrap01(this.phase + this.cycleSpeed);
  ...
}
```

The renderer calls `step()` once per animation frame. Result: the CPU (Canvas2D) path produces `cycleSpeed * frameRate` cycles per second (~60× the WebGL2 path, which uses `elapsedTime[seconds] * cycleSpeed`). The two backends are wildly inconsistent visually, and `cycleSpeed` has no single physical meaning across the codebase.

Make `cycleSpeed` mean **cycles per second** in both paths. CPU path: multiply by `dt` (the seconds since last step). WebGL path: unchanged. Document the unit in `docs/INTERFACE.md` notes section or in a renderer-side README comment (no contract change needed since `cycleSpeed` is per-kernel, not in the interface).

## Inputs (read these in your own context)

- `src/sims/mandelbrot/kernel.ts`
- `src/sims/julia-set/kernel.ts`
- `src/sims/burning-ship/kernel.ts`
- `src/sims/mandelbrot/kernel.test.cjs`
- `src/sims/julia-set/kernel.test.cjs`
- `src/sims/burning-ship/kernel.test.cjs`
- `src/app/webglRenderer.ts` (read-only — confirms the seconds-based contract)
- `docs/INTERFACE.md` (read-only — kernel interface; `step(dt)` already takes `dt` in seconds)

Do not read anything else.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/sims/mandelbrot/kernel.ts` — change `step()` to advance `phase` by `cycleSpeed * dt` instead of `cycleSpeed`.
2. `src/sims/julia-set/kernel.ts` — same.
3. `src/sims/burning-ship/kernel.ts` — same.
4. `src/sims/mandelbrot/kernel.test.cjs` — update deterministic assertions; tests that exercise cycling must pass an explicit `dt` (16/1000 or 1/60 are sensible) so the assertion is renderer-agnostic.
5. `src/sims/julia-set/kernel.test.cjs` — same.
6. `src/sims/burning-ship/kernel.test.cjs` — same.

## Constraints

- No modifications to `docs/INTERFACE.md`. `step(dt)` already accepts `dt` in seconds per the contract; this card just makes the kernel honour the parameter.
- No changes to `cycleSpeed` defaults. Stage `02b` already set them to visibly-perceptible values (0.25 / 0.3 / 0.2) in the seconds-based interpretation, which is what we are now converging both paths on.
- No changes to other sims. Only the three fractal kernels.
- `npm run verify` must pass. Atomic commit. Author identity tracks the worker (e.g. `Codex GPT-5.3 <codex-gpt-5-3@local>`).
- Do NOT run `git commit` from the worker. The orchestrator will commit on verifier-pass per the new dispatch model (see `templates/worker-prompt.md`). Leave changes in the working tree.
- No absolute paths in committed content.
- Report the bundle-size delta in the verifier-handoff section (gzip kB before/after the production build). Trivial change so the delta should be ~0.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes (typecheck + kernel tests + production build).
2. `docs/INTERFACE.md` is unchanged.
3. `src/sims/{mandelbrot,julia-set,burning-ship}/kernel.ts` all use `cycleSpeed * dt` (or equivalent) in `step()`. Greppable: `cycleSpeed * dt` or `this.cycleSpeed \* dt` appears in each `step` function body.
4. Kernel tests pass an explicit `dt` to `step()` calls where cycling is exercised.
5. No kernel files under `src/sims/` other than the three fractal ones are modified.
6. No renderer files under `src/app/` are modified.
7. Production build gzip-size delta is reported in the verifier handoff (worker's responsibility per the budget-reporting lesson from stage 05).
8. No files outside the deliverables set are modified — except this stage card itself, which is exempt per `autometta/memory/feedback-acceptance-criterion-stage-card-exemption.md`.

## Out of scope

- Adding new params or changing slider ranges.
- Adjusting default `cycleSpeed` values (already calibrated in 5fd49f4).
- Refactoring the three fractal kernels into a shared base class.
- Documentation work beyond what is needed to keep tests honest.

## Budget

- **Worker wall-clock:** 25 minutes
- **Verifier wall-clock:** 10 minutes

## Verifier handoff

Worker returns:

- List of modified files.
- Bundle-size delta (gzipped production build).
- Confirmation that `npm run verify` is green.
- A one-line confirmation that no `git commit` was invoked from the worker phase.

## Family-specific notes

- Codex worker: `</dev/null` stdin redirect; **do not run `git commit`** in your phase. Leave changes uncommitted.
- Claude verifier: cross-family per the validated pairing memory. Check both the math change and the worker-self-commit constraint.
