---
title: Logistic Mandelbrot
family: Escape-Time Fractals
slug: logistic-mandelbrot
subtitle: Orbit attractors stacked over the c-plane reveal the bifurcation diagram.
---

# Logistic Mandelbrot

## What it is

Two of the most famous pictures in chaos theory — the logistic map's
bifurcation diagram and the Mandelbrot set — are the same object seen from
different angles, and this simulation draws them together. For every point c
of the complex plane, the orbit of z → z² + c is run past its transient and
its settled values are stacked as height above c. The Mandelbrot set lies
beneath as a dim ground plane; the cloud of attractor values hovers over it,
and the sheet hanging above the real axis is exactly the bifurcation diagram
from the textbooks.

## The rule

For each c, iterate z → z² + c from z = 0. If the orbit ever leaves |z| ≤ 2
it escapes and plots nothing, which is why the cloud's footprint is precisely
the Mandelbrot set. Otherwise, discard a warmup of iterations and plot the
next K values of Re(z) as height.

The connection to the logistic map x → rx(1 − x) is a change of variable:
substituting z = r/2 − rx turns the logistic map into z → z² + c with
c = (r/2)·(1 − r/2). As r runs from 1 to 4, c runs from 1/4 down to −2 along
the real axis, so every vertical slice of the curtain over the real axis is a
column of the classic bifurcation diagram, drawn in the coordinates of the
Mandelbrot set.

## Why it's interesting

The bifurcation diagram is usually met as a one-parameter story: Robert May's
1976 Nature review made the logistic map the emblem of complicated behaviour
from a trivial rule, and Mitchell Feigenbaum showed its period-doubling
cascade obeys universal constants. The Mandelbrot set is usually met as a
two-parameter picture of which orbits stay bounded. Standing the diagram on
the set shows they narrate the same iteration. The main cardioid carries one
sheet (a period-1 fixed point); crossing into the period-2 disc at
c = −3/4 (r = 3) splits it in two; the doublings accumulate at c ≈ −1.401
(r ≈ 3.570), beyond which chaotic bands begin. The period-3 window opens at
exactly c = −7/4 (r = 1 + √8 ≈ 3.828), and its three clean sheets sit
directly over the small period-3 copy of the whole set on the real axis: the
windows of the bifurcation diagram are the minibrots of the needle. Off the
real axis the picture answers a question the 1D diagram cannot ask: every
hyperbolic bulb holds an attracting period-q cycle, so each bulb carries its
own stack of q sheets — period-doubling continues outward through the bulbs
in every direction, not just along the real line.

## Parameters to try

- Load the "Bifurcation curtain" preset: real-slice sampling only, viewed
  side-on, which is the textbook bifurcation diagram rendered as a curtain.
- Load "Cascade" and watch plotted iterations climb: with one sample each
  bulb is a single sheet, and each added sample splits the sheets in two
  until the chaotic bands fill in.
- Drag the marker (or let the real-axis sweep run) and watch the period
  readout: 1 over the cardioid, 2 then 4 past c = −3/4, and 3 inside the
  window near c = −1.75.
- Orbit the camera around the full object to see off-axis bulbs hold their
  cycles as separate sheets exactly above their bulbs on the ground plane.
- Switch the colour mode: period tints each bulb by the length of its cycle,
  height grades the sheets by Re(z), mono keeps the plain additive glow, and
  cycle continues the plane's palette bands into the cloud and moves both
  together.

## Further reading

- May, R. M., "Simple mathematical models with very complicated dynamics"
  (Nature, 1976).
- Feigenbaum, M. J., "Quantitative universality for a class of nonlinear
  transformations" (Journal of Statistical Physics, 1978).
- Peitgen, H.-O., Jürgens, H. and Saupe, D., "Chaos and Fractals" (1992),
  which draws the bifurcation-diagram-to-Mandelbrot correspondence
  explicitly.
- Devaney, R., "An Introduction to Chaotic Dynamical Systems" (1989), for
  the conjugacy between the logistic and quadratic families.
