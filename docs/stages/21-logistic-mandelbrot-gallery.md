# Stage card 21-logistic-mandelbrot-gallery: Logistic Mandelbrot — ground plane, presets, essay, gallery polish

## Metadata

- **Authored:** 2026-07-17
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 4.8 <claude-opus-4-8@local>
- **Verifier panel:** false
- **Pairing rationale:** The closing stage mixes shader reuse with expository writing (essay, presets, card copy); Sol carries the implementation and drafts the essay, Opus cross-family-verifies the build, the gallery wiring, and that the essay's claims match the sim's behaviour. (Fable, the original worker for this stage, dropped off subscription mid-run.)

## Objective

Finish `logistic-mandelbrot` to gallery standard:

1. **Ground plane** — render the Mandelbrot set as a textured plane at
   z = 0 beneath the point cloud, reusing the existing escape-time fractal
   shader (smooth colouring, palette texture) adapted to the orbit3d camera.
   The point cloud must remain legible above it (dim/desaturate the plane
   relative to the 2D fractal sims).
2. **Presets** — three presets in `src/app/presets.ts`: "The full object"
   (default view), "Bifurcation curtain" (real-slice-only, side-on camera),
   "Cascade" (cascade animation prominent, low plotted-iterations start).
3. **Essay** — `essays/logistic-mandelbrot.md` following the house essay
   format: the logistic map, the conjugacy c = r/2·(1 − r/2), why the
   bifurcation diagram is the real slice of the Mandelbrot set, what the
   off-axis sheets are, and what to try in the sim.
4. **Gallery polish** — final registry name/subtitle/description, thumbnail
   generation via the existing deterministic thumbnail path, and the sim
   listed correctly on the gallery grid.

## Inputs (read these in your own context)

- `src/app/webglRenderer.ts` fractal fragment shader (~lines 484–577)
- `src/app/orbit3d.ts` / orbit3d branch (stages 18–20)
- `src/app/presets.ts`, `src/app/registry.ts`, `src/app/thumbnail.ts`
- `essays/` — two existing essays for format and voice
- `docs/verification.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. Ground-plane Mandelbrot pass in the orbit3d pipeline.
2. Three presets as specified.
3. `essays/logistic-mandelbrot.md`.
4. Final registry entry copy and a generated thumbnail consistent with the
   existing thumbnail pipeline.

## Constraints

- Reuse the existing fractal shader source; do not fork a second Mandelbrot
  implementation (extract/share rather than copy where the renderer's idiom
  allows).
- Essay follows the existing essays' structure and tone; UK English; no em
  dashes in card-facing copy.
- Thumbnail must come from the deterministic thumbnail path, not a manual
  screenshot.
- Stages 17–20 behaviour and tests stay green.
- Do not run `git commit` from the worker phase.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes.
2. Browser smoke: ground plane renders under the point cloud, correctly
   aligned (the cloud's sheets sit exactly over their bulbs; the curtain
   hangs from the real axis), and the cloud remains clearly legible.
3. All three presets load and match their descriptions.
4. The gallery grid shows the sim with a non-blank thumbnail and final copy.
5. Essay renders on the sim page and its mathematical claims are consistent
   with what the sim shows (spot-check the conjugacy statement and the
   period-3 window).
6. No regressions on two spot-checked existing sims.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- promo-flow integration (`src/lib/labs.ts` mirror, `/labs` cards, search
  docs) — happens in the promo-flow repo at republish, not here.
- New variants; Mandelbulb; deep zoom.

## Budget

- **Worker wall-clock:** 50 minutes
- **Verifier wall-clock:** 25 minutes

## Verifier handoff

Worker returns: files changed, `npm run verify` output, preset list, and
browser smoke notes for criteria 2–5. Verifier returns `overall: PASS|FAIL`
with per-criterion results, including an explicit alignment check of plane
vs cloud (criterion 2) and an essay fact-check note (criterion 5).

## Family-specific notes

- Codex worker: do not commit; leave changes uncommitted for orchestrator
  integration. The essay is a Sol deliverable this stage — keep UK English
  and no em dashes in card-facing copy.
- Claude/Opus verifier: for criterion 5, verify the essay against the sim and
  the card, not against external sources.
