# Stage card 44-boids-obstacles-promote: obstacles to the top of the pane, reef by default

## Metadata

- **Authored:** 2026-08-19
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Terra continues its stage-42 obstacle work with a
  small, testable change; the cross-family Claude verifier confirms the pane
  ordering and the new default visually in the browser.

## Objective

Operator review of stage 42: the obstacle field is approved and should be
promoted from a hidden extra to the sim's signature. Two changes:

1. `obstacleLayout` and `obstacleAmount` move to the top of the boids
   parameter pane, first and second among the sim's controls.
2. The factory default for `obstacleLayout` becomes `"reef"`, so the released
   view opens with the obstacle field active and the flock never homogenises.

## Inputs (read these in your own context)

- `src/sims/boids/kernel.ts`
- `src/sims/boids/kernel.test.cjs`
- `src/app/simView.ts` (check the hardcoded `PARAM_GROUPS` table: it claims
  keys before schema-native groups for boids, so pane ordering may be
  governed there rather than by schema order)
- `docs/verification.md`

## Deliverables

1. `src/sims/boids/kernel.ts` - schema reordered so the two obstacle
   descriptors come first; `obstacleLayout` default `"reef"`.
2. `src/app/simView.ts` - only if the `PARAM_GROUPS` table (or any app-side
   ordering) would otherwise override the schema order for boids: the
   minimal change so the obstacle controls actually appear first.
3. `src/sims/boids/kernel.test.cjs` - default assertions updated
   (`obstacleLayout` default `"reef"`); the layout-`"none"` byte-identity
   fixture is kept and still passes when `"none"` is selected explicitly.

## Constraints

- No behaviour change beyond the default and the ordering: obstacle
  geometry, steering, and all other params are untouched.
- Other sims' panes are unaffected by any `simView.ts` change.
- Worker must not run `git add`, `git commit`, or any git mutation.
- If the stage cannot be completed inside the budget, stop cleanly and
  report every unfinished item in the handoff envelope.
- Use relative paths in committed files. UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green.
2. Schema and tests assert `obstacleLayout` default `"reef"` and the
   explicit-`"none"` byte-identity fixture still passes.
3. Verifier-side browser check: the boids pane shows Obstacle layout and
   Obstacle amount as the first two controls; a fresh load opens with the
   reef visible and the flock deflecting around it; other sims' panes are
   unchanged.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Obstacle rendering changes (stage 45), user-drawn obstacles (stage 47),
  presets, thumbnails, other simulations.

## Budget

- **Worker wall-clock:** 30 minutes
- **Verifier wall-clock:** 20 minutes

## Verifier handoff

The envelope states what governed pane ordering (schema or `PARAM_GROUPS`),
the files touched, and confirms the `"none"` fixture still passes.

## Family-specific notes

- **Codex (worker):** sandboxed, no browser; pane-order evidence is
  verifier-side.
