---
title: Julia Set
family: Escape-Time Fractals
slug: julia-set
subtitle: A fixed seed c splits the plane into prisoner and escapee sets.
---

# Julia Set

## What it is

Fix a complex seed c and carve the prisoner set — dendrites, spirals and
lacework tides shift as one constant rewires the whole picture. Where the
Mandelbrot set tests every possible c starting from z = 0, a Julia set fixes
c and instead tests every possible starting point z across the whole plane.

## The rule

For a fixed constant c, and for every point z0 on the complex plane,
repeatedly apply z → z² + c. Points whose sequence stays bounded forever are
"prisoners" and belong to the set; points that escape past |z| = 2 are
coloured by how quickly they escaped. The same c value produces one
completely fixed picture — the c itself is what you change to get a
different Julia set.

## Why it's interesting

Gaston Julia and Pierre Fatou studied these sets independently around 1918,
decades before computers existed to actually draw them, working purely from
theory. Every point in the Mandelbrot set corresponds to a connected Julia
set, and every point outside it corresponds to a Julia set that shatters into
infinitely many disconnected fragments — meaning the Mandelbrot set can be
read as a map, or index, of every possible Julia set's overall shape. Small
moves in c produce dramatic shifts in the resulting picture: some regions
give smooth dendritic sprays, others give lace-like swirls, others give dust.

## Parameters to try

- Pick c values just inside versus just outside the Mandelbrot set's boundary
  and compare a connected, spiralling Julia set against a shattered, dust-like
  one.
- Nudge c's real and imaginary components independently to feel how sensitive
  the resulting shape is to small changes.
- Cycle the palette to bring out fine escape-time banding in the fragmented
  regions.

## Further reading

- Julia, G., "Mémoire sur l'itération des fonctions rationnelles" (1918).
- Fatou, P., contemporaneous independent work on iterated rational maps.
- Peitgen, H.-O. and Richter, P. H., "The Beauty of Fractals" (1986), for the
  Mandelbrot-as-index-of-Julia-sets relationship.
