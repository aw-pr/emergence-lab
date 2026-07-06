---
title: Lenia
family: Cellular Automata
slug: lenia
subtitle: A continuous Game of Life where soft blobs condense and glide.
---

# Lenia

## What it is

A continuous generalisation of Conway's Game of Life. Instead of live-or-dead
cells, every cell holds a smooth mass value between 0 and 1; instead of
counting eight neighbours, each cell senses a soft ring of neighbourhood mass.
From a random scatter of blobs, the field condenses into round, self-organising
creatures that hold their shape, drift, and split.

## The rule

Each step convolves the field with a ring-shaped kernel — a Gaussian shell
peaking at half the kernel radius — to measure the neighbourhood mass around
every cell. A bell-shaped growth function then compares that measurement to a
preferred value: mass close to the growth centre μ is rewarded, anything too
sparse or too crowded decays. The result, scaled by a small time step, is added
to the cell and clamped to [0, 1]. That is the whole rule: sense a ring, grow
towards a sweet spot, repeat.

## Why it's interesting

Lenia shows that the gliders and oscillators of discrete cellular automata are
not artefacts of the grid — they survive the passage to continuous state and
smooth neighbourhoods, and get richer. Bert Chan's taxonomy catalogues hundreds
of distinct "species", from the canonical Orbium glider to rotating and
dividing colonies, all living inside a three-parameter rule. It sits at the
centre of current artificial-life research: a system simple enough to state in
two equations, yet organic enough that its creatures are named like biology.

## Parameters to try

- Nudge the growth centre μ up and the creatures fatten and merge; nudge it
  down and they thin out and starve.
- Widen σ to make the growth rule forgiving (stable, blobby colonies); narrow
  it to make survival knife-edged and dynamic.
- Raise the kernel radius for larger, smoother organisms — cost scales with
  the ring area, so expect a slower simulation.
- Increase the time step for livelier, riskier dynamics; decrease it for slow,
  stately growth.

## Further reading

- Bert Wang-Chak Chan, "Lenia — Biology of Artificial Life" (2019).
- Bert Wang-Chak Chan, "Lenia and Expanded Universe" (2020) — the species
  taxonomy and extended rule space.
- chakazul.github.io/lenia.html — the original interactive explorer.
