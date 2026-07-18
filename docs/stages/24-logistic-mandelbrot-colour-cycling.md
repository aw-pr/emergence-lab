# Stage card 24-logistic-mandelbrot-colour-cycling: Logistic Mandelbrot — synchronised colour cycling

## Metadata

- **Authored:** 2026-07-18
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** The design is fully decided (colour driver, sync model, palette source, mode wiring are all specified below), so this is precise plumbing across shaders and the renderer, a good fit for the Sol tier. Fable authored the spec and cross-family-verifies the mechanics against it.

## Objective

Bring palette colour cycling to the 3D logistic Mandelbrot, synchronised
between the point cloud and the 2D Mandelbrot ground plane. Looking
straight down gives the familiar 2D cycling; in 3D the cycling chases
colour through the cloud by iteration order.

1. **New colour mode `cycle`** joins `period | height | mono` in the
   `colourMode` enum, with a new `cycleSpeed` number param (default 0.1,
   min 0, max 5, step 0.001) mirroring the 2D Mandelbrot kernel's param.
2. **Cloud colour driver is the iteration index n**: a point's palette
   position is `n / sampleCount`, where n is which orbit sample the
   point is (the 3D analogue of 2D escape-iteration bands). Load-bearing
   data-layout fact: point positions are stored sample-major; after
   build compaction the buffer index is `sample * survivingCells + slot`
   (see the build slice and `copyWithin` compaction in
   `src/app/orbit3d.ts`). Therefore the vertex shader derives
   `n = gl_VertexID / u_cellCount` (integer division; WebGL2 guarantees
   `gl_VertexID`). The renderer knows
   `survivingCells = fullPointCount / sampleCount`; pass it as a uniform.
   Do not add a new vertex attribute.
3. **Palette follows the picker**: in cycle mode the point shader
   samples the renderer's existing 256x1 `fractalPaletteTexture` (built
   by `updateFractalPalette` from the active colour options) at
   `fract(n / u_sampleCount + u_phase)`. Soften the sampled colour
   toward white and scale as the existing modes do (the
   `mix(hue, vec3(1.0), 0.12..0.2) * 1.1` idiom) so additive HDR
   stacking saturates gracefully instead of clipping.
4. **Ground plane cycles in sync**: one phase value per frame, computed
   in `drawOrbit3d` from elapsed simulation time x `cycleSpeed`, drives
   both the cloud's `u_phase` and the ground texture's `u_palettePhase`.
   While cycling (mode `cycle` and `cycleSpeed > 0`) the ground quad is
   redrawn each frame with the live phase; otherwise the existing
   cached-by-palette-key behaviour is preserved unchanged. The fractal
   shader's interior guard (`value > 0.001 && value < 0.999` for
   non-cyclic palettes) keeps the set interior black; do not change it.
   Cycling must freeze when the sim is paused (reuse the frame timing
   already flowing into the renderer; do not introduce wall-clock time).
5. **Default palette**: add a `logistic-mandelbrot` case to
   `defaultColourOptionsFor` in `src/app/colormap.ts` returning inferno
   with the same tuning as the mandelbrot/julia-set case (gamma 0.68,
   contrast 1.5), so the sim matches the 2D Mandelbrot by default and
   the palette picker still works for both plane and cloud.

## Inputs (read these in your own context)

- `src/app/orbit3d.ts` (point pipeline, shaders, draw path)
- `src/app/webglRenderer.ts` (drawOrbit3d, ensureOrbit3dGround,
  updateFractalPalette, fractal fragment shader palettePhase handling)
- `src/sims/logistic-mandelbrot/kernel.ts` (paramSchema)
- `src/sims/mandelbrot/kernel.ts` (the 2D cycling idiom being mirrored;
  read-only)
- `src/app/colormap.ts` (defaultColourOptionsFor)
- `src/sims/logistic-mandelbrot/kernel.test.cjs` (existing test idiom)
- `essays/logistic-mandelbrot.md`
- `docs/verification.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/sims/logistic-mandelbrot/kernel.ts` — `colourMode` enum gains
   `"cycle"`; new `cycleSpeed` param descriptor.
2. `src/app/orbit3d.ts` — colour mode 3 in the point vertex shader
   (palette-texture sample by iteration index plus phase); new uniforms
   (palette sampler, `u_phase`, `u_cellCount`, `u_sampleCount`);
   `draw()` extended to accept the palette texture and phase; palette
   texture bound on a unit that does not clash with the ground texture
   on TEXTURE0.
3. `src/app/webglRenderer.ts` — single per-frame phase source in
   `drawOrbit3d`; `ensureOrbit3dGround` accepts the live phase and
   redraws per frame only while cycling; palette texture handed to the
   orbit3d draw.
4. `src/app/colormap.ts` — `logistic-mandelbrot` default case (inferno,
   gamma 0.68, contrast 1.5).
5. `src/sims/logistic-mandelbrot/kernel.test.cjs` — schema assertions
   for the new enum value and `cycleSpeed` bounds.
6. `essays/logistic-mandelbrot.md` — one sentence in the "what to try"
   section mentioning the cycle mode.

## Constraints

- `period`, `height`, and `mono` modes and the default look must be
  pixel-identical to HEAD (regression baseline); default `colourMode`
  stays `period`.
- Sweep glow (fan, slice, and marker varyings) composes on top of cycle
  colours unchanged.
- No new render passes; extend the existing point and ground pipeline.
- Do not regenerate thumbnails (the default look is unchanged).
- With `cycleSpeed = 0` or mode not `cycle`, the ground texture cache
  behaves exactly as at HEAD (no per-frame redraw).
- UK English; no em dashes in card-facing copy or essay text.
- Do not run `git commit`, `git add`, or any git mutation; the dirty
  working tree is the deliverable.
- Use relative paths; never embed absolute home-directory paths.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes (unit tests, TypeScript, Vite build);
   stages 17-23 behaviour stays green.
2. `cycle` mode is selectable from the generated controls and the
   colour provably derives from the iteration index via `gl_VertexID`
   and the cell-count uniform (code-level check of the attribute and
   uniform flow).
3. The cloud and the ground plane are driven by the same phase value
   each frame (single source of truth in `drawOrbit3d`).
4. With `cycleSpeed = 0` or mode not `cycle`, ground texture caching is
   unchanged from HEAD (no per-frame redraw path is taken).
5. `logistic-mandelbrot` defaults to inferno, and changing the palette
   picker changes both the plane and the cloud in cycle mode.
6. The existing three modes are pixel-equivalent to HEAD (shader path
   diff shows their branches untouched).

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Promo Flow republish (separate later step).
- Preset changes and thumbnail regeneration.
- Any change to `src/sims/mandelbrot/kernel.ts` or the 2D fractal
  cycling behaviour.
- Density-based or orbit-trap colouring; note as future ideas in the
  handoff envelope notes if tempting.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 15 minutes

## Verifier handoff

Worker returns: files changed, `npm run verify` output, a one-line note
on where the single phase source lives, and per-criterion smoke notes.
Verifier returns `overall: PASS|FAIL` with per-criterion results.

## Family-specific notes

- Codex/GPT worker: headless `codex exec`; do not wait on stdin; write
  the handoff envelope to
  `state/handoffs/24-logistic-mandelbrot-colour-cycling.json` as your
  final action.
- Claude verifier: criterion 6's equivalence is checkable by diffing the
  period/height/mono shader branches against git HEAD's.
