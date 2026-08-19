# Stage card 42-boids-obstacle-field: breakwaters and rocks that keep the flock from homogenising

## Metadata

- **Authored:** 2026-08-19
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Terra continues the boids kernel line (stage 32 era
  retuning) with pure, testable kernel work its sandbox suits; a cross-family
  Claude verifier drives the browser to judge the one thing the sandboxed
  worker cannot see: whether the flock actually stays heterogeneous.

## Objective

Operator review of the released boids: the opening is the best part - six
ring-arranged flocks bloom in different directions with distinct heading-hue
colours - but the flock conforms soon after, global alignment wins, and the
palette collapses with it (colour is heading, so homogenised headings mean a
homogenised image). Add a static obstacle field - breakwaters and rocks, in
the spirit of groynes on a beach - that breaks long-range alignment so the
flow separates around obstructions and multiple heading domains (and so
multiple colours) persist indefinitely.

Behaviour with the feature off must be exactly the released behaviour. No
renderer changes: obstacles read as negative space in the boid density plus
the crowding highlights that form along their faces.

## Inputs (read these in your own context)

- `src/sims/boids/kernel.ts`
- `src/sims/boids/kernel.test.cjs`
- `docs/verification.md`

Do not read other simulations unless a shared API makes that necessary.

## Deliverables

1. `src/sims/boids/kernel.ts` - the obstacle field:
   - Two new params appended to the schema, with info text matching the
     house style of the existing boids params:
     - `obstacleLayout`: options `["none", "breakwaters", "rocks", "reef"]`,
       default `"none"`. `breakwaters`: a staggered series of elongated
       capsule segments oriented across the bottom-left to top-right flow
       diagonal, like groynes along a beach. `rocks`: scattered circles of
       varied radius. `reef`: a broken arc combining segments and circles.
     - `obstacleAmount`: min 0.1, max 1, step 0.05, default 0.5 - scales
       obstacle size and count together within each layout.
   - Placement is a deterministic pure function of layout, amount, and world
     size: no randomness at placement time, so the same settings always give
     the same field.
   - Steering: torus-aware distance to obstacle surfaces; a repulsion ramp
     inside an avoidance radius plus a tangential deflection component so
     boids slide along faces rather than stalling against them; after
     integration, hard position resolution so no boid ever ends a step
     inside an obstacle. Obstacles interact with the existing flocking,
     wander, and pointer-impulse forces rather than replacing them.
   - With `obstacleLayout` at `"none"` the obstacle code path is skipped
     entirely: identical arithmetic, identical RNG consumption, identical
     output to the pre-stage kernel.
2. `src/sims/boids/kernel.test.cjs` - extended pure tests:
   - schema assertions for both new descriptors (options, defaults, min,
     max, step);
   - layout `"none"`: stepped state identical to a pre-stage fixture run
     (same init, same step count, byte-equal `readState` output);
   - determinism of placement: two kernels with identical params produce
     identical obstacle-adjacent behaviour on a fixed synthetic scenario;
   - no-penetration invariant: for each of the three active layouts, after a
     few hundred steps no boid position lies inside any obstacle;
   - pointer impulse still functions with obstacles active.

## Constraints

- No renderer, registry, preset, or thumbnail changes. The two new schema
  descriptors are the only surface the app sees.
- Factory defaults leave the released behaviour untouched: `"none"` is the
  default layout and the default run of the sim is unchanged.
- No new dependency. Do not commit anything under `.cache/`.
- Existing param semantics, defaults, and info text are unchanged.
- Worker must not run `git add`, `git commit`, or any git mutation. The
  dirty worktree plus final handoff envelope is the deliverable.
- If the full stage cannot be completed inside the worker budget, stop
  cleanly, preserve the best coherent partial result, and report every
  unfinished item in the handoff envelope rather than waiting for input.
- Use relative paths in committed files. UK English, no em dash.

## Acceptance criteria

The verifier will check every criterion. Any unmet criterion is a stage failure.

1. `npm run verify` is green.
2. Schema exposes `obstacleLayout` and `obstacleAmount` exactly as specified,
   with info text in the house style, and the factory default is `"none"`.
3. Pure tests prove the `"none"` path is byte-identical to the pre-stage
   kernel over a multi-hundred-step fixture run.
4. Pure tests prove the no-penetration invariant for all three active
   layouts and deterministic placement.
5. Verifier-side visual check: run `breakwaters` at default amount for at
   least 60 seconds of sim time and capture stills near the start and end;
   the late capture must still show multiple distinct heading-hue colour
   domains, where a parallel `none` run of the same duration has visibly
   converged towards uniform colour. Both comparisons captured and cited.
6. Verifier-side visual check: obstacles read clearly as negative space with
   flow deflecting around them in `breakwaters`, `rocks`, and `reef`; no
   boid visibly sits inside an obstacle; no console or WebGL errors.
7. Pointer impulse works with obstacles active.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Renderer or app-layer changes of any kind; presets and thumbnails; the
  native emergence-viewer port; other simulations.
- Tuning the released boids defaults.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 45 minutes

## Verifier handoff

The worker's handoff envelope must state: the geometry of each layout (how
many obstacles, their shapes and placement rule), the avoidance-force shape
and constants chosen, confirmation that the `"none"` path is untouched with
the fixture evidence, and the list of files touched. The verifier re-runs the
pure tests, then performs the browser comparisons in criteria 5 and 6.

## Family-specific notes

- **Codex (worker):** the sandbox cannot reach the window server; do not
  attempt to launch a browser. All worker-side evidence comes from the pure
  tests. Browser captures are verifier-side only.
