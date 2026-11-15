# Burning Ship boundary interestingness sweep — card 138

> **Evidence files.** Sweep evidence (ranked JSON, manifests, screenshots) is not kept in the repository; the harness writes it to git-ignored folders. File names below are plain text so they can be matched against a local run.

Static boundary detail around the three shipped Burning Ship views. Method `static-boundary-v1` (geometry only, no time, palette or flux term). Part of the shared fractal coverage in [fractal-interestingness.md](fractal-interestingness.md).

```bash
SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 138 "
SWEEP_REPLAY=138 npx playwright test e2e/sweep.spec.ts -g "138 independently replay"
SWEEP_CONTRACT=138 npx playwright test e2e/sweep-138.contract.spec.ts
```

Retained data: `burning-ship.json` (ranked, references, manifest, finalists, replay, validation), `coarse-results.json` (first 48 views), manifests `manifest-coarse.json` and `manifest-refined.json`, and per-finalist raw 128×128 fields beside them.

## Method

- Search allowance 48 coarse + 24 refined views (72 of the allowed 80), each scored at 128×128 on the Escape channel, zero warmup steps, dt 1, base `maxIterations` 512 with adaptive detail on, `palettePhase=0`, `cycleSpeed=0`.
- Coarse: the three shipped anchors (harbour −0.5,−0.5 ×1; mast −1.755,−0.03 ×14; ridge-deep −1.744,−0.017 ×72) × zoom factors 1.2, 1.6, 2.2, 3 × centre offsets ±0.2 of the anchor span (3.4/zoom) on each axis = 48 views.
- Refined: the leading coarse view in each anchor-scale region × factors 1.15, 1.45 × offsets ±0.1 of its span = 24 views. The three centres were read from the retained coarse ranking, then the whole 72-view list was re-run (deterministic, so the first 48 repeat exactly).
- Metrics: `staticBoundaryMetrics`: interior fraction (zero escape cells), edge density (non-wrapping neighbour pairs crossing zero/nonzero), coarse edge density, entropy and a composite score in [0,1]. Calibration controls (empty, full, half-plane, bands, noise) are in the JSON. Non-finite fraction and out-of-range fraction were 0 for every candidate and reference; endpoint fractions are in each row's metrics.
- Prior coverage: none. Burning Ship had no earlier sweep config, so no old grid was repeated; sources are cited in the manifest `priorCoverage`.
- Searched extent (all 72 views, from `manifest-coarse.json` and `manifest-refined.json`): centerX −1.81461038961 to 0.293333333333, centerY −1.293333333333 to 0.18, zoom 1.2 to 216. The refinement reaches beyond the coarse ±0.2 span: the harbour-region refinement spans centerX up to 0.293333333333, centerY down to −1.293333333333 with the harbour-region finalist at zoom 4.35.
- Not searched: palette, cycling, centres outside the extent above (coarse ±0.2 anchor span; refinement ±0.1 of the refined span), zoom outside 1.2 to 216 (3× the deepest anchor), iteration count as a parameter.

## Ranked candidates (top 12 of 72)

| rank | centerX | centerY | zoom | score | interior | edge | coarse edge | entropy |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | -1.757379629629 | -0.011490740741 | 99.36 | 0.0244 | 0.520 | 0.0216 | 0.0330 | 0.999 |
| 2 | 0.293333333333 | -1.066666666667 | 4.35 | 0.0215 | 0.467 | 0.0207 | 0.0268 | 0.997 |
| 3 | -1.749509259259 | -0.011490740741 | 99.36 | 0.0209 | 0.407 | 0.0191 | 0.0301 | 0.975 |
| 4 | 0.066666666667 | -1.066666666667 | 4.35 | 0.0209 | 0.478 | 0.0217 | 0.0241 | 0.999 |
| 5 | 0.066666666667 | -1.066666666667 | 3.45 | 0.0200 | 0.444 | 0.0200 | 0.0245 | 0.991 |
| 6 | 0.293333333333 | -1.066666666667 | 3.45 | 0.0199 | 0.396 | 0.0203 | 0.0268 | 0.969 |
| 7 | -1.749509259259 | -0.011490740741 | 125.28 | 0.0197 | 0.530 | 0.0175 | 0.0259 | 0.997 |
| 8 | -1.753444444444 | -0.007555555556 | 86.4 | 0.0194 | 0.383 | 0.0187 | 0.0283 | 0.960 |
| 9 | -1.753444444444 | -0.007555555556 | 115.2 | 0.0191 | 0.551 | 0.0165 | 0.0262 | 0.993 |
| 10 | 0.18 | -1.18 | 3 | 0.0173 | 0.324 | 0.0214 | 0.0262 | 0.909 |
| 11 | -1.757379629629 | -0.011490740741 | 125.28 | 0.0171 | 0.707 | 0.0222 | 0.0304 | 0.872 |
| 12 | -1.757379629629 | -0.003620370371 | 99.36 | 0.0170 | 0.485 | 0.0141 | 0.0230 | 0.999 |

The full ranking is in the JSON. Three views score exactly zero. Scores span 0 to 0.024 in total, so the whole sweep sits in a narrow low band; the gaps between neighbouring ranks are small and should not be read as a strong ordering.

## Current references (motion disabled)

| rank | centerX | centerY | zoom | score | interior | edge | coarse edge | entropy |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 138-current-default | -1.755 | -0.03 | 14 | 0.0000 | 0.014 | 0.0033 | 0.0061 | 0.105 |
| 138-current-harbour | -0.5 | -0.5 | 1 | 0.0058 | 0.154 | 0.0152 | 0.0242 | 0.619 |
| 138-current-mast | -1.755 | -0.03 | 14 | 0.0000 | 0.014 | 0.0033 | 0.0061 | 0.105 |
| 138-current-ridge-deep | -1.744 | -0.017 | 72 | 0.0105 | 0.229 | 0.0158 | 0.0265 | 0.777 |

The kernel default and the mast preset share geometry, so they score identically. The shipped mast view scores 0.000: nearly all its cells escape and the interior is only 1.4%.

## Iteration-limit convergence at 256×256

Doubling is done on the effective limit, compensating the automatic zoom boost.

| id | effective limit | exact doubling | membership changed | score | doubled score |
|---|---|---|---:|---:|---:|
| `centerX-1.757379629629_centerY-0.011490740741_zoom99` | 830 → 1660 | yes | 0.0060 | 0.0180 | 0.0154 |
| `centerX0.293333333333_centerY-1.066666666667_zoom4.3` | 613 → 1226 | yes | 0.0082 | 0.0182 | 0.0153 |
| `centerX-1.792532467532_centerY0.007532467532_zoom44.` | 775 → 1550 | yes | 0.0020 | 0.0009 | 0.0008 |
| `138-current-default` | 442 → 884 | yes | 0.0004 | 0.0000 | 0.0000 |
| `138-current-harbour` | 128 → 256 | yes | 0.0046 | 0.0045 | 0.0036 |
| `138-current-mast` | 442 → 884 | yes | 0.0004 | 0.0000 | 0.0000 |
| `138-current-ridge-deep` | 680 → 1360 | yes | 0.0034 | 0.0070 | 0.0061 |
| iteration cap probe (base 2048, top view) | 2366 → 1183 (lower reference) | no (capped; requested 4732) | 0.0053 | 0.0146 | 0.0168 |

Every finalist and reference doubled exactly within the cap. The cap probe could not: doubling 2366 exceeds 4096, so it compares the capped limit with a lower reference and carries cap-limited uncertainty. Membership moves by well under 1% of cells in every case, so the boundary positions are stable at doubled limits; the harbour-region and ridge finalists lose about 14–16% of their score at the doubled limit (the mast-region one is near zero throughout), which is the honest size of the iteration sensitivity.

## Finalist evidence

### ridge-deep filament region: candidate rank 1 (score 0.0244) versus `138-current-ridge-deep`

Candidate `centerX-1.757379629629_centerY-0.011490740741_zoom99.36`; params `{"maxIterations": 512, "autoIterations": true, "palettePhase": 0, "cycleSpeed": 0, "centerX": -1.757379629629, "centerY": -0.011490740741, "zoom": 99.36}`.

- candidate app renderer screenshot (1200×900): `138-centerX-1.757379629629_centerY-0.011490740741_zoom99.36-app.png`
- candidate grayscale escape field 256×256: `138-centerX-1.757379629629_centerY-0.011490740741_zoom99.36-field-256.png`
- candidate membership mask (zero/nonzero) 256×256: `138-centerX-1.757379629629_centerY-0.011490740741_zoom99.36-membership-256.png`
- candidate doubled-limit comparison mask 256×256: `138-centerX-1.757379629629_centerY-0.011490740741_zoom99.36-comparison-membership-256.png`
- reference app renderer screenshot (1200×900): `138-138-current-ridge-deep-app.png`
- reference grayscale escape field 256×256: `138-138-current-ridge-deep-field-256.png`
- reference membership mask 256×256: `138-138-current-ridge-deep-membership-256.png`
- reference doubled-limit comparison mask 256×256: `138-138-current-ridge-deep-comparison-membership-256.png`

### harbour hull region: candidate rank 2 (score 0.0215) versus `138-current-harbour`

Candidate `centerX0.293333333333_centerY-1.066666666667_zoom4.35`; params `{"maxIterations": 512, "autoIterations": true, "palettePhase": 0, "cycleSpeed": 0, "centerX": 0.293333333333, "centerY": -1.066666666667, "zoom": 4.35}`.

- candidate app renderer screenshot (1200×900): `138-centerX0.293333333333_centerY-1.066666666667_zoom4.35-app.png`
- candidate grayscale escape field 256×256: `138-centerX0.293333333333_centerY-1.066666666667_zoom4.35-field-256.png`
- candidate membership mask (zero/nonzero) 256×256: `138-centerX0.293333333333_centerY-1.066666666667_zoom4.35-membership-256.png`
- candidate doubled-limit comparison mask 256×256: `138-centerX0.293333333333_centerY-1.066666666667_zoom4.35-comparison-membership-256.png`
- reference app renderer screenshot (1200×900): `138-138-current-harbour-app.png`
- reference grayscale escape field 256×256: `138-138-current-harbour-field-256.png`
- reference membership mask 256×256: `138-138-current-harbour-membership-256.png`
- reference doubled-limit comparison mask 256×256: `138-138-current-harbour-comparison-membership-256.png`

### mast region: candidate rank 44 (score 0.0013) versus `138-current-mast`

Candidate `centerX-1.792532467532_centerY0.007532467532_zoom44.66`; params `{"maxIterations": 512, "autoIterations": true, "palettePhase": 0, "cycleSpeed": 0, "centerX": -1.792532467532, "centerY": 0.007532467532, "zoom": 44.66}`.

- candidate app renderer screenshot (1200×900): `138-centerX-1.792532467532_centerY0.007532467532_zoom44.66-app.png`
- candidate grayscale escape field 256×256: `138-centerX-1.792532467532_centerY0.007532467532_zoom44.66-field-256.png`
- candidate membership mask (zero/nonzero) 256×256: `138-centerX-1.792532467532_centerY0.007532467532_zoom44.66-membership-256.png`
- candidate doubled-limit comparison mask 256×256: `138-centerX-1.792532467532_centerY0.007532467532_zoom44.66-comparison-membership-256.png`
- reference app renderer screenshot (1200×900): `138-138-current-mast-app.png`
- reference grayscale escape field 256×256: `138-138-current-mast-field-256.png`
- reference membership mask 256×256: `138-138-current-mast-membership-256.png`
- reference doubled-limit comparison mask 256×256: `138-138-current-mast-comparison-membership-256.png`

Current-default reference (`138-current-default`, identical parameters to the mast reference, so its images repeat the mast ones) images, listed so all 28 retained images are accounted for:

- default app renderer screenshot (1200×900): `138-138-current-default-app.png`
- default grayscale escape field 256×256: `138-138-current-default-field-256.png`
- default membership mask 256×256: `138-138-current-default-membership-256.png`
- default doubled-limit comparison mask 256×256: `138-138-current-default-comparison-membership-256.png`

App screenshots are the real GPU renderer at 1200×900 with inferno palette, gamma 0.7, contrast 1.5, bloom 0.3, paused, phase and speed 0, after a 3 s settle. Field and mask PNGs are grayscale CPU kernel fields at 256×256 and are not renderer output. Caveat: the app views are landscape, use their own camera and could not be matched cell for cell to the square CPU fields (for example the mast reference sits small in the frame centre), so the screenshots and the scored fields are corroborating, not identical, evidence. The app HUD zoom badge reads ×14.0 in every screenshot, because the harness sets parameters through the input events and the badge does not follow them; the inputs were read back and matched every candidate parameter, and the rendered views differ as expected.

## Manual visual findings

- Harbour reference (zoom 1): a recognisable whole ship, hull and mast with a speckled upper boundary; the app render is a sparse speckle on black.
- Harbour-region candidate (centre 0.29,−1.07; zoom 4.35): a wide dense speckled band running across the frame over a large solid interior. It has more boundary than the harbour reference but is a bare stretch of the ship's flank rather than a recognisable hull.
- Mast reference (zoom 14): the app render is a small speckled arc in the middle of an otherwise black frame, and the CPU field is mostly escaped cells with a 1.4% interior. It scores zero and reads as nearly empty.
- Mast-region candidate (zoom 44.7): a band of speckle along the lower edge and a diagonal sliver; barely different from the mast reference in character and scoring only 0.0005 at the coarse stage.
- Ridge-deep reference (zoom 72): a speckled rim and a thin filament arc. The ridge candidate (zoom 99) has a similar rim with a longer straight filament, a larger solid interior, and a slightly higher score.
- Across all views the renderer shows mostly speckle rather than smooth connected filaments; at this iteration limit and viewport no candidate shows a clearly richer filament structure than the shipped views. These are my reading of the images, not a calibrated label.

## Interpretation

The static score rewards boundary length and balance between interior and escaped area, not visual interest. The best candidates gain over the shipped views mainly by moving from windows with almost no interior (default/mast, 1–6%) to windows split roughly half and half, which a human may or may not prefer. The sweep therefore has no strong positive result.

## Proposed promotions

None. The ridge candidate and the harbour-region candidate are measurably more boundary-rich than their shipped references, but the gain is small (best 0.024 against 0.011 for the best reference) and the screenshots do not show a clearly better view. The mast region has no candidate worth proposing. Preset changes, if any, need the operator's visual sign-off after reading the images above; this report changes no preset or default.
