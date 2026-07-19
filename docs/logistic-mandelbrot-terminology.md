# Logistic-Mandelbrot: coordinate system and terminology

Quick reference for the 3D bifurcation view (`src/app/orbit3d.ts`,
`src/sims/logistic-mandelbrot/`).

## Coordinate system

The iteration is z → z² + c. The **ground plane is the complex parameter
plane** (every pixel is one value of c); **height is the orbit value**.

| Screen axis | Maths | Range | World mapping |
|---|---|---|---|
| Left–right | Re(c), real axis of the c-plane | −2 … 1 | `x = (Re(c) + 0.5) · 0.78` |
| Front–back (depth) | Im(c), imaginary axis of the c-plane | −1 … 1 | `z = Im(c) · 0.85` |
| Up | Re(z), real part of the attractor orbit | clipped to ±2 | `y = Re(z) · 0.56` |

Say it as: "the horizontal plane is the complex c-plane (real × imaginary),
and height is the attractor value Re(z)". There is no third spatial
"z coordinate" in the maths — the vertical axis is the iterate's value, not a
position.

The curtain hanging over the real axis (Im(c) = 0) is exactly the textbook
logistic bifurcation diagram: z = r/2 − rx maps the logistic map
x → rx(1 − x) onto z → z² + c with c = (r/2)(1 − r/2), so the vertical
value doubles as the logistic x.

## Terms

- **c / z** — c is the fixed parameter (a point on the ground plane); z is
  the iterated value starting from 0.
- **Orbit** — the sequence of iterates for one c. The **attractor** is what
  the orbit settles onto after transients: a fixed point, a period-q cycle,
  or a chaotic band.
- **Warmup (transient)** — iterations discarded before sampling so the orbit
  has settled. Longer warmup shrinks the blurry unresolved fringe at bulb
  boundaries. The sampler exits warmup early once the orbit provably lands
  on its cycle (Brent-style revisit check in `model.ts`).
- **Orbit samples (K)** — how many Re(z) values are recorded per cell after
  warmup; **plotted iterations** is how many of those are drawn (the cascade
  reveal animates this from 1 to K).
- **Escape** — the orbit leaves |z| ≤ 2; that c is outside the Mandelbrot
  set and contributes no points.
- **Period q** — length of the attracting cycle. Each hyperbolic **bulb** of
  the set carries one attracting period-q cycle, which appears as q sheets
  stacked over that bulb. The main **cardioid** is period 1; the disc to its
  left is period 2, and so on through the period-doubling cascade.
- **Multiplier / interior measure** — the magnitude of the cycle's
  derivative: 0 at a bulb's superattracting centre, 1 at its boundary. This
  is the "inside-out" coordinate used by the inside-out colour mode.
- **Boundary distance** — c-plane distance from a surviving cell to the
  escape boundary (a chamfer distance transform over the build's escape
  mask). Cycle mode keys its palette sweep on this so the moving bands
  continue the plane's escape-time bands across the set's edge.
- **Feigenbaum point** — c ≈ −1.401, where period-doubling accumulates; the
  chaotic band lies beyond it, out to the tip at c = −2.
- **Light beam / real-axis sweep** — the tracer marching along the real
  axis. In the cloud it lights the full orbit slice (every Im(c) at the
  active Re(c)); on the plane its footprint is the matching full-width line,
  plus the trailing wake.
- **Cascade reveal** — the intro animation that raises plotted iterations
  from 1 to K, replaying the period-doubling cascade.
- **Palette phase** — the offset into the cyclic palette; one unit of phase
  is one full lap. The plane and the point cloud share the same phase, which
  is what keeps their bands in step.
- **Point budget / reservoir sampling** — the cap on drawn points per
  quality tier; surviving cells are reservoir-sampled deterministically so
  the whole domain stays represented when the budget is exceeded.
- **Exposure / tonemap** — the HDR accumulation buffer is tonemapped
  (1 − e^(−hdr·exposure)); exposure is the user-facing brightness knob.

## See also

- `src/sims/logistic-mandelbrot/model.ts` — the pure sampler and its
  constants (domain bounds, escape radius, tolerances).
- `docs/INTERFACE.md` — the SimKernel contract.
