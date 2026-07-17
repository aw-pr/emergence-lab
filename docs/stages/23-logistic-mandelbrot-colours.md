# Stage card 23-logistic-mandelbrot-colours: Logistic Mandelbrot — colour modes

## Metadata

- **Authored:** 2026-07-17
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Claude Fable 5 <claude-fable-5@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier panel:** false
- **Pairing rationale:** Colour design is an aesthetic-judgment task suited to the frontier Claude tier working against the repo's existing palette language; Sol cross-family-verifies the mechanics, params, and performance.

## Objective

The point cloud currently renders in a single near-white tone. Give it
colour that carries mathematical meaning, as a user-selectable mode:

1. **Period** (proposed default) — categorical colour per detected
   period (1, 2, 3, 4, ... chaos), so the bulb structure becomes
   readable at a glance: cardioid one hue, period-2 disc another, the
   period-3 bulbs a third, chaotic band desaturated. Use distinct,
   dark-background-friendly hues consistent with the repo's existing
   palette language in `colormap.ts`.
2. **Height** — smooth gradient over Re(z) (the vertical axis), so the
   sheet stack and the curtain's fold structure read as depth.
3. **Mono** — the current single-tone additive look, preserved exactly,
   for the classic astronomical-plate aesthetic.

The mode is an enum param in `paramSchema` (auto-generated control).
Colour must compose with the existing additive HDR/exposure pipeline
without washing out: tone the palette so summed overlapping points
saturate toward white gracefully rather than clipping to a hue.

Update the three presets deliberately: pick the mode that best serves
each (e.g. curtain preset may read best in height mode; full object in
period mode). Regenerate the thumbnail with whichever mode makes the
gallery card most striking, and update the essay's "what to try"
section to mention the modes in one sentence.

## Inputs (read these in your own context)

- `src/app/orbit3d.ts` (point pipeline, shaders, exposure)
- `src/sims/logistic-mandelbrot/model.ts` (period estimate per c — the
  data source for period colouring)
- `src/sims/logistic-mandelbrot/kernel.ts` (paramSchema)
- `src/app/colormap.ts` (palette idiom; read-only)
- `src/app/presets.ts`, `essays/logistic-mandelbrot.md`
- `docs/verification.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. Colour mode enum param (`period` | `height` | `mono`) wired from
   paramSchema through to the point shader.
2. Per-point colour attribute or lookup fed from the sampler's period
   data (period mode) and Re(z) (height mode).
3. Preset updates and regenerated thumbnail.
4. One-sentence essay addition.

## Constraints

- Mono mode must be pixel-equivalent to the current rendering (this is
  the regression baseline).
- No new render passes; extend the existing point pipeline.
- Palette hues consistent with the repo's existing colormap language;
  dark-background friendly; no pure saturated primaries.
- UK English, no em dashes in card-facing copy or essay text.
- Do not run `git commit` from the worker phase.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes; stages 17-22 behaviour stays green.
2. The three modes are selectable from the generated controls and
   produce mechanically distinct colouring (verifiable from the
   attribute/uniform flow in code).
3. Period mode colours derive from the sampler's period estimates, not
   from a screen-space heuristic (period-2 disc provably maps to a
   different colour index than the cardioid).
4. Mono mode preserves the pre-stage rendering (same shader path or
   provably equivalent output).
5. Presets updated with deliberate mode choices; thumbnail regenerated
   via the deterministic path and non-blank.
6. Essay updated with the one-sentence mention; maths claims unchanged.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Clipping fix (stage 22, runs first).
- Density-based colouring, orbit-trap colouring, per-preset custom
  palettes — note as future ideas in the handoff if tempting.

## Budget

- **Worker wall-clock:** 50 minutes
- **Verifier wall-clock:** 20 minutes

## Verifier handoff

Worker returns: files changed, `npm run verify` output, the palette hex
values chosen per mode with a one-line rationale each, and per-criterion
smoke notes. Verifier returns `overall: PASS|FAIL` with per-criterion
results.

## Family-specific notes

- Claude worker: do not commit; leave changes uncommitted for
  orchestrator integration.
- Codex/GPT verifier: criterion 4's equivalence is checkable by diffing
  the mono shader path against git HEAD's.
