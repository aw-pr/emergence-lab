# Stage card 46-boids-obstacle-render-hone: hone the rock rendering against the stage-45 captures

## Metadata

- **Authored:** 2026-08-19
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** same split as stage 45: Terra implements against
  numeric and structural targets; the Claude verifier owns the aesthetic
  judgement with fresh captures against the stage-45 baseline.

## Objective

Second of the two rendering passes. Stage 45 gave obstacles a rendered
presence; this stage refines it from "drawn" to "belongs in the scene".
Focus areas, to be weighed against the stage-45 verifier captures (read that
verifier artefact first - if stage 45's verifier or handoff flagged specific
weaknesses, those take priority over the generic list):

1. **Silhouette character per layout.** Rocks: vary displacement amplitude
   and lobe count per rock so no two rocks read identical. Breakwaters: a
   weathered, slightly eroded edge rather than uniform noise - lower
   amplitude, longer wavelength along the capsule axis. Reef: both, with
   the arc reading as one broken formation rather than scattered pieces.
2. **Depth cues.** A subtle interior tone gradient (darker core, lighter
   crest) so rocks read as mass rather than flat stamps; the crest
   highlight biased toward faces where flow arrives.
3. **Composition with the flock.** The crowding highlight from boids and
   the rendered crest must reinforce each other, not fight; obstacle
   brightness must never exceed the flock's, so the eye still goes to the
   swarm first.

## Inputs (read these in your own context)

- `state/verifiers/45-boids-obstacle-rendering.json` (what the stage-45 verifier observed)
- `docs/stages/45-boids-obstacle-rendering.md`
- `src/sims/boids/kernel.ts`
- `src/sims/boids/kernel.test.cjs`
- `docs/verification.md`

## Deliverables

1. `src/sims/boids/kernel.ts` - the refinements above, still deterministic
   from layout, amount, and world size.
2. `src/sims/boids/kernel.test.cjs` - determinism and margin tests updated
   for the new displacement scheme; per-rock variation proven (no two rocks
   in the default rocks layout share an identical silhouette); layout
   `"none"` byte-identity preserved.

## Constraints

- Same as stage 45: behaviour and collision geometry untouched; `"none"`
  byte-identical; rasterisation cost at init/layout change; no new
  dependency; no git mutations; stop cleanly on budget exhaustion; relative
  paths; UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green.
2. Verifier-side capture comparison against the stage-45 evidence set: each
   focus area visibly improved or already satisfactory, stated per area
   with captures cited.
3. No two rocks identical in the default rocks layout (test plus capture).
4. Obstacle brightness stays below flock brightness in the default view;
   the swarm remains the dominant read.
5. Layout `"none"` unchanged; smoothness at default boid count maintained.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- User-drawn obstacles; new params or controls; presets, thumbnails, other
  simulations.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 45 minutes

## Verifier handoff

The envelope states what changed per focus area, any stage-45 verifier
flags addressed, and the files touched.

## Family-specific notes

- **Codex (worker):** sandboxed, no browser; aesthetic verdicts are
  verifier-side.
