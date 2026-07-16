# Standalone render-quality review — July 2026

## Outcome

The lab now treats display density and simulation density separately. The canvas backing store can use high device-pixel ratios for sharp standalone and fullscreen output, while a per-simulation profile keeps expensive CPU kernels within a useful compute budget.

The WebGL2 renderer performs manual bilinear sampling for continuous fields. The underlying state texture remains nearest-sampled by design; smoothing, palette mapping, trails, bloom, and final compositing happen in the GPU shader path. Escape-time fractals now bypass that state texture entirely and compute directly in a fragment shader.

## Profiles

- Fractals use a reduced 35% GPU preview during wheel or pinch gestures, then restore a 1.5× supersampled fragment render after 140 ms idle.
- Field and smooth simulations receive a denser compute grid where their CPU cost allows it.
- Ising, Kuramoto, cellular automata, attractors, and particle models default to Ultra.
- Gray-Scott, Belousov–Zhabotinsky, and Physarum default to High.
- Lenia remains at Performance because its convolution cost grows with cells multiplied by kernel taps; higher display density and smooth GPU presentation preserve its visual quality.

The display path is capped by GPU texture limits and explicit pixel budgets rather than iframe dimensions. Iframe-specific sizing remains deferred.

## Fractal detail

Mandelbrot and Julia support zoom up to `1e8`, automatic logarithmic iteration growth, and a 4,096 effective-iteration ceiling. Mandelbrot also skips points provably inside the main cardioid and period-2 bulb. Pointer-centred zoom maths is shared between wheel, pinch, buttons, and tests. WebGL2 computes while adjacent coordinates remain representable at the current display resolution; deeper views automatically use the CPU double-precision field.

## Attractor presentation

Strange attractors now deposit continuous subpixel Gaussian strokes rather than integer grid points. The WebGL path reconstructs those strokes as a layered streamer with a violet veil, magenta body, ember core, and bloom. Each attractor pre-rolls without drawing and then seeds a settled orbit, so routes open on the mathematical form rather than the transient path into it.

## Model review

Two additions broaden the conceptual range without duplicating an existing model:

- 2D Ising model: statistical physics, phase transitions, and critical domains.
- Kuramoto oscillators: local and global synchronisation, phase waves, and vortex pairs.

Wa-Tor predator-prey is the strongest next gallery candidate. Schelling segregation is technically straightforward but needs careful framing; learned neural cellular automata or Flow-Lenia belong in a separate stage because they introduce trained assets and provenance requirements.
