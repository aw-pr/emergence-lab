---
title: Burning Ship
family: Escape-Time Fractals
slug: burning-ship
subtitle: Absolute-value iteration forges a jagged flaming hull.
---

# Burning Ship

## What it is

Escaping iteration with mirrored absolute axes — ridge-like corridors and
flaming hull wakes along jagged quadratic coastlines. It's a close cousin of
the Mandelbrot set, built from almost the same formula, but a single small
change gives the whole fractal a completely different, sharper character.

## The rule

For a point c, repeatedly apply z → (|Re(z)| + i|Im(z)|)² + c, starting from
z = 0 — the same escape-time test as the Mandelbrot set, except the real and
imaginary parts of z are folded to their absolute values before squaring on
every iteration. That single fold breaks the smooth symmetry of the
Mandelbrot set and replaces it with sharp mirrored creases, producing the
angular, ship-like silhouette the fractal is named for.

## Why it's interesting

Discovered in 1992 by Michael Michelitsch and Otto Rössler while exploring
variations on the Mandelbrot formula, the Burning Ship is a good
demonstration of how fragile the "smoothness" of the classic Mandelbrot set
actually is — folding two absolute values into an otherwise identical
iteration is enough to turn gentle cardioid curves into a fractal covered in
sharp ridgelines and antenna-like spikes. It's a favourite among fractal
explorers specifically because zooming into different parts of its coastline
reveals wildly different textures, from spiky "masts" to smoother lagoon-like
basins, more visually varied than the Mandelbrot set's more uniform
self-similarity.

## Parameters to try

- Zoom toward the main "ship" silhouette near the negative real axis to see
  the antenna-like structures sharpen.
- Compare the upper and lower half-planes — the mirroring from the absolute
  value makes them visually distinct, unlike the Mandelbrot set's own
  symmetry.
- Raise max iterations at high zoom to resolve fine ridge detail that
  otherwise looks like flat colour banding.

## Further reading

- Michelitsch, M. and Rössler, O. E., "A New Feature in Julia Sets" (Computers
  & Graphics, 1992) — the original discovery.
- Wikipedia: "Burning Ship fractal" for a visual survey of named regions.
- Peitgen, H.-O. and Richter, P. H., "The Beauty of Fractals" (1986), for the
  general escape-time fractal background this variant builds on.
