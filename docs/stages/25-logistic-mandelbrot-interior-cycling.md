# Stage card 25-logistic-mandelbrot-interior-cycling: Logistic Mandelbrot — cycle mode colours the cloud from the c-plane

## Metadata

- **Authored:** 2026-07-18
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** Re-brief of stage 24 with a corrected colour driver after user review; same fully specified plumbing shape, same cross-family pairing.

## Objective

Stage 24 drove cycle-mode point colours by iteration index. User review
showed that reads as an unchanged near-white cloud, and the intended
semantics are different: a cloud point should wear the colour the 2D
Mandelbrot view has at its (x, y) position, so looking straight down
matches the 2D cycling and rotating the camera reveals those colours
draped over the 3D sheets. The cloud stands over the set's interior,
which escape-time colouring leaves black, so the interior continues the
exterior bands inward using the attracting cycle's multiplier:

1. **Interior measure per cell.** The map is z <- z^2 + c with
   derivative 2z, so a period-q attracting cycle has multiplier
   lambda = product of 2*z_i over the q cycle points, with |lambda| in
   [0, 1) inside a bulb, 0 at superattracting centres, and 1 on the
   bulb boundary. Compute m = |lambda| in
   `src/sims/logistic-mandelbrot/model.ts` at the point where
   `sampleAttractorCell` has just detected the period: the live (zr, zi)
   sits on the cycle, so iterate q further steps accumulating the
   product of |2z| (accumulate via logs or running product; clamp the
   result to [0, 1]). Cells that survive but have no detected period
   (chaotic band) take m = 1. Escaped cells need no measure. Keep
   `sampleAttractorCell`'s existing signature working for existing
   callers; expose the measure through an optional out-parameter or a
   sibling function, worker's choice.
2. **Plumb m per point.** In `src/app/orbit3d.ts` carry m per surviving
   cell, replicated per sample, exactly as the period attribute already
   is (parallel buffer, same layout and compaction). New attribute
   `a_interior`.
3. **Cycle branch samples the palette by m.** Replace the stage 24
   iteration-index branch: colour mode 3 becomes
   `texture(u_palette, vec2(fract(a_interior + u_phase), 0.5)).rgb`,
   softened toward white and scaled exactly as the other branches
   (the `mix(hue, vec3(1.0), 0.16) * 1.1` idiom). Remove the now-dead
   `u_cellCount` and `u_sampleCount` uniforms and their plumbing.
   Rationale for the seam: the exterior escape-time value approaches 1
   at the boundary and m also approaches 1 there, so the plane's bands
   and the cloud's rings meet at the set edge and cycle in step under
   the shared phase.
4. **Suppress the sweep light in cycle mode.** In
   `src/app/webglRenderer.ts` `drawOrbit3d`, force the fan-active flag
   off when the colour mode is `cycle` (both the point pass and the
   ground `u_fanActive`), so the moving tracer light, wake, and slice
   glow disappear in this mode. Do not stop the sweep parameter or the
   camera choreography; the camera keeps rotating exactly as now, and
   all other colour modes keep the sweep light unchanged.
5. Stage 24's synchronised ground cycling, phase source, cache
   semantics, palette wiring, and inferno default are correct; keep
   them.

## Inputs (read these in your own context)

- `docs/stages/24-logistic-mandelbrot-colour-cycling.md` (the
  superseded brief, for context)
- `src/sims/logistic-mandelbrot/model.ts`
- `src/app/orbit3d.ts`
- `src/app/webglRenderer.ts` (drawOrbit3d, ensureOrbit3dGround)
- `src/sims/logistic-mandelbrot/kernel.test.cjs` and the model's
  existing test idiom in the same file
- `essays/logistic-mandelbrot.md`
- `docs/verification.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/sims/logistic-mandelbrot/model.ts` — interior measure
   computation alongside period detection.
2. `src/app/orbit3d.ts` — `a_interior` attribute buffer and the
   rewritten colour mode 3 branch; stage 24 index uniforms removed.
3. `src/app/webglRenderer.ts` — fan-active forced off in cycle mode.
4. `src/sims/logistic-mandelbrot/kernel.test.cjs` — measure tests using
   the period-1 closed form |lambda| = |1 - sqrt(1 - 4c)| on the real
   axis: c = 0 gives m = 0, c = -0.5 gives m = sqrt(3) - 1 within 1e-2,
   c = 0.24 gives m = 0.8 within 1e-2; a chaotic cell (for example
   c = -1.9) gives m = 1; an escaped cell still returns ESCAPED.
5. `essays/logistic-mandelbrot.md` — adjust the existing cycle-mode
   sentence to say the palette bands continue from the plane into the
   cloud (one sentence, UK English, no em dashes).

## Constraints

- `period`, `height`, and `mono` modes stay pixel-identical; default
  mode stays `period`; `cycleSpeed` param unchanged.
- Sweep light behaviour in non-cycle modes is unchanged, and the sweep
  and camera animation logic itself is untouched.
- Ground cache semantics from stage 24 unchanged (cached when not
  cycling, per-frame redraw only while cycling, phase-0 redraw on
  stop).
- No new render passes.
- Do not regenerate thumbnails.
- Do not run `git commit`, `git add`, or any git mutation; the dirty
  working tree is the deliverable.
- Use relative paths; never embed absolute home-directory paths.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes; stages 17-24 behaviour stays green.
2. Colour mode 3 samples the palette at `fract(a_interior + u_phase)`
   where `a_interior` is fed from the model's multiplier measure; the
   stage 24 `u_cellCount` and `u_sampleCount` uniforms are gone.
3. The measure tests in deliverable 4 pass and encode the closed-form
   values stated there.
4. In cycle mode the fan-active flag reaching both the point pass and
   the ground shader is false regardless of the `realAxisSweep` param;
   in other modes it follows the param exactly as at HEAD; the camera
   sweep choreography code is untouched.
5. Stage 24 ground cycling and cache semantics are intact.
6. period, height, and mono shader branches are untouched relative to
   HEAD.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Promo Flow republish.
- Preset changes and thumbnail regeneration.
- Any change to the 2D Mandelbrot sim or its cycling.
- Colouring the ground plane's interior (the cloud covers it from
  above; note as a future idea if tempting).

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 20 minutes

## Verifier handoff

Worker returns: files changed, `npm run verify` output, the computed
measure values for the four test constants, and per-criterion smoke
notes. Verifier returns `overall: PASS|FAIL` with per-criterion
results.

## Family-specific notes

- Codex/GPT worker: headless `codex exec`; do not wait on stdin; write
  the handoff envelope to
  `state/handoffs/25-logistic-mandelbrot-interior-cycling.json` as your
  final action.
- Claude verifier: criterion 6 is checkable by diffing the untouched
  shader branches against git HEAD; criterion 4 by tracing the
  fan-active expression in `drawOrbit3d`.
