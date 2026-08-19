# Stage card 45-boids-obstacle-rendering: obstacles rendered as rock, not absence

## Metadata

- **Authored:** 2026-08-19
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Terra owns the obstacle field it built; the
  cross-family Claude verifier judges the one thing the sandboxed worker
  cannot: whether the obstacles now read as rocks and breakwaters rather
  than holes.

## Objective

Stage 42's obstacles render only as negative space: dark voids shaped by the
flock avoiding them. Operator direction: give the obstacles a rendered
presence of their own, so they read as geological forms, with fractal
character rather than clean geometric primitives. Rocks should look like
rocks: irregular, fractal-displaced silhouettes; breakwaters like weathered
structures.

The worker chooses the rendering route and records the reasoning in the
handoff, within these bounds:

- Prefer the kernel-side route: rasterise the obstacle field into the state
  the kernel already publishes (an obstacle channel or a reserved value
  band in an existing channel), so the existing renderer pipeline draws it
  and app-layer changes stay minimal. An app-side overlay is acceptable only
  if the channel route is genuinely unworkable; say why in the handoff.
- The rendered shape must be the fractal-displaced silhouette, but the
  collision geometry stays the stage-42 capsules and circles. The
  displacement stays inside a stated margin of the collision surface so no
  boid visibly overlaps rendered rock and no rendered rock floats detached
  from where boids deflect.
- Fractal displacement is deterministic: a fixed-seed value-noise or
  midpoint-displacement function of layout, amount, and world size. Same
  settings, same rocks, every run.
- Palette: the rock tones must sit inside the sim's existing colour system
  and read in both light and dark of the obstacle: a body tone distinct
  from the boid hues plus a subtle rim or crest highlight along faces where
  boids crowd. No new colour controls in this stage.

## Inputs (read these in your own context)

- `src/sims/boids/kernel.ts`
- `src/sims/boids/kernel.test.cjs`
- `src/app/registry.ts` (boids channel wiring)
- `src/app/colormap.ts` (only as needed to understand channel mapping)
- `docs/verification.md`

## Deliverables

1. `src/sims/boids/kernel.ts` - deterministic fractal-displaced obstacle
   silhouettes rasterised into the published state, per the bounds above.
2. `src/sims/boids/kernel.test.cjs` - tests proving: rasterisation is
   deterministic across two kernels with identical params; the rendered
   silhouette stays within the stated margin of the collision surface;
   layout `"none"` publishes state byte-identical to pre-stage; obstacle
   values never corrupt the boid-density/heading channels' documented
   ranges.
3. Only if the channel route requires it: minimal wiring in
   `src/app/registry.ts` for the obstacle channel, with the reasoning in
   the handoff.

## Constraints

- Flocking behaviour, steering, and collision geometry are untouched: this
  stage changes what is drawn, never how boids move.
- Layout `"none"` remains byte-identical to the pre-stage kernel.
- Per-step cost of the obstacle rasterisation is paid at init or layout
  change, not per frame, unless the handoff justifies otherwise with
  numbers.
- No new dependency. Worker must not run git mutations. Stop cleanly on
  budget exhaustion with a full report.
- Use relative paths in committed files. UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green, including the new determinism, margin,
   byte-identity, and channel-range tests.
2. Verifier-side browser check, all three layouts: obstacles are visibly
   rendered forms with irregular fractal silhouettes - rocks read as rocks,
   breakwaters as built structures - not plain geometric primitives and not
   mere voids; captures cited.
3. Verifier-side: no boid visibly overlaps rendered rock; deflection
   happens where the rock is drawn; rim/crest highlight visible where the
   flock crowds a face.
4. Rock tones sit harmoniously in the existing palette in the default view
   (verifier judgement, captures cited); boid hues remain the dominant
   read.
5. Layout `"none"` is visually and byte-identical to pre-stage.
6. No frame-rate collapse: the sim remains smooth at default boid count
   (verifier observes; any measured per-frame cost stated in the handoff).

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- User-drawn obstacles (stage 47); new colour controls; presets and
  thumbnails; other simulations; collision-geometry changes.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 45 minutes

## Verifier handoff

The envelope states: the chosen route (channel vs overlay) and why, the
noise function and margin constant, where the per-layout rasterisation cost
is paid, and the files touched.

## Family-specific notes

- **Codex (worker):** sandboxed, no browser; all visual judgement is
  verifier-side. Design for the verifier's captures: deterministic output
  it can reproduce.
