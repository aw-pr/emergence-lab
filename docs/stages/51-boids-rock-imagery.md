# Stage card 51-boids-rock-imagery: funky imagery for rocks and reefs

## Metadata

- **Authored:** 2026-08-20
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** as stages 45 and 46: Terra implements against
  structural and numeric targets; the Claude verifier owns the aesthetic
  verdict with captures against the stage-46 baseline.

## Objective

Third rendering pass. Stages 45 and 46 made obstacles read as weathered
mass; the operator now wants them to be visually interesting in their own
right. Build on the existing kernel-side deterministic raster; go further
on texture and character:

1. **Interior life.** Multi-octave interior texture: striation bands
   following each rock's long axis, pitting, lichen or mineral flecks as
   sparse accents; parameters varied per rock so no two share a pattern.
2. **Reef character.** The reef layout reads as a living formation:
   subtle colour accents distinct from plain rocks (worn coral tones
   within the app's palette discipline), the arc unified by a shared
   texture family with local variation.
3. **Waterline.** A restrained foam or wash ring where flock flow meets
   an obstacle: driven by the existing crowding signal, so busy faces
   glow with wash and lee faces stay quiet.
4. **User boulders.** Stage-49 dropped boulders get the same treatment
   from a per-obstacle seed, so drawn fields look as good as presets.

The swarm remains the star: obstacle brightness stays below flock
brightness in the default view, as stage 46 established.

## Inputs (read these in your own context)

- `state/verifiers/46-boids-obstacle-render-hone.json`
- `docs/stages/45-boids-obstacle-rendering.md`
- `docs/stages/46-boids-obstacle-render-hone.md`
- `src/sims/boids/kernel.ts`
- `src/sims/boids/kernel.test.cjs`
- `docs/verification.md`

## Deliverables

1. `src/sims/boids/kernel.ts` - the imagery above, deterministic from
   layout, amount, world size and per-obstacle seed; rasterisation cost
   still paid at init, layout change, or overlay edit, never per frame.
2. `src/sims/boids/kernel.test.cjs` - determinism tests updated; per-rock
   texture variation proven; `"none"` byte-identity preserved; overlay
   boulders textured deterministically from their seed.

## Constraints

- Behaviour and collision geometry untouched; visual only.
- No new dependency, no image assets, no network: everything procedural.
- Frame-rate at default boid count is not measurably worse than stage 46.
- No git mutations by the worker; stop cleanly on budget exhaustion;
  relative paths; UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green.
2. Verifier-side capture comparison against the stage-46 evidence: each
   focus area visibly richer, stated per area with captures cited.
3. No two rocks share a texture pattern; reef reads distinct from rocks.
4. Obstacle brightness stays below flock brightness in the default view.
5. `"none"` unchanged; smoothness at default boid count maintained; no
   console or WebGL errors.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Behavioural changes; new params or controls; presets, thumbnails, other
  simulations.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 45 minutes

## Verifier handoff

The envelope states what changed per focus area, the per-obstacle seeding
scheme, the measured rasterisation cost, and the files touched.

## Family-specific notes

- **Codex (worker):** sandboxed, no browser; aesthetic verdicts are
  verifier-side. Make texture parameters pure functions of the seed so
  variation is provable in tests.
