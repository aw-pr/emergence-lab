# Logistic-Mandelbrot colour field review — 2026-09-19

Question from the operator: with Cycle now the default colour mode, do the 3D
cloud's colours flow out from the set's edge the way the 2D complex-plane
Mandelbrot's escape bands do, and why does a bulb change colour in 3D when it
never does in the plane?

Short answer: **outside the set the 3D view is the 2D view**, same shader,
same phase, and the bands leave the boundary in the same direction. **Inside
the set the 3D view paints a scalar the 2D view does not have**, and its band
wavelength is wider than any bulb, so a bulb reads as one colour that drifts
rather than as bands that flow. The cloud on top of it clips to white for a
separate reason that a palette choice can fix.

Baseline frames from this review are under
`e2e/artifacts/logistic-mandelbrot-palette/baseline/` (git-ignored; captured
by the palette sweep harness described in
`docs/sweeps/logistic-mandelbrot-palette-cycling.md`).

## How the colour reaches each surface

| Surface | Scalar sampled | Where | Cycles? |
|---|---|---|---|
| 2D plane, outside the set | smooth escape count / max iterations, `fract(value + phase)` | `webglRenderer.ts` fractal shader | yes |
| 2D plane, inside the set | constant 0 (palette floor) | same shader, main-body short-circuit | **no** |
| 3D ground plane, outside | identical fractal shader rendered to a texture, phase = the cycle phase, dimmed ×0.04 | `ensureOrbit3dGround` | yes |
| 3D ground plane, inside | chamfer distance inward from the escape boundary, `band = -1.5·d`, from a distance texture built once | `GROUND_FRAGMENT_SHADER` | yes |
| 3D cloud points | `band = -1.5·d - 0.5·z`, same distance `d` per c-cell, plus attractor height | `POINT_VERTEX_SHADER`, `u_colourMode == 3` | yes |
| 3D hybrid sheets | same formula as the points | surface program | yes |

The phase is one number for all of them (`palettePhase` in
`webglRenderer.ts`, `cycleSpeed × elapsed`), and at the boundary both the
exterior (`value → 1`) and the interior (`d = 0`) land on `fract(phase)`, so
the two regimes are phase-continuous at the edge. As the phase advances a
band of constant colour moves to lower escape count outside, which is away
from the set, and to larger `d` inside, which is deeper into the set. Colour
therefore emanates from the boundary in both directions. That is the
intended reading and it holds.

## Why a bulb changes colour in 3D and not in the plane

1. **The plane has no interior scalar.** Escape time is infinite inside the
   set, so the fractal shader returns 0 and the interior is the palette floor
   for ever. The 3D view had to invent something to cycle, and chose Euclidean
   distance to the boundary clamped at one c-unit.
2. **The band wavelength is wider than every bulb.** With `CYCLE_DEPTH_SCALE
   = 1.5` a full palette lap spans 0.67 c-units of depth. The cardioid's
   deepest interior point is roughly 0.4 from its boundary and the period-2
   disc's is 0.25, so no bulb contains one complete band. Each bulb is a
   partial radial gradient, and as the phase advances the whole gradient
   slides through the palette: the eye reads "the bulb changed colour", not
   "a band crossed the bulb". The baseline frames show the cardioid interior
   swapping between grey and black as a block half a lap apart.
3. **Exterior and interior bands have different spatial laws.** Outside, the
   smooth escape count grows like the log of the distance to the set, so the
   bands get infinitely fine at the boundary and the visible fringe is thin.
   Inside, the distance is linear, so the bands are coarse and evenly spaced.
   The phases match at the edge but the frequencies do not, which is why the
   plane shows a filigree fringe outside and a wash inside.
4. **Height adds a phase drift the plane cannot have.** The `-0.5·z` term
   sends colour up through the orbit sheets. Sheets at different heights over
   the same bulb differ in colour, and a period-doubled pair straddles a band
   edge.
5. **Bulb points are deliberately desaturated.** Points with a detected
   period are blended 30% toward a fixed grey (`mix(steady, cycling, 0.7)`)
   while the chaotic band keeps the full colour and a self-glow. The ground
   plane under the same bulb gets the full band colour, so cloud and ground
   disagree over every bulb.
6. **The palette's top end is cream, and the cloud is additive.** At the
   default gamma 1.65 / contrast 2.4, 43% of each lap is clipped to the
   amber ceiling `[255,246,184]` and 13% to the floor, leaving a 44% ramp.
   Stacked sheets then saturate to white whatever the phase, so in the cloud
   the cycle is mostly a brightness pulse with an amber fringe. The contrast
   slider is already at its UI maximum, so the sharp seam the operator
   likes is the wrap from cream back to black and there is no headroom to
   sharpen further by that route.

7. **The tone map bleaches hue, whatever the palette.** Measured after this
   review was drafted (see the sweep record): mean OKLab chroma over lit
   pixels is 0.012 to 0.023 for every candidate palette, against about 0.15
   for a saturated ramp texel. `TONEMAP_FRAGMENT_SHADER` applies
   `1 - exp(-hdr * exposure)` per channel, so a bright additive stack pushes
   all three channels to 1 and the hue collapses before the palette can
   show. This, not the ramp, is why the cycle reads as a brightness pulse
   on the cloud. Stage card 97 proposes a hue-preserving tone map.

## Can the interior be made faithful?

Not to escape time, because there is none. The principled interior analogue
is the attracting cycle's multiplier magnitude `|λ|`, which runs from 0 at
each bulb's superattracting centre to 1 at its boundary. It is already
computed per cell (`a_interior`, used by the Inside-out mode) and it mirrors
the exterior in the two ways that matter:

- `-log(1 - |λ|)` diverges at the boundary the way escape count does, so
  bands become log-dense at the edge on both sides and the fringe reads
  continuously across it;
- every bulb spans the whole range, so every bulb carries a complete band set
  instead of a fraction of one global ring system.

Cost: the ground plane's interior has only the distance texture today, so a
multiplier texture would need to be rendered from the GPU sampler's metadata
before the ground and the cloud could agree. That is a follow-up card, not
part of the palette sweep. Until then the distance field stays, and the
sweep exposes its wavelength as a parameter so at least one full band fits
inside the cardioid.

## Reasons a fully faithful interior would still cost interestingness

- The multiplier is constant along each bulb's internal rays, so the bands
  are concentric per bulb; the striking sheet-to-sheet colour travel that the
  height term gives today would have to be kept as a separate offset or lost.
- Period-doubling cascades converge to a point, and `-log(1 - |λ|)` is
  unbounded there, so bands compress to noise at every cascade tip unless
  clamped, which reintroduces a clamp of exactly the kind the current
  distance field has at one c-unit.
- Chaotic cells have no multiplier (`a_interior = 1`), so the chaotic band
  would be a single colour unless it kept the distance field, and the two
  fields would meet at the cascade boundary with a seam.

## Timing, for the sweep's brief

- Camera auto-rotate is 0.05 rad/s, so one full turn takes 126 s.
- The default cycle speed 0.06 laps/s completes a lap in 16.7 s, so the
  palette laps 7.5 times per camera turn. "Bands complete in a full turn" is
  already met with margin; the seam passes any point at 0.06 Hz, far below
  any photosensitivity threshold. The operator's "not too rapid" concern is
  therefore spatial, not temporal: it is about how many bands fit across the
  object, which is the depth scale, not the speed.
