# Mandelbrot boundary interestingness sweep — 2026-10-30

**Research result: no promotion proposed.** The worker completed 48 coarse and
24 refined views, all four current references, static calibration, exact numeric
replay and three distinct-region evidence finalists. The strongest fine view
is attractive but iteration-sensitive. The broad view is more stable and less
visually distinctive. Independent cross-family verification remains pending;
operator visual sign-off is separate from research acceptance.

## Method

The existing `driveKernel`, `scoreOne`, `runSweep`, metric and report helpers
were extended additively. Every historical config and `scoreFrames` keeps its
original output. The new config is `sweep-137-mandelbrot`, slug `mandelbrot`.
No production kernel, preset, default, interface or protected script changed.

Geometry scoring uses **128×128**, channel 0, zero warmup steps, zero flux gap,
`dt=1`, `palettePhase=0`, `cycleSpeed=0`, `maxIterations=512` and
`autoIterations=true`. Every view starts from a fresh deterministic kernel;
there is no RNG/seed, time-strip requirement or palette-motion experiment.

`static-boundary-v1` exports `staticBoundaryMetrics(field,width,height)`.
Interior fraction `p` counts **exactly zero escape-field cells**, including
iteration-limited unresolved points. Edge density `e1` is the fraction of all
non-wrapping right/down nearest-neighbour pairs crossing zero/nonzero. Coarse
edge density `e2` uses the same distinction over pairs **two cells apart**,
without smoothing, decimation or wrap. Entropy is binary Shannon entropy
`H(p)` in bits, already normalised to [0,1]. The static score is:

```text
score = 4*p*(1-p) * H(p) * sqrt(e1*e2) * max(0,1-2*e1)^2
```

All components and the score lie in [0,1]. The last term suppresses pixel noise;
flat interior/exterior fields score zero. This is a calibrated shortlist
instrument, not a numerical assertion of topology, novelty or aesthetic value.
Binary entropy does not reward increased escape brightness. Legacy variance,
autocorrelation, coverage and flux are retained as diagnostics; they do not
enter this score. Every row and the manifest carry the method version.

The driver preserves unclamped samples only on this opt-in path so non-finite
and out-of-range diagnostics cannot be silently hidden. Such output receives
score zero and cannot be promoted. This run has no such output.

## Search coverage and pre-measurement declarations

The [coarse manifest](data/2026-10-30/137/manifest-coarse.json) was written before
coarse measurement. Its [48-view results](data/2026-10-30/137/coarse-results.json)
were used to choose three refinement centres. The
[refined manifest](data/2026-10-30/137/manifest-refined.json) was written before
measuring the final declared list. Exact full parameters, deterministic settings,
reference provenance, prior ranges, source hashes, iteration policy and final
presentation settings are retained in the
[complete ranked result JSON](data/2026-10-30/137/mandelbrot.json). These files are
portable evidence; scratch thumbnails and logs under `e2e/artifacts/` are not the
only record.

The [batch live audit](2026-10-30-interestingness-batch.md) and historical
`e2e/harness/sims.ts` establish that Mandelbrot had **no prior sweep config,
grid, appendix or ranking**. There are therefore no old Mandelbrot grid ranges
to repeat. Existing shipped views are reference anchors, not novelty claims.
The sources and their inclusion/exclusion reasons are in `manifest.priorCoverage`.
Other simulations' historical grids are untouched.

Coarse: three shipped anchors from `src/app/presets.ts`:
`(-0.5,0,1)`, `(-0.75,0.047,18)`, and `(-0.761574,-0.0847596,96)`.
For each, multiply zoom by `[1.2,1.6,2.2,3]` and offset both centre coordinates
by each of `[-0.12,+0.12] * 3/anchorZoom`: **3×4×2×2=48** views.
Centres round to 12 decimals and zoom to six. Nearby windows at all three
shipped scales were included regardless of their score.

Refinement: take the leading coarse window in each anchor-scale region:
`(-0.765324,-0.0885096,288)`, `(-0.14,-0.36,2.2)` and
`(-0.77,0.067,54)`. Around each, zoom factors `[1.15,1.45]` and centre offsets
`[-0.06,+0.06] * 3/refinementZoom` yield **24** additional views, below the
32-view limit. The whole-set positive/negative-y conjugates tie; only the
negative-y view was refined. They are not distinct geometric discoveries.
The expanded final config has **72 unique candidate IDs and parameter sets**,
plus four differently named reference rows. Repeated runs of already-declared
views were validation repeats, not additional searched candidates.

Not searched: the full navigation slider product, far/deep zooms, arbitrary new
anchors, palette phase/speed, alternative iteration budgets as a ranking axis,
rotation, stochastic seeds or dynamic variants. Max iterations vary only for
explicit validation/reference comparisons. Logistic-mandelbrot and its parked
arc are wholly excluded. No fake fractal simulation or preset was introduced.

## Calibration controls (32²)

| control | interior fraction | edge | coarse edge | entropy | score |
|---|---:|---:|---:|---:|---:|
| empty | 1.000000000 | 0.000000000 | 0.000000000 | 0.000000000 | 0.000000000 |
| full | 0.000000000 | 0.000000000 | 0.000000000 | 0.000000000 | 0.000000000 |
| split | 0.500000000 | 0.016129032 | 0.033333333 | 1.000000000 | 0.021715141 |
| bands | 0.500000000 | 0.112903226 | 0.233333333 | 1.000000000 | 0.097283831 |
| noise | 0.524414062 | 0.506048387 | 0.514583333 | 0.998279489 | 0.000000000 |

The empty/full controls mean all zero/all one fields respectively. The vertical
half-plane gives exactly `edge=1/62`, `p=1/2`. Four-cell bands beat the split
plane and deterministic LCG binary noise (seed 1234567); the split plane beats
both flat controls. These frozen controls prove calibration, not a real
Mandelbrot discovery. Their definitions are preserved in the frozen oracle.

## Ranked candidates (128²)

Full descending rankings and parameters for every one of the 72 views are in
the linked result JSON. The first 12 are below; C denotes an original coarse
view and R a refinement. All use the fixed geometry parameters above.

| rank | phase | centerX | centerY | zoom | score | interior | edge | coarse edge | binary entropy |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | R | -0.765949 | -0.0891346 | 417.6 | 0.040717279 | 0.565125 | 0.048259 | 0.054688 | 0.987728 |
| 2 | R | -0.764699 | -0.0891346 | 417.6 | 0.039715867 | 0.392273 | 0.048751 | 0.057447 | 0.966251 |
| 3 | R | -0.764699 | -0.0878846 | 417.6 | 0.039241696 | 0.462891 | 0.043000 | 0.052300 | 0.996023 |
| 4 | R | -0.764699 | -0.0891346 | 331.2 | 0.036044683 | 0.409302 | 0.042354 | 0.049045 | 0.976132 |
| 5 | R | -0.764699 | -0.0878846 | 331.2 | 0.036017985 | 0.458984 | 0.040108 | 0.046255 | 0.995141 |
| 6 | R | -0.765949 | -0.0878846 | 417.6 | 0.035021399 | 0.638916 | 0.045306 | 0.052207 | 0.943579 |
| 7 | R | -0.765949 | -0.0891346 | 331.2 | 0.034929302 | 0.546265 | 0.037863 | 0.045480 | 0.993815 |
| 8 | R | -0.765949 | -0.0878846 | 331.2 | 0.034199799 | 0.599731 | 0.040170 | 0.046813 | 0.971107 |
| 9 | C | -0.765324 | -0.0885096 | 288 | 0.033156504 | 0.497070 | 0.034910 | 0.042070 | 0.999975 |
| 10 | C | -0.757824 | -0.0810096 | 115.2 | 0.032375972 | 0.356873 | 0.040201 | 0.048952 | 0.940057 |
| 11 | C | -0.765324 | -0.0885096 | 211.2 | 0.028216239 | 0.496399 | 0.029097 | 0.034784 | 0.999963 |
| 12 | C | -0.14 | -0.36 | 2.2 | 0.023195607 | 0.545349 | 0.019777 | 0.032893 | 0.994058 |

## Current references and provenance

`src/app/presets.ts` defines three presets; `src/sims/mandelbrot/kernel.ts`
defines the default. All four current references were measured, including the
intentional identical-default/Whole-set duplicate under distinct reference IDs.
The app preset omits `autoIterations`, whose kernel default is true; this is
explicitly pinned. Geometry overrides phase and speed to zero. Original shipped
phase/speed values are Whole set `0/0.25`, Seahorse valley `0.08/0.35`, Spiral hub
`0.28/0.55`; the kernel default is `0/0.1`. No original preset value was changed.
These are current 137 reference IDs, not retroactive changes to historical rows.

| reference | centerX | centerY | zoom | base iterations | effective | score | interior |
|---|---:|---:|---:|---:|---:|---:|---:|
| Kernel default (motion disabled) | -0.5 | 0 | 1 | 128 | 128 | 0.006821870 | 0.170898 |
| whole-set (motion disabled) | -0.5 | 0 | 1 | 128 | 128 | 0.006821870 | 0.170898 |
| seahorse-valley (motion disabled) | -0.75 | 0.047 | 18 | 256 | 456 | 0.001174419 | 0.933411 |
| spiral-hub (motion disabled) | -0.761574 | -0.0847596 | 96 | 384 | 700 | 0.029157041 | 0.435303 |

References retain their shipped iteration budgets. Candidates use base 512.
Therefore a scalar improvement cannot by itself establish superiority at equal
compute cost. Viewport, renderer, palette, colour controls and disabled motion
are equal in the app comparison; view geometry and the stated intrinsic
iteration parameters differ. Numerical doubling checks expose rather than hide
that confound.

## Evidence finalists and visual interpretation

One leading view from each anchor-scale region was retained, at ranks 1, 12 and
26. This preserves three regions instead of treating adjacent high scores or
conjugate mirrors as three new findings. These are evidence finalists, all
rejected as automatic promotion proposals.

- **Fine shoreline, rank 1:** diagonal edge lined with large dark bulbs,
  repeating curled arms and bright knots. It is recognisably related to the
  shipped Spiral hub at a tighter scale, rather than a wholly new family.
  Small bright points sit on coherent curls, not a random all-frame noise
  field. The visible edge exits the top and bottom; some bulbs are cropped.
  The 2.2568% membership change on doubling prevents a convergence claim.
- **Broad coastline, rank 12:** a large cardioid-like dark mass and adjoining
  bulbs occupy much of the frame. The broad view is less delicate and the upper
  outline is cropped. Its increased numerical balance/detail does not make it
  a better general Whole-set replacement; at phase zero the app is mostly dark.
- **Valley edge, rank 26:** a narrow tapering channel between two boundaries,
  with many small curls. The boundary enters/exits the frame and interior fills
  roughly three quarters of the square field. It is a closer variant of the
  current Seahorse valley, not evidence of a new connectedness class.

These are manual findings from the linked app captures and masks. No hull,
filament or connectivity classification was inferred from a new numerical
label. No aesthetic superiority, distributional robustness or mathematical
membership guarantee is claimed.

Actual app captures are **1200×900**, device scale 1, paused, palette Inferno,
gamma 0.7, contrast 1.5, steps 0, point size 1, bloom 0.3, invert false, phase 0/speed 0.
The renderer reports `webgl2`, `gpu-fragment`, full render quality and fractal
supersample 1.50. The navigation camera remains at its initial ×1.00; the kernel
zoom is the recorded parameter. The panel is collapsed equally in all captures.
UI range `step=any` is set before input/change events to avoid rounding precise
candidate coordinates; no production control or preset is changed.

The CPU **escape grayscale** PNGs use raw channel amplitude and can look almost
black at high iteration limits. The separate **membership masks** are binary
zero=black/nonzero=white. They are square **256×256** scientific field images,
not app screenshots. App GPU arithmetic, supersampling and 4:3 aspect are
separate visual validation; no CPU/GPU pixel-equivalence claim is made.
The comparison mask uses the doubled limit shown below.

| evidence row | actual app 1200×900 | CPU escape 256² | CPU membership 256² | CPU comparison membership 256² |
|---|---|---|---|---|
| candidate: `centerX-0.765949_centerY-0.0891346_zoom417.6` | [app](../images/sweeps-2026-10-30/137-centerX-0.765949_centerY-0.0891346_zoom417.6-app.png) | [escape field](../images/sweeps-2026-10-30/137-centerX-0.765949_centerY-0.0891346_zoom417.6-field-256.png) | [mask](../images/sweeps-2026-10-30/137-centerX-0.765949_centerY-0.0891346_zoom417.6-membership-256.png) | [comparison mask](../images/sweeps-2026-10-30/137-centerX-0.765949_centerY-0.0891346_zoom417.6-comparison-membership-256.png) |
| current reference: `137-current-spiral-hub` | [app](../images/sweeps-2026-10-30/137-137-current-spiral-hub-app.png) | [escape field](../images/sweeps-2026-10-30/137-137-current-spiral-hub-field-256.png) | [mask](../images/sweeps-2026-10-30/137-137-current-spiral-hub-membership-256.png) | [comparison mask](../images/sweeps-2026-10-30/137-137-current-spiral-hub-comparison-membership-256.png) |
| candidate: `centerX-0.14_centerY-0.36_zoom2.2` | [app](../images/sweeps-2026-10-30/137-centerX-0.14_centerY-0.36_zoom2.2-app.png) | [escape field](../images/sweeps-2026-10-30/137-centerX-0.14_centerY-0.36_zoom2.2-field-256.png) | [mask](../images/sweeps-2026-10-30/137-centerX-0.14_centerY-0.36_zoom2.2-membership-256.png) | [comparison mask](../images/sweeps-2026-10-30/137-centerX-0.14_centerY-0.36_zoom2.2-comparison-membership-256.png) |
| current reference: `137-current-whole-set` | [app](../images/sweeps-2026-10-30/137-137-current-whole-set-app.png) | [escape field](../images/sweeps-2026-10-30/137-137-current-whole-set-field-256.png) | [mask](../images/sweeps-2026-10-30/137-137-current-whole-set-membership-256.png) | [comparison mask](../images/sweeps-2026-10-30/137-137-current-whole-set-comparison-membership-256.png) |
| candidate: `centerX-0.766666666667_centerY0.070333333333_zoom62.1` | [app](../images/sweeps-2026-10-30/137-centerX-0.766666666667_centerY0.070333333333_zoom62.1-app.png) | [escape field](../images/sweeps-2026-10-30/137-centerX-0.766666666667_centerY0.070333333333_zoom62.1-field-256.png) | [mask](../images/sweeps-2026-10-30/137-centerX-0.766666666667_centerY0.070333333333_zoom62.1-membership-256.png) | [comparison mask](../images/sweeps-2026-10-30/137-centerX-0.766666666667_centerY0.070333333333_zoom62.1-comparison-membership-256.png) |
| current reference: `137-current-seahorse-valley` | [app](../images/sweeps-2026-10-30/137-137-current-seahorse-valley-app.png) | [escape field](../images/sweeps-2026-10-30/137-137-current-seahorse-valley-field-256.png) | [mask](../images/sweeps-2026-10-30/137-137-current-seahorse-valley-membership-256.png) | [comparison mask](../images/sweeps-2026-10-30/137-137-current-seahorse-valley-comparison-membership-256.png) |
| current kernel default | [app](../images/sweeps-2026-10-30/137-137-current-default-app.png) | [escape field](../images/sweeps-2026-10-30/137-137-current-default-field-256.png) | [mask](../images/sweeps-2026-10-30/137-137-current-default-membership-256.png) | [comparison mask](../images/sweeps-2026-10-30/137-137-current-default-comparison-membership-256.png) |

## Iteration and resolution validation

Each finalist and every current reference was independently reconstructed at
256². With the helper's zoom boost `b`, effective `L` is doubled by requesting
`base2=2*L-b`, not by doubling the old base. Base2048 and effective 4096 are hard
ceilings, not measurement settings or promised achieved limits. All seven
primary comparisons genuinely double their actual effective limits.

| view | score128 | score256 | effective → comparison | zero/nonzero pixels changed at256 | score256 at comparison |
|---|---:|---:|---|---:|---:|
| `centerX-0.765949_centerY-0.0891346_zoom417.6` | 0.040717279 | 0.037083260 | 929 → 1858 | 2.256775% | 0.025066655 |
| `centerX-0.14_centerY-0.36_zoom2.2` | 0.023195607 | 0.014025346 | 566 → 1132 | 0.067139% | 0.014056499 |
| `centerX-0.766666666667_centerY0.070333333333_zoom62.1` | 0.017994360 | 0.014204885 | 797 → 1594 | 0.837708% | 0.011030915 |
| `137-current-default` | 0.006821870 | 0.004365155 | 128 → 256 | 0.164795% | 0.004103011 |
| `137-current-whole-set` | 0.006821870 | 0.004365155 | 128 → 256 | 0.164795% | 0.004103011 |
| `137-current-seahorse-valley` | 0.001174419 | 0.000859106 | 456 → 912 | 0.276184% | 0.000785694 |
| `137-current-spiral-hub` | 0.029157041 | 0.025356529 | 700 → 1400 | 1.249695% | 0.015219972 |

Scores at different pixel sizes are not expected to match: edge fractions
measure a pixel-scale boundary. Among the seven checked rows, Spiral candidate
and Spiral reference stay first and second at both resolutions; broad and
valley candidates swap order at 256². This is explicitly resolution sensitivity,
not a failed exact-input replay or grounds for widening tolerance. At doubled
limits the broad candidate exceeds the valley candidate again.

The fine finalist's 256² score falls from 0.037083260 to 0.025066655 when the
actual limit doubles 929→1858. The stable broad window changes only 0.067139%
of membership cells at 566→1132. The valley candidate changes 0.837708% at 797→1594.
None of these percentages is an acceptance threshold invented after the run;
they are readings and uncertainty, with the raw metric objects retained.

An additional cap probe of the fine finalist sets base 2048 at the same zoom:
actual effective 2465. The desired double 4930 would require base 4513, so it
cannot be run. The actual 2465 is compared with lower effective 1232/base 815;
1.655579% of membership pixels change, score 0.031578893→0.022136845. This is a
**cap-limited comparison**, not exact doubling or proof of convergence.

## Pathology, endpoints and off-frame clipping

All 76 primary rows have finite metrics, zero non-finite fraction, zero
out-of-range fraction, and zero samples at the upper channel endpoint 1. Their
lower endpoint 0 is the measured interior/unresolved fraction, not an unexplained
black-pixel failure. No row is a solid field, and no measured score is non-finite.
The frozen flat/noise controls score0; they cannot win this instrument.

Border diagnostics expose windows cutting through the boundary. Border interior
fraction counts zero cells on the frame perimeter; border crossings count lag1
crossing pairs touching that perimeter. They are a clipping indicator, not a
measured fraction of an unknown complete off-frame object. No extrapolated
outside-field area is claimed.

| view (256²) | lower endpoint / interior | upper endpoint | border interior | border crossings |
|---|---:|---:|---:|---:|
| `centerX-0.765949_centerY-0.0891346_zoom417.6` | 0.566070557 | 0.000000000 | 0.537254902 | 45 |
| `centerX-0.14_centerY-0.36_zoom2.2` | 0.545150757 | 0.000000000 | 0.263725490 | 15 |
| `centerX-0.766666666667_centerY0.070333333333_zoom62.1` | 0.732879639 | 0.000000000 | 0.851960784 | 21 |
| `137-current-default` | 0.170471191 | 0.000000000 | 0.000000000 | 0 |
| `137-current-whole-set` | 0.170471191 | 0.000000000 | 0.000000000 | 0 |
| `137-current-seahorse-valley` | 0.932708740 | 0.000000000 | 0.929411765 | 14 |
| `137-current-spiral-hub` | 0.433609009 | 0.000000000 | 0.573529412 | 142 |

The enlarged candidate windows deliberately clip a continuing shoreline. Whole
set/default remain wholly framed (zero border crossings); the two shipped
close views also cut continuing boundaries. No clipped candidate is proposed as
a whole-object view or promoted on its cropping advantage.

## Exact replay, checks and reproduction

The runner reconstructs three finalists and four references at 128² and matches
every static metric with maximum absolute deviation **0**, tolerance 1e-9.
A separate opt-in test bypasses the registry driver and imports the real kernel
and exported metrics directly into Chromium. It replays **all 72 candidates and
four references**, obtaining identical candidate ordering and maximum static
metric deviation **0**. It also independently checks all current preset params.
Raw 128² Float32-equivalent fields and their hashes are retained for the seven
shortlist/reference rows (linked below). Validation resolution is a different
experiment, not an exact replay.

Runtime: Chromium 148.0.7778.96, Node v26.5.0, macOS. The Vite server was started
from this run worktree after verifying port 5173 vacant. Only that owned server
is stopped at worker close-out. No external preview was reused or terminated.

```bash
npm run verify
SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 137 "
SWEEP_REPLAY=137 npx playwright test e2e/sweep.spec.ts -g "137 independently replay"
SWEEP_CONTRACT=137 npx playwright test e2e/sweep-137.contract.spec.ts
scripts/check-contract-test-gate.sh --worktree
npx playwright test e2e/sweep.spec.ts -g "metrics harness|non-phase|multi-snapshot summary|Lorenz multi-snapshot|circular autocorrelation"
npx playwright test e2e/sweep.spec.ts -g "static boundary diagnostics"
```

`npm run verify`: exit 0, 395 passed/38 skipped kernel tests, typecheck and build
green. Skips are not passes. New sweep: exit 0,**one executed test**,72/72
candidates and 4/4 current references, no skipped sweep. Exact replay: exit 0,
one executed test,76/76 fields. Supplemental diagnostic test: exit 0.
Full frozen oracle and worktree gate results are recorded in the linked
[verification record](data/2026-10-30/137/verification.json).

The selected historical browser baseline retains the card's known Gray-Scott
exact-literal failure before 143: expected score 0.7102674508287455, actual
0.7065245840037978. Other actual readings are entropy 0.6988568702841468,
variance 0.015872195007509353, autocorrelation 0.9341877961656685,
coverage 0.692138671875 and flux 0.0004988930676859127. The unchanged HEAD versions
of all five original harness/spec files were extracted into scratch and rerun
against the unchanged production kernel; all six actual readings match exactly.
No old literal or frozen assertion was edited. The exact card baseline yields
4 passed, 1 failed, 1 opt-in skipped; this is not a whole-suite PASS. A combined
run including the new supplemental diagnostic yields 5 passed, 1 failed, 1 skipped.

The first attempted command had a config-parenthesis parse error (exit 1), fixed
before measurement. The first executing coarse attempt was interrupted while
waiting for an off-screen Pause button; no completion was claimed. A corrected
coarse run completed 48+4; refined runs completed 72+4. Additional repeated runs
validated capture/manifest changes, not extra unique search views. The final
exact command and outputs supersede these incomplete attempts.

## Proposed promotions

**None.** Retain three measured evidence finalists for operator review. The
fine view has unresolved iteration sensitivity; the other two do not establish
a useful new visual family or an improved shipped default. Research acceptance
can pass with this negative result; production promotion remains a separate
operator decision. No default/preset or release change is part of this stage.

## Retained raw fields and exploratory images

The following exact 128² fields correspond to the replay hashes in the result
JSON. They are kernel data, not renderer screenshots.

- [`centerX-0.765949_centerY-0.0891346_zoom417.6` raw field](data/2026-10-30/137/centerX-0.765949_centerY-0.0891346_zoom417.6.field-128.json)
- [`centerX-0.14_centerY-0.36_zoom2.2` raw field](data/2026-10-30/137/centerX-0.14_centerY-0.36_zoom2.2.field-128.json)
- [`centerX-0.766666666667_centerY0.070333333333_zoom62.1` raw field](data/2026-10-30/137/centerX-0.766666666667_centerY0.070333333333_zoom62.1.field-128.json)
- [`137-current-default` raw field](data/2026-10-30/137/137-current-default.field-128.json)
- [`137-current-whole-set` raw field](data/2026-10-30/137/137-current-whole-set.field-128.json)
- [`137-current-seahorse-valley` raw field](data/2026-10-30/137/137-current-seahorse-valley.field-128.json)
- [`137-current-spiral-hub` raw field](data/2026-10-30/137/137-current-spiral-hub.field-128.json)

These intermediate coarse-stage captures are preserved as exploration only.
They precede explicitly pinned final presentation settings and are excluded
from the equal-presentation final comparison above.

- [Exploratory 137-centerX-0.14_centerY0.36_zoom2.2-app](../images/sweeps-2026-10-30/137-centerX-0.14_centerY0.36_zoom2.2-app.png)
- [Exploratory 137-centerX-0.14_centerY0.36_zoom2.2-field-256](../images/sweeps-2026-10-30/137-centerX-0.14_centerY0.36_zoom2.2-field-256.png)
- [Exploratory 137-centerX-0.14_centerY0.36_zoom2.2-membership-256](../images/sweeps-2026-10-30/137-centerX-0.14_centerY0.36_zoom2.2-membership-256.png)
- [Exploratory 137-centerX-0.765324_centerY-0.0885096_zoom288-app](../images/sweeps-2026-10-30/137-centerX-0.765324_centerY-0.0885096_zoom288-app.png)
- [Exploratory 137-centerX-0.765324_centerY-0.0885096_zoom288-field-256](../images/sweeps-2026-10-30/137-centerX-0.765324_centerY-0.0885096_zoom288-field-256.png)
- [Exploratory 137-centerX-0.765324_centerY-0.0885096_zoom288-membership-256](../images/sweeps-2026-10-30/137-centerX-0.765324_centerY-0.0885096_zoom288-membership-256.png)

Exploratory coarse raw fields (not additional final shortlist entries):

- [centerX-0.14_centerY0.36_zoom2.2.field-128.json](data/2026-10-30/137/centerX-0.14_centerY0.36_zoom2.2.field-128.json)
- [centerX-0.765324_centerY-0.0885096_zoom288.field-128.json](data/2026-10-30/137/centerX-0.765324_centerY-0.0885096_zoom288.field-128.json)
