# Stage card 47-boids-custom-obstacles: the user draws their own obstacles

## Metadata

- **Authored:** 2026-08-19
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Terra extends the kernel API it owns; the Claude
  verifier exercises the pointer interaction end to end in the browser,
  which the sandboxed worker cannot.

## Objective

First of two stages making obstacles user-authorable. Let the user place
their own rocks and breakwaters instead of (or on top of) a preset layout,
so they can sculpt the flow themselves.

Interaction model:

- A new `"custom"` option on `obstacleLayout`. Selecting it starts from an
  empty field (later switching back to a preset restores that preset
  exactly).
- While layout is `"custom"`, pointer input on the canvas edits obstacles
  instead of nudging the flock: a click places a rock (radius scaled by
  `obstacleAmount`), a drag lays a breakwater capsule along the drag path,
  and a click on an existing obstacle removes it. Outside `"custom"`, the
  pointer keeps its existing impulse behaviour everywhere.
- Edits apply live: steering, no-penetration resolution, and the stage-45
  rendered rock form all take effect for a placed obstacle immediately,
  without resetting the flock.

## Inputs (read these in your own context)

- `src/sims/boids/kernel.ts`
- `src/sims/boids/kernel.test.cjs`
- `src/app/simView.ts` (pointer routing)
- `src/app/pointerImpulse.ts`
- `docs/verification.md`

## Deliverables

1. `src/sims/boids/kernel.ts` - `"custom"` layout option; an obstacle-edit
   API on the kernel (place rock at point, place capsule between points,
   remove at point, clear), deterministic and bounded (a stated maximum
   obstacle count with oldest-first replacement or a refusal, worker's
   choice, stated in the handoff); live rebuild of the collision and
   rendered forms on edit without flock reset.
2. `src/app/simView.ts` / `src/app/pointerImpulse.ts` - pointer routing:
   edit gestures reach the kernel only when boids is active and layout is
   `"custom"`; all other sims and layouts keep existing pointer behaviour
   exactly.
3. `src/sims/boids/kernel.test.cjs` - tests for the edit API: place, drag
   capsule, remove, clear, the bound behaviour, live-edit without state
   reset (boid array untouched apart from collision resolution), preset
   layouts unaffected by prior custom edits, `"none"` byte-identity
   preserved.

## Constraints

- No new UI chrome in this stage: the only surface is the `"custom"` option
  and pointer gestures. Buttons and hints are stage 48.
- Preset layouts and their determinism are untouched; `"none"` stays
  byte-identical to pre-stage.
- Custom obstacles need not persist across page reload in this stage.
- No new dependency; no git mutations by the worker; stop cleanly on budget
  exhaustion with a full report; relative paths; UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green, including the new edit-API tests.
2. Verifier-side browser check: in `"custom"`, click places a rendered rock
   the flock deflects around immediately; drag lays a breakwater along the
   path; clicking an obstacle removes it; the flock is not reset by edits.
3. Verifier-side: outside `"custom"` (other layouts, other sims) pointer
   behaviour is unchanged; switching `"custom"` to a preset restores the
   preset exactly and back to `"custom"` returns to the drawn field within
   the same session.
4. The obstacle bound behaves as stated in the handoff.
5. No console or WebGL errors during an edit session.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Edit-mode UI chrome, hints, undo, persistence across reload (stage 48);
  presets, thumbnails, other simulations.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 45 minutes

## Verifier handoff

The envelope states: the edit-API surface, the obstacle bound and its
behaviour, how pointer routing decides edit vs impulse, and the files
touched.

## Family-specific notes

- **Codex (worker):** sandboxed, no browser; interaction evidence is
  verifier-side. Make the edit API unit-testable so your own confidence
  comes from the pure tests.

## Re-brief (2026-08-20, after verifier FAIL on attempt 1)

Attempt 1 is preserved at commit `ff6c6dd` on branch
`wip/47-custom-obstacles-attempt-1`. Reuse it: cherry-pick or re-apply that
work rather than starting over. Four of five criteria passed; the single
failure and its exact fix:

- **Defect:** obstacles land vertically mirrored from the pointer, so
  click-remove also misses. `src/app/simView.ts:611-622` maps `clientY`
  straight through `((clientY - rect.top) / rect.height * height)` with
  neither the WebGL2 y-flip nor the letterbox contain-rect.
- **Fix:** reuse the established impulse mapping in
  `src/app/renderer.ts:430` and `:442` (`gridHeight - yTop` for
  `backend.kind === "webgl2"`, plus the contain-rect), or extract that
  mapping into a shared helper and call it from both paths. Do not
  hand-roll a second mapping.
- Everything else from attempt 1 stands as passed: the kernel edit API,
  live rebuild, bounds, preset restoration, and test coverage.
