---
title: Mandelbrot
family: Escape-Time Fractals
slug: mandelbrot
subtitle: Iterating z² + c maps which points stay bounded forever.
---

# Mandelbrot

## What it is

Quadratic cardioid shoreline — deep zoom stacks escape-time into saturated
rings, the zoom-and-palette rhythm of dedicated fractal explorers. Every
point on the complex plane is tested by the same tiny formula, and the
result of that test decides whether the point is coloured in or out.

## The rule

For a point c on the complex plane, repeatedly apply z → z² + c, starting
from z = 0. If the sequence stays bounded forever, c belongs to the set (the
solid cardioid-and-bulbs shape); if |z| ever exceeds 2, it's guaranteed to
escape to infinity, and the number of iterations it took to escape becomes
the colour of that point. The boundary between "stays in" and "escapes" is
where all the visual detail lives.

## Why it's interesting

Benoit Mandelbrot popularised this set in 1980 while investigating Gaston
Julia's earlier work on iterated complex functions, and it became the most
recognisable fractal image in existence. Zooming into its boundary reveals
endlessly repeating, never-quite-identical copies of the whole shape — an
infinitely detailed coastline from an equation four symbols long. It sits at
the intersection of complex dynamics, computer graphics, and popular
mathematics, and did more than perhaps any other single image to bring the
word "fractal" into everyday use.

## Parameters to try

- Zoom into a "seahorse valley" or minibrot near the main cardioid's boundary
  to see a near-exact copy of the whole set nested inside itself.
- Raise max iterations to sharpen fine boundary detail at high zoom, at the
  cost of speed.
- Cycle the palette to make the escape-time bands read as flowing rings
  rather than static contours.

## Further reading

- Mandelbrot, B., "The Fractal Geometry of Nature" (1982).
- Douady, A. and Hubbard, J., work on the set's connectedness and the
  "Douady rabbit" family of Julia sets.
- Peitgen, H.-O. and Richter, P. H., "The Beauty of Fractals" (1986).
