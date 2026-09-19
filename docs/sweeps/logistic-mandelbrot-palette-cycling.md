# Logistic-Mandelbrot cycle-palette sweep — 2026-09-19

Brief from the operator: find the palette for Cycle mode that shows colour
bands sweeping out from the set's edge with some sharp edges, without acid
colours, at a band frequency that completes at least once per camera turn
but does not flicker. Amber was the operator's own pick; the two cyclic
presets were liked but do not separate bands.

Background analysis, including why a bulb changes colour in 3D and not in
the plane, is in `docs/plans/2026-09-19-logistic-mandelbrot-colour-field-review.md`.

## Verdict, in order of effect

1. **The cloud bleaches every palette to white, so palette choice is
   second-order until that is fixed.** Mean OKLab chroma over lit pixels of
   the rendered frame is 0.012 to 0.023 for all six candidates, including
   the shipped amber; a saturated ramp texel has chroma around 0.15. The
   cause is the tone map in `orbit3d.ts` (`TONEMAP_FRAGMENT_SHADER`): it
   applies `1 - exp(-hdr * exposure)` per channel, so any additive stack
   bright enough to matter drives all three channels toward 1 and the hue
   collapses. Sheets stack eight samples per cell. A hue-preserving tone map
   (map luminance, scale the colour by the luminance ratio, soft-clip) is
   the fix, and it is a renderer change with its own card, 97.
2. **Band spacing was the wrong constant, and is now a parameter.** At the
   shipped 1.5 laps per c-unit no bulb holds a complete band, so bulbs
   change colour as blocks. `cycleBands` (View section, live, no rebuild)
   exposes it; at 5 the cardioid on the ground plane shows two full
   concentric bands and the cardioid sheet carries them upward. Default is
   left at 1.5 so nothing changes until the operator chooses. Recommended
   value: 4 to 5.
3. **Contrast 2.4 is the wrong setting for a cycling ramp.** It clips 58%
   of every lap to the floor or ceiling colour, which leaves a two-tone
   plane with a fringe. The seam the operator likes is the wrap from
   ceiling to floor and exists at any contrast, because the ramp is not
   cyclic. Offline, amber scores 0.95 at contrast 1.4 and 0.47 at 2.4.
   Recommended: contrast 1.4 to 1.8, gamma 1.2 to 1.65.
4. **Palette.** On rendered-frame numbers magma at contrast 1.8 has the most
   band edges (0.29 of lit pixels), the most colour travel per third of a
   lap (11.4 OKLab×100 against 7.8 to 8.7 for the others) and the highest
   surviving chroma, with no neon pixels. Rosewood is the warm alternative
   closest to amber, with a rose-to-cream lap. The three sweep presets
   (Rosewood, Dusk, Verdigris) are shipped in the picker so the operator can
   compare them live; none replaces the default. This is the operator's
   call, per the repo's rule that a metric does not replace a preset a
   human chose.
5. **Timing needs no change.** One camera turn is 126 s and the default
   0.06 laps/s completes 7.5 laps per turn; the seam passes any point at
   0.06 Hz. The "not too rapid" concern is spatial and is handled by
   `cycleBands`.

## Method

Two stages, both reproducible from a clean checkout.

**Offline** (`node scripts/sweep-cycle-palette.mjs`): 576 five-stop OKLCH
"seam ramps" (12 hues × 7 hue arcs × 4 chroma peaks × cream or saturated
ceiling), each rendered to the renderer's 256-texel palette texture at 2
gammas × 3 contrasts, plus the 11 shipped ramp presets at the same settings
and the shipped amber default. 4099 textures scored on seam strength across
the wrap, just-noticeable steps per lap, chroma-weighted hue travel, plateau
share, mean chroma and neon share, each mapped to a Gaussian preference
centred on the brief's target range and multiplied. The ranges are stated in
the script; card 96 tests whether the ranking survives perturbing them.

**Browser** (`PALETTE_SWEEP=1 npx playwright test palette-sweep`): six
candidates × three band spacings rendered through the GPU orbit3d path at
1280×720, camera parked, cascade reveal and beam off, phase pinned at 0, and
scored over lit pixels of the canvas screenshot (`e2e/harness/frame.ts`).
Colour travel captured three frames a third of a lap apart at the default
speed. Artefacts under `e2e/artifacts/logistic-mandelbrot-palette/`
(git-ignored): `report.md`, `contact-sheet.png`, `references.png`,
`browser-report.md`, `contact-sheet-browser.png`, `frames/`.

## Offline ranking

Shipped default (amber, gamma 1.65, contrast 2.4): score 0.472.

Top ten distinct family ramps, best gamma and contrast for each:

| # | id | h0 | arc | chroma | ceiling | gamma | contrast | score | seam | bands | hueSpan | plateau | chroma | neon |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | h330_a100_c0.15_cream_g1.65_k1.4 | 330 | 100 | 0.15 | cream | 1.65 | 1.4 | **0.987** | 85.0 | 9.3 | 99 | 0.28 | 0.089 | 0.00 |
| 2 | h0_a100_c0.15_cream_g1.65_k1.4 | 0 | 100 | 0.15 | cream | 1.65 | 1.4 | **0.984** | 85.1 | 9.4 | 96 | 0.28 | 0.090 | 0.00 |
| 3 | h0_a-150_c0.15_cream_g1.65_k1.4 | 0 | -150 | 0.15 | cream | 1.65 | 1.4 | **0.984** | 85.0 | 9.6 | 112 | 0.28 | 0.088 | 0.00 |
| 4 | h30_a-150_c0.15_cream_g1.65_k1.4 | 30 | -150 | 0.15 | cream | 1.65 | 1.4 | **0.980** | 84.8 | 9.6 | 109 | 0.28 | 0.086 | 0.00 |
| 5 | h270_a150_c0.15_cream_g1.65_k1.4 | 270 | 150 | 0.15 | cream | 1.65 | 1.4 | **0.976** | 84.8 | 9.6 | 115 | 0.28 | 0.086 | 0.00 |
| 6 | h210_a-150_c0.15_saturated_g1.2_k1.4 | 210 | -150 | 0.15 | saturated | 1.2 | 1.4 | **0.975** | 75.7 | 8.4 | 104 | 0.28 | 0.090 | 0.00 |
| 7 | h300_a150_c0.15_cream_g1.65_k1.4 | 300 | 150 | 0.15 | cream | 1.65 | 1.4 | **0.975** | 85.5 | 9.5 | 118 | 0.28 | 0.088 | 0.00 |
| 8 | h330_a-150_c0.15_cream_g1.65_k1.4 | 330 | -150 | 0.15 | cream | 1.65 | 1.4 | **0.975** | 85.1 | 9.6 | 119 | 0.28 | 0.091 | 0.00 |
| 9 | h120_a-150_c0.15_saturated_g1.2_k1.4 | 120 | -150 | 0.15 | saturated | 1.2 | 1.4 | **0.973** | 75.5 | 8.4 | 102 | 0.28 | 0.090 | 0.00 |
| 10 | h180_a150_c0.15_saturated_g1.2_k1.4 | 180 | 150 | 0.15 | saturated | 1.2 | 1.4 | **0.970** | 75.3 | 8.4 | 101 | 0.29 | 0.090 | 0.00 |

Shipped presets, top eight:

| # | id | preset | gamma | contrast | score | seam | bands | hueSpan | plateau | chroma | neon |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | amber_g1.2_k1.4 | amber | 1.2 | 1.4 | **0.951** | 81.4 | 8.8 | 85 | 0.29 | 0.094 | 0.00 |
| 2 | amber_g1.65_k1.4 | amber | 1.65 | 1.4 | **0.867** | 81.4 | 8.8 | 77 | 0.29 | 0.101 | 0.00 |
| 3 | ice_g1.2_k1.4 | ice | 1.2 | 1.4 | **0.829** | 86.5 | 9.5 | 81 | 0.28 | 0.076 | 0.00 |
| 4 | ice_g1.65_k1.4 | ice | 1.65 | 1.4 | **0.793** | 86.5 | 9.6 | 76 | 0.28 | 0.074 | 0.00 |
| 5 | amber_g1.65_k1.8 | amber | 1.65 | 1.8 | **0.760** | 81.4 | 8.7 | 71 | 0.44 | 0.092 | 0.00 |
| 6 | amber_g1.2_k1.8 | amber | 1.2 | 1.8 | **0.759** | 81.4 | 8.8 | 73 | 0.44 | 0.085 | 0.00 |
| 7 | magma_g1.2_k1.8 | magma | 1.2 | 1.8 | **0.549** | 93.7 | 11.0 | 165 | 0.43 | 0.101 | 0.00 |
| 8 | magma_g1.65_k1.8 | magma | 1.65 | 1.8 | **0.520** | 93.7 | 11.0 | 164 | 0.43 | 0.104 | 0.00 |

Rosewood is family rank 1 (h330, arc +100, chroma 0.15, cream ceiling).
Dusk is rank 3 (h0, arc −150, cream). Verdigris is rank 6 (h210, arc −150,
saturated ceiling), chosen as the one cool-to-warm ramp in the top ten.

## Browser frames

## Static frames

| palette | gamma | contrast | bands/unit | lit | edges | hueSpread | chroma | whiteClip | neon | frame |
|---|---|---|---|---|---|---|---|---|---|---|
| amber (shipped) | 1.65 | 2.4 | 1.5 | 0.167 | 0.182 | 0.346 | 0.012 | 0.077 | 0.000 | `frames/amber-shipped-b1.5.png` |
| amber (shipped) | 1.65 | 2.4 | 3 | 0.167 | 0.188 | 0.548 | 0.013 | 0.078 | 0.000 | `frames/amber-shipped-b3.png` |
| amber (shipped) | 1.65 | 2.4 | 5 | 0.167 | 0.193 | 0.417 | 0.013 | 0.076 | 0.000 | `frames/amber-shipped-b5.png` |
| amber k1.4 | 1.2 | 1.4 | 1.5 | 0.167 | 0.179 | 0.378 | 0.013 | 0.073 | 0.000 | `frames/amber-k1-4-b1.5.png` |
| amber k1.4 | 1.2 | 1.4 | 3 | 0.167 | 0.185 | 0.637 | 0.015 | 0.068 | 0.000 | `frames/amber-k1-4-b3.png` |
| amber k1.4 | 1.2 | 1.4 | 5 | 0.167 | 0.190 | 0.670 | 0.015 | 0.067 | 0.000 | `frames/amber-k1-4-b5.png` |
| magma k1.8 | 1.2 | 1.8 | 1.5 | 0.108 | 0.271 | 0.159 | 0.020 | 0.113 | 0.000 | `frames/magma-k1-8-b1.5.png` |
| magma k1.8 | 1.2 | 1.8 | 3 | 0.106 | 0.287 | 0.210 | 0.023 | 0.107 | 0.000 | `frames/magma-k1-8-b3.png` |
| magma k1.8 | 1.2 | 1.8 | 5 | 0.105 | 0.296 | 0.219 | 0.023 | 0.105 | 0.000 | `frames/magma-k1-8-b5.png` |
| rosewood | 1.65 | 1.4 | 1.5 | 0.167 | 0.180 | 0.313 | 0.017 | 0.074 | 0.000 | `frames/rosewood-b1.5.png` |
| rosewood | 1.65 | 1.4 | 3 | 0.167 | 0.185 | 0.342 | 0.017 | 0.070 | 0.000 | `frames/rosewood-b3.png` |
| rosewood | 1.65 | 1.4 | 5 | 0.167 | 0.190 | 0.276 | 0.017 | 0.069 | 0.000 | `frames/rosewood-b5.png` |
| dusk | 1.65 | 1.4 | 1.5 | 0.167 | 0.179 | 0.138 | 0.018 | 0.075 | 0.000 | `frames/dusk-b1.5.png` |
| dusk | 1.65 | 1.4 | 3 | 0.167 | 0.185 | 0.100 | 0.018 | 0.071 | 0.000 | `frames/dusk-b3.png` |
| dusk | 1.65 | 1.4 | 5 | 0.167 | 0.189 | 0.080 | 0.018 | 0.071 | 0.000 | `frames/dusk-b5.png` |
| verdigris | 1.2 | 1.4 | 1.5 | 0.167 | 0.176 | 0.305 | 0.016 | 0.064 | 0.000 | `frames/verdigris-b1.5.png` |
| verdigris | 1.2 | 1.4 | 3 | 0.167 | 0.183 | 0.440 | 0.018 | 0.058 | 0.000 | `frames/verdigris-b3.png` |
| verdigris | 1.2 | 1.4 | 5 | 0.167 | 0.188 | 0.498 | 0.018 | 0.057 | 0.000 | `frames/verdigris-b5.png` |

## Colour travel (3 bands/unit, cycle speed 0.06, frames 5.5 s apart)

Mean OKLab×100 change per pixel between frames a third of a lap apart. Higher means the cycle is visibly moving colour, not just brightness.

| palette | bands/unit | motion |
|---|---|---|
| amber (shipped) | 3 | 8.51 |
| amber k1.4 | 3 | 8.66 |
| magma k1.8 | 3 | 11.35 |
| rosewood | 3 | 8.26 |
| dusk | 3 | 7.83 |
| verdigris | 3 | 8.26 |

Contact sheet: `contact-sheet-browser.png`, rows are palettes in the order above, columns are 1.5 / 3 / 5 bands per unit.

Reading: `lit` is constant at 0.167 for every cream-ceiling ramp because the
lit region is the cloud plus the ground plane's exterior, and only magma's
black floor at gamma 1.2 drops the exterior below the lit threshold. `edges`
rises with `cycleBands` for every palette, which is the band-spacing effect
on the ground plane. `hueSpread` is noisy at these chroma levels and should
not be read as a ranking. `whiteClip` of 6 to 11% understates the bleaching:
most sheet pixels are pale rather than pure white, which is what the chroma
column shows.

## What was not searched

- Ramps with more than one luminance seam per lap (two-tone bands).
- The height term's share of the band formula, fixed at one third of the
  depth term as before.
- The interior scalar itself (distance versus attracting-cycle multiplier),
  which the review document argues for and which needs a ground-plane
  texture that does not exist yet.
- Any change to the tone map; see card 97.

## Promotions

None. Three presets added to the picker; default palette, gamma, contrast
and `cycleBands` unchanged. The operator picks from the frames.
