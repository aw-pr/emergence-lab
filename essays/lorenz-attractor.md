---
title: Lorenz Attractor
family: Chaotic Systems
slug: lorenz-attractor
subtitle: A three-variable flow traces the butterfly strange attractor.
---

# Lorenz Attractor

## What it is

The classic chaotic flow in three dimensions. Follow a trajectory tracing the
butterfly-shaped strange attractor. Three coupled variables evolve smoothly
over time under a fixed set of equations, yet the resulting path never
repeats and never settles down.

## The rule

Three numbers — x, y, z — change continuously according to three simple
coupled differential equations, governed by three constants (traditionally
called sigma, rho, and beta). Integrate them forward one small time-step at a
time. There's no randomness anywhere in the rule; every run is fully
deterministic given the same starting point.

## Why it's interesting

Edward Lorenz discovered this system in 1963 while simplifying equations for
atmospheric convection, and stumbled onto one of the most consequential
findings in modern science: that a purely deterministic system can still be
practically unpredictable, because arbitrarily small differences in starting
conditions grow explosively over time. That sensitivity is where "the
butterfly effect" comes from. The trajectory itself never crosses its own
path and never repeats, yet stays forever confined to the same two-lobed
butterfly-shaped region — a strange attractor, one of the first ever
identified, and the picture most people summon when they hear the word
"chaos."

## Parameters to try

- Nudge rho past roughly 24.74 to see the system tip from settling at a fixed
  point into full chaotic looping between the two lobes.
- Start two runs from almost — but not exactly — the same point and watch how
  fast they diverge.
- Slow the trace-detail control down to watch a single lobe crossing happen
  step by step.

## Further reading

- Lorenz, E. N., "Deterministic Nonperiodic Flow" (Journal of the Atmospheric
  Sciences, 1963).
- Gleick, J., "Chaos: Making a New Science" (1987) — the popular history,
  including the butterfly-effect naming.
- Sparrow, C., "The Lorenz Equations: Bifurcations, Chaos, and Strange
  Attractors" (1982), for the underlying mathematics.
