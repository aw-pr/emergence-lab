# Stage card dla-revive: Diffusion-Limited Aggregation produces a visible cluster

## Metadata

- **Authored:** 2026-05-26
- **Orchestrator:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Worker:** Codex GPT-5.3 <codex-gpt-5-3@local>
- **Verifier:** Claude Sonnet 4.6 <claude-sonnet-4-6@local>
- **Pairing rationale:** Cross-family per `memory/project-cross-family-verification-validated.md`. Diagnostic + code work in `src/**`; verification by Claude catches missed dimensions of the failure.

## Objective

Make DLA produce a visible, growing cluster at default settings within ~30 seconds of page load. Observed symptom on `/#/diffusion-limited-aggregation`: with current defaults (walkers per step 96, max walk steps 256, spawn radius 0.48, stickiness 1.0, seed count 1, simulation speed 16×) the canvas remains essentially black with the seed barely visible. The previous fix (`dla: even-distribution walk direction`, commit `295b522`) addressed walker direction bias but not the symptom of "nothing grows".

The worker must first diagnose the root cause (not guess — read the kernel and trace the algorithm), then apply a minimal fix. Plausible causes to investigate: walkers escape the bounded region before sticking; spawn ring too far from the seed; point-size / colour-map issues hide the cluster; cluster grows but is rendered against the same colour as background; an off-by-one in the stick condition.

## Inputs (read these in your own context)

- `src/sims/diffusion-limited-aggregation/kernel.ts`
- `src/sims/diffusion-limited-aggregation/kernel.test.cjs`
- `src/app/canvasRenderer.ts`
- `src/app/webglRenderer.ts`
- `src/app/colormap.ts`
- `docs/INTERFACE.md` (read-only)

Do not read anything else unless you need to.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/sims/diffusion-limited-aggregation/kernel.ts` — minimal change to defaults, initial conditions, or stick logic so the cluster grows visibly within 30 seconds at default settings. The worker chooses which lever (and justifies it in the commit message).
2. `src/sims/diffusion-limited-aggregation/kernel.test.cjs` — update deterministic assertions if state evolution changed.
3. (Optional) `src/app/colormap.ts` — only if the diagnosis is a colour-map issue.

## Constraints

- Diagnose before changing. The commit message must state the root cause identified and why the chosen lever is the minimal fix.
- No modifications to `docs/INTERFACE.md`.
- No changes to other sims.
- `npm run verify` passes. Atomic commit. Author `Codex GPT-5.3 <codex-gpt-5-3@local>`.
- No absolute paths in committed content.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes.
2. `docs/INTERFACE.md` is unchanged.
3. `src/sims/diffusion-limited-aggregation/kernel.ts` is modified; the diff is small (rough cap: < 50 net lines added).
4. Worker reports an explicit root-cause statement (not just "tweaked defaults") in the commit message and in the verifier handoff.
5. At default settings on `/#/diffusion-limited-aggregation`, the cluster reaches at least 100 stuck particles within 30 seconds of page load (worker confirms by visual inspection or by adding a temporary instrumentation line — removed before commit).
6. No files outside `src/sims/diffusion-limited-aggregation/**`, `src/app/colormap.ts` (if used), and this stage card are modified. The stage card itself is exempt.
7. Kernel tests remain deterministic (no `Math.random()` without a seeded PRNG).

## Out of scope

- Rewriting the DLA algorithm.
- Adding new parameters to the paramSchema.
- WebGL/GPU compute for DLA (separate audit card: `gpu-acceleration-audit`).
- Visual polish beyond what is needed to make the cluster visible.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 15 minutes

## Verifier handoff

Worker returns:

- The diagnosed root cause.
- The chosen fix and why it is minimal.
- Particle-count observation at 30 seconds.
- `npm run verify` green.

## Family-specific notes

- Codex worker: `</dev/null` stdin redirect.
- Claude verifier: cross-family pairing.
