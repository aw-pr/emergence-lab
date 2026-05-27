# Stage card 15-boids-density-motion-tuning: Larger denser faster Boids

## Metadata

- **Authored:** 2026-05-27
- **Orchestrator:** GPT-5.5 <gpt-5-5@local>
- **Worker:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Verifier:** GPT-5.5 <gpt-5-5@local>
- **Pairing rationale:** Codex/GPT defines the tuning target and performance guardrails; Claude executes the Boids-only change; Codex/GPT verifies performance and visuals independently.

## Objective

Tune Boids so the flock is visibly denser, larger, and faster.

User target:

- Increase point size so the minimum is about 16 times the current minimum.
- Increase boid count by about 10x.
- Increase movement rate by about 10x.
- Commit this independently from other model fixes.

Current baseline from `src/sims/boids/kernel.ts`:

- `boidCount` default `80`, max `400`.
- `maxSpeed` default `2`, max `8`.
- `pointSize` default `6`, min `1`, max `16`.
- `simView` default display dot size for Boids is `2`.

## Inputs (read these in your own context)

- `src/sims/boids/kernel.ts`
- `src/sims/boids/kernel.test.cjs`
- `src/app/webglRenderer.ts`
- `src/app/simView.ts`
- `src/app/renderer.ts`
- `docs/INTERFACE.md` (read-only)
- `docs/verification.md`

## Deliverables

1. Boids defaults and bounds tuned toward the target:
   - point-size minimum around `16`,
   - default point size at or above the new minimum,
   - boid-count default about 10x current if performance allows,
   - movement speed about 10x current if performance allows.
2. Update any renderer glyph clamping that prevents the larger point-size control from taking effect.
3. Update Boids tests for changed metadata/defaults.
4. If the exact 10x target is too slow because the kernel is still O(n²), document the measured fallback and choose the highest usable default that keeps the browser responsive.

## Constraints

- Edit Boids and directly required renderer/control files only.
- Do not change other simulations.
- Do not change the SimKernel contract.
- Keep Boids deterministic for the same params and steps.
- Keep the browser responsive at default settings on a normal laptop.
- Do not run `git commit` from the worker phase.

## Acceptance criteria

1. `npm run verify` passes.
2. `boidCount`, `maxSpeed`, and `pointSize` defaults/tests reflect the chosen tuning.
3. The visible glyph size is materially larger in WebGL2; no shader clamp silently caps it at the old size.
4. Browser smoke test on `/#/boids` shows a denser flock with faster motion and no blank canvas.
5. Default Boids remains responsive enough for interactive controls.
6. No files unrelated to Boids tuning are modified, except this stage card.

## Out of scope

- Spatial hashing or kernel algorithm rewrite.
- New Boids controls.
- Colour palette redesign.
- Fractal or sandpile tuning.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 20 minutes

## Verifier handoff

Verifier returns:

- `overall: PASS` or `overall: FAIL`.
- Final chosen Boids defaults and bounds.
- `npm run verify` result.
- Browser performance/visual notes.
- Any follow-up recommendation if O(n²) prevents the full 10x target.

## Family-specific notes

- Claude worker: do not commit. Leave changes uncommitted.
- Codex/GPT verifier: pay particular attention to the WebGL glyph clamp and default-frame responsiveness.
