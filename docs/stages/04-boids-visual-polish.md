# Stage card boids-visual-polish: Boids visual rendering polish

## Metadata

- **Authored:** 2026-05-26
- **Orchestrator:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Worker:** Codex GPT-5.3 <codex-gpt-5-3@local>
- **Verifier:** Claude Sonnet 4.6 <claude-sonnet-4-6@local>
- **Pairing rationale:** Cross-family per `memory/project-cross-family-verification-validated.md`. Code work in `src/**` is Codex-lead; verification by Claude catches family-blind style and contract drift.

## Objective

Make the Boids gallery page visibly compelling. At default settings boids should read as distinct moving shapes (not single pixels), with a heading-aware glyph and an optional trail/fade so flocking behaviour is visible at a glance. The observed symptom: after ~10 minutes the canvas shows scattered ~1-2 px specks on a pale background, indistinguishable from noise.

## Inputs (read these in your own context)

- `src/sims/boids/kernel.ts`
- `src/app/canvasRenderer.ts`
- `src/app/webglRenderer.ts`
- `src/app/rendererBackend.ts`
- `src/app/renderModes.ts`
- `src/app/simView.ts`
- `docs/INTERFACE.md` (read-only — the contract; do not modify)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/sims/boids/kernel.ts` — extend the kernel's `channelCount` / `channelLabels` and `readState()` layout if needed to carry per-boid heading (vx, vy) alongside position so the renderer can orient the glyph. Default `Point size (px)` raised from `2` to a value that reads as a recognisable shape at standard zoom (worker's call — pick something in the 4–8 px range and justify in the commit message).
2. `src/app/canvasRenderer.ts` (and `webglRenderer.ts` if the WebGL2 path is active for Boids) — render each boid as a directional glyph (triangle pointing along the velocity) rather than a single point. Background should default to a darker palette so the boids contrast.
3. `src/sims/boids/kernel.test.cjs` — update deterministic assertions if the state layout changed.

## Constraints

- No modifications to `docs/INTERFACE.md`. Any per-boid heading exposure must use the existing `channelCount` + `channelLabels` + `Float32Array` contract.
- No absolute paths in committed content (no `/Users/...`, no machine-specific paths).
- `npm run verify` must pass before commit. Commit atomically per `~/.claude/rules/mcp-hub-dev-rules.md`; author identity `Codex GPT-5.3 <codex-gpt-5-3@local>`, committer is the human user.
- Do not change other sims. Boids only.
- Maintain ≥30 fps at default boid count (80) on the worker's machine.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes (typecheck + kernel tests + production build).
2. `src/sims/boids/kernel.ts` exposes velocity/heading data via the canonical `readState()` `Float32Array` (no new methods on the kernel beyond the `SimKernel` interface).
3. `docs/INTERFACE.md` is unchanged (`git diff main -- docs/INTERFACE.md` is empty).
4. At least one of `src/app/canvasRenderer.ts` or `src/app/webglRenderer.ts` contains a directional-glyph render path gated on the sim being Boids (or a generic mechanism keyed off kernel-provided channel labels).
5. Default `Point size (px)` in the Boids `paramSchema` is strictly greater than `2`.
6. No files outside the deliverables set are modified — except this stage card itself, which is exempt per `autometta/memory/feedback-acceptance-criterion-stage-card-exemption.md`.
7. Manual smoke route `/#/boids` shows visible directional shapes within 5 seconds of page load, confirmed by the worker via screenshot or a written description of what was seen.

## Out of scope

- Iteration counter on the side panel (separate card: `iteration-counter-side-panel`).
- Other sims' visual polish.
- Performance work beyond what is needed to keep ≥30 fps at default boid count.
- Adding new kernel parameters (sliders) beyond raising the default `Point size`.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 10 minutes

## Verifier handoff

On completion the worker returns:

- List of modified files (`git diff --name-only`).
- The chosen new default point size and brief justification.
- A short note on what was observed on `/#/boids` at default settings (visible flocking shapes within N seconds).
- Confirmation that `npm run verify` is green.

## Family-specific notes

- Codex worker: headless dispatch must redirect stdin from `</dev/null` per `autometta/memory/feedback-stage-6-runtime-bugs.md`.
- Claude verifier: cross-family pairing per `autometta/memory/project-cross-family-verification-validated.md`.
