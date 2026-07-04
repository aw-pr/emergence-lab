---
title: Belousov–Zhabotinsky
family: Reaction–Diffusion
slug: belousov-zhabotinsky
subtitle: An excitable chemical medium rolls out spirals and target waves.
---

# Belousov–Zhabotinsky

## What it is

Excitable reaction–diffusion medium; spiral waves and target patterns
propagate across the field. Three interacting chemical species chase each
other across the grid, each one triggering and then suppressing the next in
a repeating cycle.

## The rule

Three fields — A, B, and C — diffuse and react in a cyclic loop: A promotes
B, B promotes C, and C suppresses A, closing the loop. A cell that gets
"excited" briefly lights up before entering a refractory period, unable to
re-excite immediately. That refractory lag is what turns a single
disturbance into an outward travelling ring, and lets colliding rings twist
into rotating spirals rather than simply cancelling out.

## Why it's interesting

The real BZ reaction is one of the most famous demonstrations that chemistry
is not always monotonic and settling — under the right recipe of malonic
acid, bromate and a metal catalyst, a stirred beaker of clear liquid will
spontaneously oscillate between colours, and an unstirred dish will grow
spiral waves visible to the naked eye. Its discovery in the 1950s was initially
disbelieved because it seemed to violate intuitions about chemical
equilibrium. It became a foundational model for excitable media generally —
the same spiral-wave mathematics describes cardiac arrhythmias, where
re-entrant electrical spirals in heart tissue are a proximate cause of
fibrillation.

## Parameters to try

- Increase the refractory recovery rate to see how quickly spirals can
  re-form after a collision.
- Push the reaction rates to see the field flip from calm target rings into
  turbulent, competing spirals.
- Slow the simulation down to trace a single spiral's rotation by eye.

## Further reading

- Zhabotinsky, A. M., original 1960s Russian-language papers (English
  summaries widely available).
- Winfree, A. T., "The Geometry of Biological Time" — spiral waves and
  excitable media, including cardiac tissue.
- Epstein, I. R. and Pojman, J. A., "An Introduction to Nonlinear Chemical
  Dynamics."
