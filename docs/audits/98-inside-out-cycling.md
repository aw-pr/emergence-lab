# Stage 98 audit: Inside-out cycling on attraction contours

Worker: Claude Fable 5.1, 2026-09-30, run worktree
`emergence-lab-run-98-logistic-mandelbrot-inside-out-cycling` on branch
`autometta/98-logistic-mandelbrot-inside-out-cycling` (base `4c0c142aa`, whose
production code is unchanged since dev `d40a1dfb4`). Card:
`docs/stages/98-logistic-mandelbrot-inside-out-cycling.md`. Attempt 3: the
implementation is attempt 1's, carried through attempt 2 (verifier PASS on
criteria 1-5) and unchanged here. This attempt adds the criterion 6 reverse
time-sequence evidence test, makes the render-timing test fail explicitly when
no unchanged baseline is served, and re-ran every command and regenerated
every artefact below.

All artefact paths below are relative to the repo root and live under the
git-ignored `e2e/artifacts/inside-out-cycling/`. Nothing binary is tracked.

## Numerical method

- **Scalar.** For a cell whose orbit sampler detects a period q, the colour
  scalar is the attracting-cycle multiplier magnitude `m = |∏ 2·z_j|` over one
  complete cycle, clamped to [0, 1]. This is the value the production sampler
  already computes (`sampleAttractorCell` measure on the CPU path, the period
  shader's `interior` output on the GPU path). No new solver.
- **Classification.** `classifyAttraction(escaped, period)` in
  `src/app/orbitColour.ts`: escaped (0), bounded with no detected period
  (0.5, "unresolved"), or resolved (1). It is derived from the period alone,
  so the sampler's `interior = 1` sentinel for an unresolved cell is never
  read as a measured multiplier; unresolved cells store multiplier 0 and are
  drawn in a steady neutral (`INSIDE_OUT_NEUTRAL`, the existing 0.44/0.47/0.53
  grey).
- **Palette coordinate.** `fract(k·m − phase)` with `k = cycleBands` (laps per
  unit multiplier) and `phase` from the renderer's existing signed
  `palettePhase()` (rate from `cycleSpeed`, sign from the cycle-direction
  option, zero at speed zero). One GLSL definition (`INSIDE_OUT_GLSL`) is
  spliced into the point, sheet and ground shaders. Reverse is applied only
  through the phase sign; the old `1 − t` flip in the Inside-out branches is
  gone, so reversing cannot cancel itself. No height, Re(c), Im(c) or
  boundary-distance term appears in the mode.
- **Ground field.** `WebGLRendererBackend.ensureOrbit3dAttractionField`
  samples every ground texel centre (1024×683, the same texel grid and span
  as the escape-time ground texture) through `Orbit3DPointCloud.sampleCells`,
  the production GPU sampler, at the cloud's own warmup and sample count. The
  result is uploaded once as an RG32F NEAREST texture (R multiplier, G
  classification). Keyed on `warmupIterations:sampleCount` only; time,
  palette, reverse, exposure, bands and geometry never rebuild it. Replaced
  textures are deleted first; `destroy()` releases it. The CPU fallback (no
  GPU sampler) runs `sampleAttractorCell` on a 256-wide grid with the same
  span so it stays a short synchronous build.
- **Ground compositing.** The ground shader now takes `u_interiorField`
  (0 none, 1 Cycle's boundary-distance bands, 2 Inside-out's attraction
  contours), selected by colour mode rather than by the `u_cycleBeam`
  lighting flag. Escaped texels keep the escape-time texture colour;
  resolved texels take the palette at the shared coordinate; unresolved take
  the neutral. Ink scaling is unchanged, so the ground stays subdued.
- **Escape texture cache.** The escape-time ground texture is keyed on
  palette, reverse and phase, so a cycling mode redraws it each frame (as
  Cycle already did) and a switch of colour mode or speed refreshes it. The
  render now binds the palette texture explicitly first: the orbit sampler
  creates scratch textures on whichever unit is active, and on the first
  Inside-out frame that was the palette unit, leaving the escape render
  black (and cached) at speed zero. That latent hazard is fixed in
  `ensureOrbit3dGround`.
- **Lighting.** Inside-out sets the point/sheet `u_cycleBeam` flag like Cycle
  so haze and sparkle take the point's own hue instead of white, and
  `v_cycleHue` carries the raw palette lookup. Tone mapping is untouched.

## Commands and results

| Criterion | Command | Result |
|---|---|---|
| 1 regression | `npm run verify` | typecheck, 379 unit tests (374 existing + 5 new in `orbitColour.test.cjs`), build: green |
| 1 gate | `scripts/check-contract-test-gate.sh --worktree` | exit 0, digest unchanged |
| 1 frozen contract, baseline | `INSIDE_OUT_CYCLING=1 npx playwright test e2e/inside-out-cycling.contract.spec.ts --workers=1` against the unchanged `git archive HEAD` tree served on port 5173 (see "Serving the baseline") | 2 passed (speed 0), 2 failed at the motion assertion (motion 0), 49.2 s. Log and frames: `e2e/artifacts/inside-out-cycling/baseline/contract-run.log`, `.../baseline/test-results/` |
| 1 frozen contract, after | same, against the run worktree on port 5173 | 4 passed, 47.4 s. Motion: cloud 4.50, hybrid 4.86 at speed 0.1; 0 at speed 0. `e2e/artifacts/inside-out-cycling/after/contract-run.log`, `.../after/contract-test-results/` |
| 1 smoke | `npx playwright test e2e/smoke.spec.ts --grep 'logistic-Mandelbrot\|cyclic Magma\|Magma\|magma' --workers=1` | see "Smoke" below |
| 2 | `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'multiplier' --workers=1` | 3 passed, 8.0 s (the two `multiplier` tests plus the height-independence test whose title ends "follows the multiplier"), `e2e/artifacts/inside-out-cycling/after/criteria/multiplier.log` |
| 3 | `... --grep 'height independence'` | 2 passed, 15.9 s, `.../after/criteria/height-independence.log` |
| 4 | `... --grep 'phase and ground'` | 3 passed, 7.7 s, `.../after/criteria/phase-and-ground.log` |
| 5 | `... --grep 'controls and cache'` | 2 passed, 1.0 min, `.../after/criteria/controls-and-cache.log`; its `render-timing.json` copy: `.../after/render-timing-criterion5.json` |
| 6 | `... --grep 'direction of travel'` | 2 passed (cloud, hybrid), 36.6 s standalone; also inside the full run below. Frames and phase records: `e2e/artifacts/inside-out-cycling/reverse-sequence/` |
| all | `npx playwright test e2e/inside-out-cycling.spec.ts --workers=1` | 11 passed, 2.1 min, log `e2e/artifacts/inside-out-cycling/after/spec-run.log` (unchanged baseline served on 5174 for the timing test) |

### Serving the baseline

Playwright's config reuses whatever already listens on port 5173, so a run
only measures the tree that server serves. Both baseline runs here unpack the
unchanged tree with `git archive HEAD` into the ignored
`build/inside-out-98-baseline/` (with `node_modules` symlinked from the run
worktree) and serve it with `npx vite --port <port> --strictPort` from that
directory: on 5173 for the frozen-contract baseline, on 5174 for the timing
test's `INSIDE_OUT_BASELINE_URL` default. Before every run this attempt
confirmed which tree each port served by fetching `/src/app/orbit3d.ts` and
counting `insideOutCoordinate` (3 on the run worktree, 0 on the baseline).
That check matters: an earlier pass in this attempt left the baseline server's
`node` child alive on 5173 after its `npx` parent was killed, Playwright
reused it, and the "after" contract and spec runs silently reproduced the
baseline's failures. Stop servers by port (`lsof -t -iTCP:5173 -sTCP:LISTEN`)
and check the count before trusting a run.

### Criterion 2: numerical meaning (`multiplier-samples.json`, `attraction-texels.json`)

Production CPU path (`sampleAttractorCell`, warmup 1500, 8 samples) and
production GPU path (`OrbitSampler.sample` in the page) at the nominal c:

| c | expected | CPU period, m | GPU period, m |
|---|---|---|---|
| 0 | q=1, m=0 | 1, 0 | 1, 0 |
| 0.1875 | q=1, m=0.5 | 1, 0.5 | 1, 0.5 |
| −1 | q=2, m=0 | 2, 0 | 2, 0 |
| −1.125 | q=2, m=0.5 | 2, 0.5 | 2, 0.5 |
| λ/2 − λ²/4, λ=0.3+0.4i (0.1675+0.14i) | q=1, m=0.5 | 1, 0.5 | 1, 0.5 |
| 1 | escaped | escaped | escaped |
| −1.9 | bounded, no period | period 0, bounded | period 0, bounded |

Max absolute multiplier error on both paths: 3.9e-7 (GPU, c=−1.125; tolerance 0.01).

Ground field texels (production renderer, `orbit3dAttractionField` on the
canvas, source `gpu`, 1024×683, warmup 1500, samples 8): each nearest texel's
own centre coordinate is fed to the CPU oracle and to the analytic formula
(period 1: `|1 − √(1 − 4c)|`; period 2: `4|c + 1|`). Examples: texel centre
−0.00049 for "c=0" gives m=0.00098 on texel, oracle and analytic; texel centre
−1.12549 for "c=−1.125" gives 0.50195 on all three. Classification: 1 for the
five cycle cells, 0 for c≈1, 0.5 for c≈−1.9; unmeasured cells store 0. Max
error vs oracle and vs analytic 5.4e-7 (c≈−1.125). The field build for this
test took 56.9 ms. Whole-field planes (R multiplier, G classification) are in
`attraction-field-masks.png`.

### Criterion 3: no vertical colour ramp (`height-independence.json`)

The production `POINT_VERTEX_SHADER` and `SURFACE_VERTEX_SHADER` (exported as
`ORBIT3D_SHADER_SOURCES`) are linked against a pass-through fragment stage
that writes `v_cycleHue`, the raw palette lookup before lighting, and one
controlled point or sheet quad is drawn per case. With q=1, m=0.5, bands 1.5,
phase 0 at heights −1.5, −0.5, 0, 0.5, 1.5 every read-back equals the oracle
lookup within 0.5/255 on both stages; m=0.15 moves the colour by more than
10/255 and matches its own lookup; a q=2 cell at m=0.5 with a different height
and boundary distance matches the q=1 colour. The same probe in Cycle mode
still changes colour between heights 0 and 1 (its height term is preserved),
so the probe is sensitive. Real route: hybrid at c=−1.125 (q=2, m=0.5), the
two sheets at z=(−1±√1.5)/2 sampled from `real-route-period2-sheets.png` have
OKLab hues −66.7° and −71.5° (difference 4.8°, tolerance 25°), both lit
(lightness 0.37 and 0.59) and chromatic (chroma 0.036 and 0.024, threshold
0.02) (`real-route-period2-sheets.json`).

### Criterion 4: phase, reversal and ground (`phase-lookups.json`, `ground-exterior-comparison.json`)

96 probe cases: point, sheet and ground (ground via the production program in
its new `u_diagnosticMode = 1`, which writes the pre-ink colour) × reverse
{off, on} × phases {0, 0.25, 0.5, 1} × (q, m) ∈ {(1, 0.5), (2, 0.5), (1, 0.1),
(3, 0.8)}. Max absolute channel error against the declared formula: 0.5/255
(tolerance 2/255). Phase 0 equals phase 1; q=1 and q=2 at m=0.5 agree; the
three stages agree with one another at every phase; the reverse flag alone
does not change a shader output at a fixed phase (direction lives in the phase
sign, checked separately: `palettePhase` gives 0.25 forward and 0.75 reversed
at t=2.5 s, speed 0.1; 0 at speed 0; the live canvas reports phase 0.000000
at speed 0). Exterior: an escaped texel reproduces the escape texture colour
whatever the attraction field holds; an unresolved texel is the neutral.
Real route with `?groundDiagnostic=palette`: exterior ground pixels are
identical between Inside-out and Period mode at phase 0 while interior pixels
differ (`ground-diagnostic-inside-out.png`, `ground-diagnostic-period.png`).
Classification masks: `attraction-field-masks.png`.

### Criterion 5: UI and lifecycle (`controls-*.png`, `render-timing.json`)

Driven through the controls panel on a page opened in Cycle mode at speed 0:
selecting Inside-out keeps `data-orbit3d-points` (7,419,976) and the build
state `complete`, and raises `data-orbit3d-attraction-builds` from 0 to 1
(source `gpu`); speed 0 to 0.1 advances `data-orbit3d-phase` between reads
and moves the frame (OKLab difference above 1); reversing, switching the
palette to noncyclic Magma and setting bands to 3 leave the build count at 1
and the point count unchanged; switching to hybrid rebuilds the geometry as
it always has while the field stays at 1 build; returning to Cycle and
pressing Reset restores colour mode `cycle`, speed 0.1, bands 1.5, geometry
`cloud`, palette `magma-cyclic` and direction forward. No page or console
errors. Frames: `controls-inside-out-speed0.png`,
`controls-inside-out-speed0.1.png`, `controls-reverse-magma-bands3.png`,
`controls-hybrid.png`, `controls-back-to-cycle.png`.

The render-timing test no longer passes silently when the unchanged baseline
is not served: it writes `render-timing.json` with `verdict: "unmet"` and
fails with a message naming the missing baseline URL, so a run without the
baseline reports criterion 5's timing comparison as unmet instead of green.

### Criterion 6: visual and scope

Direction-of-travel sequences (`direction of travel` tests, one per geometry):
defaults except Inside-out, camera parked at the default pose, which looks down
on the whole set from above the ground plane with the cardioid, the period-2
bulb at c = −1 and their ground contours all in frame. Four frames one second
apart at speed 0.1 forward, then the Cycle-direction control set to reverse
through the drawer (drawer closed again and its parked position verified
before capturing), and four more frames. Palette (cyclic Magma), bands 1.5,
speed 0.1, geometry and camera azimuth/distance are asserted unchanged across
all eight frames. Ordered frames:

- cloud forward: `e2e/artifacts/inside-out-cycling/reverse-sequence/cloud-forward-0.png`, `cloud-forward-1.png`, `cloud-forward-2.png`, `cloud-forward-3.png`
- cloud reverse: `e2e/artifacts/inside-out-cycling/reverse-sequence/cloud-reverse-0.png`, `cloud-reverse-1.png`, `cloud-reverse-2.png`, `cloud-reverse-3.png`
- hybrid forward: `e2e/artifacts/inside-out-cycling/reverse-sequence/hybrid-forward-0.png`, `hybrid-forward-1.png`, `hybrid-forward-2.png`, `hybrid-forward-3.png`
- hybrid reverse: `e2e/artifacts/inside-out-cycling/reverse-sequence/hybrid-reverse-0.png`, `hybrid-reverse-1.png`, `hybrid-reverse-2.png`, `hybrid-reverse-3.png`
- per-frame production phase, palette coordinate at m = 0.5 and frame motion: `reverse-sequence/cloud-sequence.json`, `reverse-sequence/hybrid-sequence.json`

The assertion is on production values, not on the frames: the canvas's
`data-orbit3d-phase` (the shared phase uniform) steps forward by +0.14 to
+0.15 per second-gap in forward mode and by −0.11 to −0.15 in reverse for both
geometries (the nominal 0.1 lap/s plus screenshot time), and the palette
coordinate `fract(1.5·0.5 − phase)` at a fixed m therefore steps the opposite
way, so a fixed colour sits at m = (coordinate + phase)/1.5 and moves to larger
m (outwards from the bulb centre) forward and to smaller m (inwards) in
reverse. Consecutive frames differ by 0.96 to 5.8 OKLab units in forward mode
and 1.0 to 3.5 in reverse (thresholds 0.3 per step, 1 per sequence; the
frozen contract's 1 is over a 2.5 s gap). Worker's reading of the frames: the
ground rings around the cardioid centre and the period-2 centre tighten
inwards through `cloud-reverse-0..3` and `hybrid-reverse-0..3` and spread
outwards through the forward sets; the period-2 bulb's sheets in hybrid carry
the ground's hue.

Further sequences for the verifier: contract frames (`after/contract-test-results/*/before.png`,
`after.png`), controls frames, `real-route-period2-sheets.png`, and the
diagnostic ground frames. Worker's own reading of them: contours ring the
cardioid and period-2 centres on the ground and on the sheets, the sheets over
one c share the ground's hue, the ground stays subdued, and the cloud keeps
readable colour. Defaults unchanged (`git diff` shows colour mode `cycle`,
speed 0.1, bands 1.5, gamma/contrast untouched); Cycle's distance-plus-height
band, Period and Mono branches are untouched.

## Timing

Same headless Chromium (Metal ANGLE), 1280×720, quality profile as loaded,
cloud geometry, Inside-out at speed 0.1, three matched samples of 90
requestAnimationFrame intervals each after a 15-frame warmup. The baseline is
the unchanged tree served on port 5174 as described under "Serving the
baseline" (outside Playwright's test directory so its spec files are not
discovered), measured with the current page parked on `about:blank`, so only
one renderer held the GPU at a time (`render-timing.json`, written by the
criterion 5 grep run).

| | median frame ms (3 samples) | p90 frame ms |
|---|---|---|
| baseline, unchanged code | 53.4, 53.7, 53.5 | 54.0, 54.2, 54.5 |
| current | 53.7, 54.2, 53.5 | 54.4, 54.9, 54.2 |

Change: +0.5% median, within noise and far under the 20% bar. Both hold
7,419,976 points. The escape-time ground re-render each cycling frame is the
same cost Cycle mode already pays. Attraction-field construction (GPU
sampler, 1024×683 = 699,392 cells at warmup 1500, 8 samples, including the
readback and RG32F upload): 54.7 ms in the timing test and 56.9 ms in the
texel test, once per sampling configuration. It is not recomputed per frame (`data-orbit3d-attraction-builds`
stays at 1 through colour-only changes and geometry switches). Frame
intervals sit at 53 ms, well above vsync, so they reflect render cost.

## Smoke

`npx playwright test e2e/smoke.spec.ts --grep 'logistic-Mandelbrot|cyclic Magma|Magma|magma' --workers=1`
collected six tests and passed all of them in 40.7 s
(`e2e/artifacts/inside-out-cycling/after/smoke.log`): the GPU cloud path
reports and completes; cyclic Magma joins seamlessly and agrees across CPU and
GPU mappings; Logistic Mandelbrot loads and resets to cyclic Magma; manual zoom
holds after ambient motion resumes with spin off and on; and the sheet does
not blow out at the zoom clamp. No test was skipped.

## Changes outside the four named deliverables

- `src/app/orbitColour.ts` (+ `orbitColour.test.cjs`, `tsconfig.test.json`
  include): the shared pure mapping, allowed by the card.
- `src/app/orbitSampler.ts`: `OrbitSampleResult` exported so the renderer
  can consume `sampleCells`.
- `src/app/simView.ts`, `src/app/controls.ts`: the Cycle-direction select
  was only rendered for the four fractal slugs, so Logistic Mandelbrot had
  no control to reverse with. It is now shown for this sim too, without the
  arrow-key hint (that binding stays fractal-only). Needed for criterion 5's
  "reverses it" through controls.
- `e2e/harness/insideOut.ts`: the test adapter.

## Limitations and open points

- The ground's escape mask still comes from the 160-iteration escape render;
  a cell the sampler finds escaping between iteration 160 and 1564 keeps the
  escape texture's interior fill. Interior attraction and exterior escape are
  different measures, and no continuity across the boundary is claimed.
- Attraction contours are drawn with NEAREST sampling at ground-texel
  resolution (1024 across the c-plane); at extreme zoom the ground contour
  edges are texel-stepped. The ground is subdued, so this reads as intended.
- Noncyclic palettes show their end-to-end seam in the contours, as the essay
  now states.
- Phase-continuous stop/resume is out of scope; stopping returns to the
  zero-phase colouring.
- The direction-of-travel frames are captured on a live clock, so the exact
  phase at each frame varies run to run; only the sign and rough size of the
  steps are asserted. Frame-to-frame OKLab motion varies with which palette
  segment crosses each ring, which is why the per-step threshold is loose.
- The CPU fallback for the ground field was not exercised in a browser here
  (every seat had the GPU sampler); its logic mirrors the GPU packing and is
  covered by the same classification function.
