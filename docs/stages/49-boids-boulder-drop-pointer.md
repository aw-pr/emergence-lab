# Stage card 49-boids-boulder-drop-pointer: the pointer drops boulders in every layout

## Metadata

- **Authored:** 2026-08-20
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Terra owns the obstacle kernel API and the stage-47
  pointer routing; the Claude verifier exercises the interaction end to end
  in the browser, which the sandboxed worker cannot.

## Objective

Operator decision after reviewing stages 42 to 48: boulder-dropping becomes
the pointer's job in boids everywhere, not a mode. The flock-nudge impulse
goes away for boids; other simulations keep it exactly.

Design: user-dropped obstacles become an **overlay** that exists
independently of the preset layout.

- In any layout (reef, rocks, breakwaters, none, custom), a click drops a
  boulder (the stage-47 rock gesture), a drag lays a breakwater capsule,
  and a click on a user-dropped obstacle removes it. This matches the
  matter-dropping pointer feel of the other sims rather than an invisible
  nudge.
- The overlay sits on top of whatever the preset generates. Switching
  layouts regenerates the preset underneath and keeps the overlay.
  `"custom"` now simply means an empty preset under the overlay; its
  stage-47/48 behaviour is otherwise the model for everything.
- Removal applies to overlay obstacles only. Preset obstacles stay
  deterministic and untouchable, so a layout always looks like itself.
- The stage-48 chrome generalises: the gesture hint can appear in any
  layout on first use; Clear empties the overlay only; the short-drag
  threshold and session persistence carry over unchanged.

## Inputs (read these in your own context)

- `src/sims/boids/kernel.ts`
- `src/sims/boids/kernel.test.cjs`
- `src/app/simView.ts` (stage-47 pointer routing and stage-48 HUD)
- `src/app/pointerImpulse.ts`
- `docs/stages/47-boids-custom-obstacles.md`
- `docs/stages/48-boids-custom-obstacles-polish.md`
- `state/verifiers/48-boids-custom-obstacles-polish.json`
- `docs/verification.md`

## Deliverables

1. `src/sims/boids/kernel.ts` - the overlay model: user edits held
   separately from the preset field, composed into one collision and
   rendered set; the stage-47 edit API retargeted at the overlay; layout
   switches rebuild the preset under an untouched overlay; the obstacle
   bound applies to the composed total with the same stated policy.
2. `src/app/simView.ts` / `src/app/pointerImpulse.ts` - boids pointer input
   always routes to obstacle editing; the impulse path is no longer
   reachable for boids and is byte-identical for every other simulation.
3. Stage-48 chrome updated: hint and Clear work in all layouts; Clear
   labels itself as clearing dropped boulders.
4. `src/sims/boids/kernel.test.cjs` - overlay survives layout switches;
   preset determinism with a non-empty overlay; removal hits overlay
   obstacles only; `"none"` with an empty overlay stays byte-identical to
   pre-stage; composed bound behaviour.

## Constraints

- Other simulations' pointer behaviour, chrome, and tests are untouched.
- Preset layouts remain deterministic from layout, amount, and world size;
  the overlay never feeds back into preset generation.
- No new dependency; no git mutations by the worker; stop cleanly on
  budget exhaustion; relative paths; UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green.
2. Verifier-side: on the default reef layout, click drops a rendered
   boulder the flock deflects around; drag lays a breakwater; clicking a
   dropped boulder removes it; clicking a reef preset rock does not.
3. Verifier-side: no flock-nudge impulse remains anywhere in boids;
   another simulation still has its impulse pointer unchanged.
4. Verifier-side: overlay survives switching reef to rocks and back and a
   boid-count change; Clear empties only the overlay.
5. No console or WebGL errors during an edit session.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Saving, naming, export or import of layouts (stage 50); rock imagery
  (stage 51); presets, thumbnails, other simulations.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 45 minutes

## Verifier handoff

The envelope states: the overlay representation, how composition feeds
collision and rendering, the bound policy over the composed set, the
routing change, and the files touched.

## Family-specific notes

- **Codex (worker):** sandboxed, no browser; interaction evidence is
  verifier-side. Keep the overlay API pure and unit-testable.
