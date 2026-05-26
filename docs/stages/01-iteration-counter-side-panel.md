# Stage card iteration-counter-side-panel: Expose iteration count in the side panel

## Metadata

- **Authored:** 2026-05-26
- **Orchestrator:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Worker:** Codex GPT-5.3 <codex-gpt-5-3@local>
- **Verifier:** Claude Sonnet 4.6 <claude-sonnet-4-6@local>
- **Pairing rationale:** Cross-family per `memory/project-cross-family-verification-validated.md`. Pure renderer change, no interface impact, but still worth a Claude pass for control-panel style and naming consistency.

## Objective

Show a running iteration count for the active simulation in the controls/side panel — adjacent to the existing `fps` display. The count is the number of `step()` calls the renderer has issued since the last `init()` / Reset, tracked by the renderer (not the kernel). It resets on Reset, Reset-to-defaults, and on parameter changes that re-init the kernel.

## Inputs (read these in your own context)

- `src/app/simView.ts`
- `src/app/controls.ts`
- `src/app/renderer.ts`
- `src/app/styles.css`
- `docs/INTERFACE.md` (read-only — confirms iteration tracking is a renderer concern, not a kernel concern)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/app/renderer.ts` (or wherever `step()` is invoked in the main loop) — increment a per-sim iteration counter on each `step()` call; reset on `init()`.
2. `src/app/simView.ts` or `src/app/controls.ts` — display the counter in the side-panel header alongside `fps`. Format: `iter 12,345` with thousands separators; rendering should not cause layout shift as the number grows.
3. `src/app/styles.css` — minimal CSS additions only if needed for the new label.

## Constraints

- No changes to `docs/INTERFACE.md`. The counter is renderer-side only; do not add an `iterationCount` field to the `SimKernel` interface.
- No new kernel methods. Kernels remain unaware.
- No absolute paths in committed content.
- `npm run verify` must pass. Atomic commit; author `Codex GPT-5.3 <codex-gpt-5-3@local>`.
- The counter must display for every sim, not just Boids — generic mechanism.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes.
2. `docs/INTERFACE.md` is unchanged.
3. No kernel files under `src/sims/**` are modified.
4. The string `iter` (lowercase) appears in the rendered side-panel DOM on every sim route (the worker confirms by checking `/#/boids` and one other sim — e.g. `/#/gray-scott`).
5. The counter resets to 0 on Reset, Reset to defaults, and on any parameter change that re-inits the kernel.
6. No files outside the deliverables set are modified — except this stage card itself.
7. The counter survives at least 100,000 iterations without layout shift or formatting bugs (worker confirms by leaving a sim running and noting the rendered value).

## Out of scope

- Showing iteration count anywhere other than the side panel.
- Exposing iteration count via a kernel interface (explicitly forbidden — it is a renderer concern).
- Per-sim iteration semantics — for sims like DLA where one "step" advances many walkers, the count is still the number of `step()` calls, not internal walker steps.

## Budget

- **Worker wall-clock:** 25 minutes
- **Verifier wall-clock:** 10 minutes

## Verifier handoff

Worker returns:

- List of modified files.
- Confirmation that the counter appears on `/#/boids` and `/#/gray-scott`.
- Confirmation that Reset and Reset-to-defaults both reset the counter.
- Confirmation `npm run verify` is green.

## Family-specific notes

- Codex worker: `</dev/null` stdin redirect.
- Claude verifier: cross-family per the validated pairing memory.
