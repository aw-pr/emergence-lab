# Logistic-Mandelbrot cycle interestingness — baseline, 2026-10-03

Stage card: `docs/stages/101-logistic-mandelbrot-cycle-interestingness-harness.md`.
Worker: Claude Fable 5.1, run worktree on
`autometta/101-logistic-mandelbrot-cycle-interestingness-harness` from `dev`
at `66079212a`. Every command ran in the foreground from the run worktree.
Artefacts are under the git-ignored `e2e/artifacts/logistic-mandelbrot-cycle/`
and come from one whole-spec run (`logs/cycle-full.log`, 9 passed, 5.1 min)
started from an empty artefact directory; the grep runs that preceded it
reproduce the same figures to the precision quoted.

**Attempt 2 (2026-10-03, re-brief 1).** The verifier passed criteria 2, 3,
5 and 6 of attempt 1 and failed 1 and 4 on two card lines the orchestrator
has since corrected: the contract gate's exit 2 ("nothing to inspect") is
the right outcome for a card with no contract test, and the contrast clause
now asks for a chroma change of more than 0.001 with the direction recorded
as measured. The scorer, the spec and the tables below are attempt 1's,
unchanged. Attempt 2 restored them onto the run branch (tip `1f874dc13`,
`dev` at `b3918be6d`, `git diff --stat dev...HEAD` empty) and re-ran every
command in the foreground; the whole spec passed again (9 passed, 5.0 min)
from an empty artefact directory, and the regenerated artefacts carry that
run's figures. Every baseline, sensitivity and repeat score landed within
0.01 of the tables, inside the timing noise the Limitations section
describes: default cycle 0.608 (table 0.600), default inside-out 0.562
(0.567), bifurcation-curtain 0.476 and 0.536 (0.478, 0.539),
period2-bulb-ground 0.643 and 0.591 (0.644, 0.592); repeat spread 0.0036;
contrast 1.4 chroma 0.0393 against 0.0422 in cycle mode and 0.0358 against
0.0379 in Inside-out, with gamma 1.2 restoring 0.0419 and 0.0381. The
artefact paths did not move.

This card builds the instrument and records what the shipped defaults score
on it. It changes nothing under `src/`, recommends no default, and does not
tune the formula toward a high score: the baseline is whatever it is.

## Method

**Scorer** (`e2e/harness/cycleScore.ts`, pure; formula and constants in its
docblock, pinned by `e2e/harness/cycleScore.test.cjs`). Given an ordered
sequence of decoded screenshots:

- `field`: the repo composite `interestingness` applied to the rendered
  luminance. Each frame becomes a scalar field by taking OKLab L per pixel,
  box-averaging it onto a grid four times coarser than the frame (320×180
  at 1280×720), then the repo's `gaussianBlur` with radius 2 cells. Each
  consecutive pair is scored with `scoreFrames` (so `frameMetrics`,
  `temporalFlux` and `interestingness` run unchanged) with coverage taken
  against a lit threshold of OKLab L > 0.1, the same floor
  `frameColourMetrics` uses; the pair scores are averaged
  (`summarizeMetrics`, whose spreads are kept in each candidate JSON).
- `colour`: `frameColourMetrics` of every frame, averaged (lit, edgeDensity,
  hueSpread, chroma, whiteClip, neon).
- `travel`: mean over consecutive pairs of `frameDifference`, mean OKLab×100
  per pixel lit in either frame.
- Composite: `chromaTerm = clamp01(chroma / 0.08)`,
  `edgeTerm = clamp01(edgeDensity / 0.3)`, `travelTerm = tanh(travel / 4)`,
  `colourScore = 0.4·chromaTerm + 0.3·edgeTerm + 0.3·travelTerm`,
  `cycleInterestingness = sqrt(field × colourScore)`. A geometric mean so
  neither half carries the score alone: a solid lit wash is zeroed by the
  composite's coverage factor, a motionless colourless frame by
  `colourScore`. The three normalisation constants were fixed from the
  palette sweep's rendered-frame readings before anything here was
  measured. Every term is exported and written to each candidate's JSON, so
  card 102 can re-weight from the JSON without re-rendering.

**Harness** (`e2e/cycle-interestingness.spec.ts`, opt-in with
`CYCLE_SCORE=1`). Production GPU orbit3d path at the shipped quality,
1280×720, one fresh browser context per candidate. Kernel params go in
through the persisted store before navigation: camera parked
(`autoRotate`, `continuousSpin` off), `cascadeReveal` and `realAxisSweep`
off, `colourMode`, `cycleSpeed` and `cycleBands` as the candidate says, and
every other kernel param at its shipped default, including `boundaryDetail`
1 (the inside-out spec's frozen params set it to 0; this harness does not,
because the card asks for the shipped point budget). Palette, gamma and
contrast are left at the shipped cyclic Magma, 1.65, 2.4 unless a candidate
names a value, which is driven through the colour panel's slider (colour
options are not persisted). Three poses:

- `default`: the view the sim opens on (azimuth 2.4635, distance 5.098).
- `bifurcation-curtain`: the kernel preset selected through the controls
  drawer, which resets kernel params, so the parked camera, colour mode,
  speed and bands are re-applied after it; the drawer is closed and parked
  before capture (azimuth 3.17, distance 3.7; 7,200,000 points).
- `period2-bulb-ground`: four wheel steps toward c = −1 on the ground plane
  from the default pose (distance 2.798; boundary-detail opacity 1).

Every candidate captures 11 frames at a fixed 700 ms wait (plus screenshot
time, about 1.1 s per step in practice); phase is the renderer's own
`data-orbit3d-phase` recorded per frame, and the signed sum of per-step
phase deltas is the `laps` column. Camera azimuth and distance, point
count, build state and the sidebar's parked position are asserted identical
on every frame. Per candidate the harness writes `<id>.json` (candidate,
per-frame records, params snapshot, full `CycleScore`), `<id>-sequence.png`
(the 11 frames at half size, four per row), `<id>-frame-0.png` (first frame
at full size) and `<id>-luminance.png` (the blurred working field the
composite scored, frame 0). `ranked.md` and `ranked.json` hold every
candidate of the run that wrote them, highest score first, plus the repo
`metricsTable` over the field means.

Phase is timed, not pinned: the renderer derives phase from its own clock
and there is no hook to set it, so the start phase differs per capture
(0.27 to 0.53 here) and the sequence is made long enough (about 1.1 laps)
that the lap mean is insensitive to where it starts. The repeat test below
measures what that costs.

## Baseline: shipped defaults, three poses, both modes

Cyclic Magma, gamma 1.65, contrast 2.4, speed 0.1, 1.5 bands per unit.
`field` columns are the composite's per-pair means; colour columns are
sequence means; `travel` is OKLab×100 per consecutive pair.

| pose | mode | cycleInterestingness | field | coverage | autocorr | entropy | flux | lit | edges | chroma | hueSpread | whiteClip | neon | travel | chromaTerm | edgeTerm | travelTerm | colourScore | laps | sequence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| default | cycle | **0.600** | 0.595 | 0.193 | 0.992 | 0.288 | 0.0053 | 0.167 | 0.169 | 0.042 | 0.156 | 0.023 | 0.002 | 3.91 | 0.529 | 0.562 | 0.752 | 0.606 | 1.13 | `e2e/artifacts/logistic-mandelbrot-cycle/baseline-default-cycle-sequence.png` |
| default | inside-out | **0.567** | 0.589 | 0.191 | 0.990 | 0.282 | 0.0047 | 0.163 | 0.141 | 0.038 | 0.169 | 0.013 | 0.000 | 3.54 | 0.478 | 0.470 | 0.709 | 0.545 | 1.17 | `e2e/artifacts/logistic-mandelbrot-cycle/baseline-default-inside-out-sequence.png` |
| bifurcation-curtain | cycle | **0.478** | 0.597 | 0.208 | 0.992 | 0.312 | 0.0034 | 0.172 | 0.065 | 0.032 | 0.167 | 0.253 | 0.000 | 2.34 | 0.399 | 0.218 | 0.526 | 0.383 | 0.95 | `e2e/artifacts/logistic-mandelbrot-cycle/baseline-bifurcation-curtain-cycle-sequence.png` |
| bifurcation-curtain | inside-out | **0.539** | 0.601 | 0.208 | 0.991 | 0.317 | 0.0039 | 0.171 | 0.092 | 0.041 | 0.130 | 0.091 | 0.000 | 2.92 | 0.514 | 0.305 | 0.623 | 0.484 | 0.99 | `e2e/artifacts/logistic-mandelbrot-cycle/baseline-bifurcation-curtain-inside-out-sequence.png` |
| period2-bulb-ground | cycle | **0.644** | 0.721 | 0.440 | 0.994 | 0.523 | 0.0138 | 0.403 | 0.144 | 0.040 | 0.105 | 0.007 | 0.001 | 4.07 | 0.501 | 0.481 | 0.769 | 0.575 | 1.11 | `e2e/artifacts/logistic-mandelbrot-cycle/baseline-period2-bulb-ground-cycle-sequence.png` |
| period2-bulb-ground | inside-out | **0.592** | 0.708 | 0.434 | 0.992 | 0.508 | 0.0120 | 0.394 | 0.105 | 0.035 | 0.110 | 0.004 | 0.000 | 3.60 | 0.439 | 0.349 | 0.717 | 0.495 | 1.09 | `e2e/artifacts/logistic-mandelbrot-cycle/baseline-period2-bulb-ground-inside-out-sequence.png` |

Each row's JSON is `e2e/artifacts/logistic-mandelbrot-cycle/baseline-<pose>-<mode>.json`,
with `-frame-0.png` and `-luminance.png` beside it. Every sequence has 11
frames and spans 0.95 to 1.17 laps (the card asks for at least a third).
All six scores lie in (0, 1).

Reading, by eye on the contact sheets: in the default view the ground
plane's cardioid sweeps from brown through near-black to pale across the
lap while the cloud's bands shift; in the curtain view the chaotic section
carries stacked horizontal bands and the ground cardioid changes colour
frame to frame; in the bulb view the period-2 disc's concentric bands are
the dominant feature.

## What the composite rewards and penalises on this object

- **The structure term is saturated and cannot rank anything.** Lag-1
  autocorrelation of the blurred luminance reads 0.989 to 0.994 for every
  candidate, including speed 0. A rendered, blurred frame is smooth at the
  working-grid scale whatever is drawn on it, so 0.55 of the composite's
  inner sum is a constant here. The field term's ranking comes from
  entropy (0.27 to 0.52) and liveliness; coverage sits on the plateau for
  every pose (0.19 to 0.44, factor 1).
- **Pose dominates the field term through entropy.** The period-2 dolly
  lifts coverage to 0.44 and entropy to 0.52, and with it `field` from
  0.59 to 0.72: the bulb fills the frame with graded lit area where the
  default and curtain views are mostly background. That is why the bulb
  pose tops the baseline in both modes. Card 102 should compare candidates
  within a pose, not across poses.
- **Liveliness is the composite's only temporal sensitivity, and it is
  small.** Flux of 0.004 to 0.014 on the blurred field gives liveliness
  0.88 to 0.93 against the 0.85 floor. Most of the score's response to
  motion comes from `travelTerm` in the colour half (0 at speed 0, 0.71 to
  0.79 at the shipped speed).
- **Cycle mode beats Inside-out at the default and bulb poses on all three
  colour terms** (more band edges, slightly more chroma, more travel), and
  loses at the curtain, where cycle mode bleaches the curtain sheets:
  whiteClip 0.253 against 0.091, chroma 0.032 against 0.041, edges 0.065
  against 0.092. The curtain preset's exposure 1.6 is part of that; the
  hue-preserving shader branches of card 97 are gated on Cycle mode, so the
  bleaching is in the additive stacking of the 64-sample curtain, not in
  the tone map.
- **Chroma is the weakest term.** `chromaTerm` is 0.40 to 0.53 at the
  shipped palette: whole-frame chroma of 0.032 to 0.042 against the 0.08
  "vivid" normalisation. The flat 58% of each lap at contrast 2.4 (card 100
  audit) is the dark purple floor colour, which is lit (L ≈ 0.27) and
  chromatic, so it does not read as a loss of chroma; the loss is the pale
  cream ceiling on the stacked sheets.
- **Band edges on this object are mostly sprite texture, not palette
  bands.** `edgeDensity` is 0.14 to 0.17 at the default pose and moves by
  about 0.002 when `cycleBands` goes from 1.5 to 5 (below). The term
  rewards the cloud's point texture far more than the banding the operator
  cares about; a sweep that wants to reward bands should read `edgeDensity`
  on the ground plane crop or on the luminance field, not whole-frame.
- **Neon and white clip are reported but not weighted.** Neon is at most
  0.003 anywhere; whiteClip only enters through the chroma it removes.

## Sensitivity: default pose, both modes

`e2e/artifacts/logistic-mandelbrot-cycle/sensitivity-<mode>.json` holds
each comparison; the candidates are `sensitivity-<mode>-{shipped,speed0,bands5,contrast1.4,gamma1.2-contrast1.4}`.

| mode | comparison | shipped | changed | term that moved |
|---|---|---|---|---|
| cycle | speed 0.1 → 0 | score 0.607, field 0.598, travel 4.30, flux 0.0059, travelTerm 0.792 | score 0.473, field 0.569, travel 0, flux 0, travelTerm 0 | liveliness (0.85 floor) and travel |
| inside-out | speed 0.1 → 0 | score 0.566, field 0.589, travel 3.53, flux 0.0047, travelTerm 0.708 | score 0.440, field 0.566, travel 0, flux 0, travelTerm 0 | liveliness and travel |
| cycle | cycleBands 1.5 → 5 | edges 0.1681, edgeTerm 0.560, score 0.607 | edges 0.1702, edgeTerm 0.567, score 0.596 | edges up, as the palette sweep predicted (0.176 → 0.193 on amber); travel down 4.30 → 3.74 |
| inside-out | cycleBands 1.5 → 5 | edges 0.1410, edgeTerm 0.470, score 0.566 | edges 0.1438, edgeTerm 0.479, score 0.560 | edges up; travel down 3.53 → 3.30 |
| cycle | contrast 2.4 → 1.4 | chroma 0.0422, whiteClip 0.0235, hueSpread 0.159, score 0.607 | chroma 0.0392, whiteClip 0.0350, hueSpread 0.214, score 0.602 | chroma **down**; whiteClip, hueSpread, edges up |
| inside-out | contrast 2.4 → 1.4 | chroma 0.0382, whiteClip 0.0135, hueSpread 0.167, score 0.566 | chroma 0.0359, whiteClip 0.0205, hueSpread 0.224, score 0.568 | chroma **down**; whiteClip, hueSpread, edges up |
| cycle | gamma 1.2 + contrast 1.4 (the audit's pairing, supplementary) | chroma 0.0422 | chroma 0.0422, whiteClip 0.0325, hueSpread 0.187, score 0.605 | chroma back to the shipped value |
| inside-out | gamma 1.2 + contrast 1.4 (supplementary) | chroma 0.0382 | chroma 0.0375, whiteClip 0.0218, hueSpread 0.202, score 0.568 | chroma within 0.001 of shipped |

Speed and bands moved as the card expected. Speed 0 pins the phase, every
frame is identical (travel exactly 0, flux exactly 0), the composite sits on
its liveliness floor and the score drops by 0.13. More bands per unit raise
whole-frame edge density in both modes, by about 1% relative, which is ten
times the run-to-run noise on that metric (0.0003) but tiny in absolute
terms for the reason given above.

**Contrast moved chroma the other way from the card's expectation, in both
modes.** The card asked for "the direction card 96's audit measured". That
audit reproduced the palette sweep's browser table, whose only lower-contrast
amber row (`amber k1.4`) lowered gamma from 1.65 to 1.2 at the same time
as contrast from 2.4 to 1.4, and read chroma 0.022 against the shipped
0.020. On the shipped cyclic Magma with gamma held at 1.65, contrast 1.4
alone lowers whole-frame chroma (0.0422 → 0.0392 in cycle mode, 0.0382 →
0.0359 in Inside-out) while raising white clip and hue spread: the
stretched ramp spends more of each lap near its pale ceiling, which the
stacked sheets push to cream, and less at the chromatic dark-purple floor.
The supplementary pairing with gamma 1.2 restores chroma to the shipped
value, so the audit's rise was the gamma change, not the contrast change.
The harness therefore asserts that contrast changes chroma by more than
0.001 and records the direction (`chromaDirection` in the JSON, "down at
1.4" here) rather than asserting a direction the shipped palette does not
produce. Re-brief 1 adopted exactly this reading: criterion 4's contrast
clause now requires a mean-chroma change of more than 0.001 in each mode,
the direction recorded as measured, plus the supplementary gamma 1.2 /
contrast 1.4 candidate so the two effects are separated. In short: at the
shipped gamma, lowering contrast lowers chroma; the audit's chroma rise was
gamma's doing. Both numbers are reported for every comparison, as the
criterion asks.

## Repeatability

`e2e/artifacts/logistic-mandelbrot-cycle/repeat-default-cycle.json`:
three fresh contexts, default pose, cycle mode, shipped defaults.

| component | run 0 | run 1 | run 2 | spread |
|---|---|---|---|---|
| cycleInterestingness | 0.6014 | 0.6028 | 0.6028 | **0.0014** |
| field | 0.5955 | 0.5958 | 0.5959 | 0.0004 |
| coverage | 0.1933 | 0.1933 | 0.1933 | 0.0000 |
| spatialAutocorrelation | 0.9923 | 0.9923 | 0.9923 | 0.0000 |
| entropy | 0.2887 | 0.2887 | 0.2889 | 0.0002 |
| temporalFlux | 0.0053 | 0.0054 | 0.0054 | 0.0001 |
| lit | 0.1667 | 0.1667 | 0.1667 | 0.0000 |
| edgeDensity | 0.1687 | 0.1687 | 0.1687 | 0.0000 |
| chroma | 0.0423 | 0.0423 | 0.0423 | 0.0001 |
| hueSpread | 0.1559 | 0.1560 | 0.1558 | 0.0002 |
| whiteClip | 0.0232 | 0.0232 | 0.0232 | 0.0000 |
| neon | 0.0016 | 0.0016 | 0.0016 | 0.0000 |
| travel | 3.96 | 4.03 | 4.03 | 0.067 |
| chromaTerm | 0.5283 | 0.5292 | 0.5292 | 0.0009 |
| edgeTerm | 0.5623 | 0.5622 | 0.5622 | 0.0001 |
| travelTerm | 0.7578 | 0.7646 | 0.7649 | 0.0070 |
| colourScore | 0.6074 | 0.6097 | 0.6098 | 0.0024 |
| laps spanned | 1.125 | 1.138 | 1.132 | 0.012 |
| start phase | 0.279 | 0.273 | 0.277 | |

The bound is 0.02. An earlier standalone repeat run (`logs/cycle-repeat.log`)
measured 0.0054 with travel spread 0.28 and lap-span spread 0.06, so the
noise floor of the composite is about 0.005 and it lives almost entirely in
`travel`, which depends on the timed step between frames. A candidate whose
score differs from another's by less than 0.01 should be treated as tied
until re-captured. The static terms (field, colour means) repeat to three
decimals, and the same shipped candidate captured six times across this
document's runs (baseline, sensitivity, three repeats, and the earlier
grep runs) scored 0.600 to 0.607.

## What the sweep card may vary

Within a pose, since pose moves the field term more than any parameter.
The ranges are what the baseline suggests is worth the render time; each
candidate costs about 16 s.

1. **`cycleBands`, 1.5 to 6 in steps of 0.5 (also 2, 2.5 and 4 explicitly).**
   The card 96 audit measured the cardioid 0.515 c-units deep and the
   period-2 disc 0.252, so a complete band inside the cardioid needs at
   least 2 bands per unit and inside the disc at least 4; the shipped 1.5
   gives neither. Whole-frame edges barely move with bands at the default
   pose, so the sweep should also read `edgeDensity` on the ground plane
   (the harness's luminance PNGs show where the bands are) or score the
   bulb pose, where the disc's concentric bands are the dominant feature.
2. **Contrast 1.2 to 2.4 jointly with gamma 1.0 to 1.65.** They trade
   against each other on this palette: contrast 1.4 alone lowers chroma and
   raises white clip; gamma 1.2 with it restores chroma. Sweeping either
   alone will mislead. The visible band of the lap (about 42% at the
   shipped 2.4) widens as contrast falls, which is what the operator sees
   as band width on the sheets.
3. **`cycleSpeed`, 0.05 to 0.3.** `travelTerm` is the term the shipped
   defaults are furthest from saturating that the operator can move without
   touching the palette (0.75 at 0.1). The harness measures travel per
   consecutive pair at a fixed wait, so a faster cycle reads as more travel
   up to the point where a step exceeds the visible band and successive
   frames decorrelate; above about 0.3 the seam passes any point more than
   once every three seconds and the earlier sweep's flicker concern
   applies. Keep the 700 ms step when comparing against this baseline.
4. **Palette preset: cyclic Magma against Magma, Rosewood, Verdigris and
   Dusk, each with its own gamma and contrast pair from the palette
   sweep.** The audit's counter-case, Magma at gamma 1.2 and contrast 1.8,
   had the highest rendered edge density (0.300) and travel (12.78 per third
   of a lap) of any candidate and no neon; on this scale that is edgeTerm
   1.0 against the shipped 0.56. Chroma is the composite's weakest term and
   the palette is the biggest lever on it.
5. **`exposure`, 0.7 to 1.6.** The curtain preset's 1.6 produces whiteClip
   0.253 in cycle mode and the lowest baseline score; exposure sets how much
   of the stacked cloud is pushed to cream, and so sets chroma at the top
   of the ramp. Worth one axis at the default and curtain poses.

Not parameters, but the sweep should fix them: pose (score all three, rank
within each), the 11-frame 700 ms capture, and the shipped `boundaryDetail`.
Re-weighting the composite is possible from the JSON alone (every term is
exported), but the structure term will stay saturated at 0.99 whatever the
weights; if card 102 wants the field half to discriminate, that needs a
different spatial statistic (`multiLagSpatialAutocorrelation` is already in
`metrics.ts`), which is a change to the formula and should be its own
decision, not a tuning step.

## Commands and results

| Criterion | Command | Result |
|---|---|---|
| 1 regression | `npm run verify` | exit 0: typecheck, 393 tests (386 pass, 7 skipped frozen, 0 fail), build. `logs/verify.log` |
| 1 scope | `git status --short` | the four claimed new paths only; `tsconfig.test.json` unchanged (below); nothing under `src/`, `essays/`, `public/`, no existing e2e file touched |
| 1 gate | `scripts/check-contract-test-gate.sh --worktree` | exit 2, `contract-gate: no relevant changed files to inspect in the working tree`: the card has no contract test, the same "nothing to inspect" outcome card 96's audit recorded |
| 2 | `npm run build:test && node --test e2e/harness/cycleScore.test.cjs` | 5 pass, 0 fail: blank → 0; solid lit chromatic → 0 through coverage (chromaTerm > 0, coverage 1, field 0); identical bands → travel 0, flux 0, field = interestingness(fm, 0) = 0.85 × interestingness(fm, 1); moving bands → travel > 0 and higher score; composite equals the documented formula over the exported terms and re-weights from them |
| 3 | `CYCLE_SCORE=1 npx playwright test e2e/cycle-interestingness.spec.ts --grep baseline --workers=1` | 6 pass, 1.6 min. `logs/cycle-baseline.log` |
| 4 | `--grep sensitivity` | 2 pass, 2.7 min. `logs/cycle-sensitivity.log` |
| 5 | `--grep repeat` | 1 pass, 48 s, spread 0.0054. `logs/cycle-repeat.log` |
| all | `CYCLE_SCORE=1 npx playwright test e2e/cycle-interestingness.spec.ts --workers=1` | 9 pass, 5.1 min, from an empty artefact directory; the figures above. `logs/cycle-full.log` |

Attempt 2 re-ran the criterion 1 commands, the unit test and the whole spec
on the restored tree: `npm run verify` exit 0 (typecheck, 397 tests, 390
pass, 7 skipped, 0 fail, build); `git status --short` the four claimed
paths only; `scripts/check-contract-test-gate.sh --worktree` exit 2 with the
same "no relevant changed files to inspect" line, which re-brief 1 names as
the satisfying outcome; `npm run build:test && node --test
e2e/harness/cycleScore.test.cjs` 5 pass, 0 fail; the whole spec 9 passed in
5.0 min (`logs/cycle-full.log`).

`tsconfig.test.json` is unchanged. Deliverable 2 names an include entry
"per `docs/INTERFACE.md`", but that route is for `src/app` modules: the test
config has `rootDir: "src"`, and adding `e2e/harness/cycleScore.ts` to its
include fails with TS6059 (tried, reverted). The harness convention
`INTERFACE.md` and `scripts/run-kernel-tests.cjs` describe for
`e2e/harness` is the one `metrics.test.cjs` uses and this test follows:
Node requires the `.ts` source directly under type stripping, `npm test`
discovers it by its filename, and `npm run build:test` runs first in the
criterion 2 command without needing to emit anything for it.

The app typecheck (`tsconfig.json`) covers `src/` only, so the two new
TypeScript files were checked with an ad-hoc config extending it; the only
diagnostics are the missing-`@types/node` names every existing e2e file
also reports.

## Limitations and open points

- **Phase is timed.** Start phase and step size vary by a few percent per
  capture; `travel` carries that noise (spread up to 0.28 of about 4) and
  the composite about 0.005. Pinning phase would need a renderer hook,
  which is a `src/` change outside this card.
- **The ranked table is per run.** `ranked.md` and `ranked.json` list the
  candidates of the run that wrote them, so a grep run overwrites the
  whole-spec table; per-candidate JSONs are stable. Run the whole spec for
  the full table.
- **Duplicated helpers.** `parkDrawer`, `waitForCameraRest`, the dolly and
  the colour-panel slider driver are copied from `inside-out-cycling.spec.ts`
  and `palette-sweep.spec.ts` because every existing harness and spec file
  was out of scope. They are extraction candidates for `e2e/harness/`.
- **No CPU-fallback run.** Every capture asserted the GPU orbit3d renderer;
  the harness has not been exercised against `orbit3d-fallback-field`.
- **Whole-frame metrics.** Every reading is over the full 1280×720 canvas,
  ground plane and chrome included (the tiny legend chips are in frame).
  Crops are not offered; the sweep can add them to the scorer's options.
