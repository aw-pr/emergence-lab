# Stage card 16-sandpile-larger-slower: Larger slower Abelian Sandpile

## Metadata

- **Authored:** 2026-05-27
- **Orchestrator:** GPT-5.5 <gpt-5-5@local>
- **Worker:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Verifier:** GPT-5.5 <gpt-5-5@local>
- **Pairing rationale:** Codex/GPT defines the model-specific tuning target; Claude executes the sandpile-only change; Codex/GPT verifies kernel tests and visible pacing.

## Objective

Make Abelian Sandpile feel bigger and slower.

User target:

- Make the sandpile bigger.
- Slow it down by about 5x.
- Commit this independently from other model fixes.

Current baseline:

- `initialPile` default `100000`, max `500000`.
- `grainsPerStep` default `4`.
- `topplesPerStep` default `50000`.
- `speedProfileFor("abelian-sandpile")` initial simulation speed `4`.

## Inputs (read these in your own context)

- `src/sims/abelian-sandpile/kernel.ts`
- `src/sims/abelian-sandpile/kernel.test.cjs`
- `src/app/simView.ts`
- `src/app/colormap.ts` (read-only unless colour range needs minor visibility adjustment)
- `docs/INTERFACE.md` (read-only)
- `docs/verification.md`

## Deliverables

1. Sandpile defaults tuned so the default pattern is larger.
2. Sandpile pacing tuned so visible evolution is about 5x slower than the current default.
3. Kernel tests updated for changed defaults.
4. Browser smoke notes in the worker handoff explaining the chosen tradeoff between visible scale and startup responsiveness.

## Constraints

- Edit Abelian Sandpile and directly required speed-profile/test files only.
- Do not change other simulations.
- Do not change the SimKernel contract.
- Preserve deterministic kernel behaviour.
- Keep default startup nonblank and responsive.
- Do not run `git commit` from the worker phase.

## Acceptance criteria

1. `npm run verify` passes.
2. Abelian Sandpile defaults/tests reflect a larger default pile or equivalent larger visible pattern.
3. The default visual pace is about 5x slower than the current published version, either through kernel defaults, `speedProfileFor`, or both.
4. Browser smoke test on `/#/abelian-sandpile` shows a larger pattern forming without freezing the UI.
5. No files unrelated to Abelian Sandpile tuning are modified, except this stage card.

## Out of scope

- New sandpile rendering mode.
- GPU acceleration.
- Colour palette redesign unless the larger pattern becomes unreadable.
- Fractal or Boids tuning.

## Budget

- **Worker wall-clock:** 35 minutes
- **Verifier wall-clock:** 15 minutes

## Verifier handoff

Verifier returns:

- `overall: PASS` or `overall: FAIL`.
- Final sandpile defaults and speed-profile values.
- `npm run verify` result.
- Browser notes on size, pace, and responsiveness.

## Family-specific notes

- Claude worker: do not commit. Leave changes uncommitted.
- Codex/GPT verifier: compare defaults against the current baseline listed in this card.
