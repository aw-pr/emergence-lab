---
title: Abelian Sandpile
family: Self-Organised Criticality
slug: abelian-sandpile
subtitle: Toppling grains relax a critical pile into fractal terraces.
---

# Abelian Sandpile

## What it is

Grain-by-grain buildup and avalanches on a lattice. Stable patterns emerge
near the edge of criticality. Each cell holds a stack of grains; add one at a
time and watch cells that get too tall topple into their neighbours,
sometimes setting off a cascade.

## The rule

Every cell has a grain count. Add a grain to a chosen cell. If a cell reaches
four or more grains, it topples: it loses four grains and each of its four
neighbours gains one. Toppling can trigger further toppling in neighbouring
cells, producing an avalanche that only stops once every cell is below the
threshold again. The model is "abelian" because the final stable state
doesn't depend on the order grains are added or toppled in.

## Why it's interesting

The sandpile is the founding example of self-organised criticality — a system
that drives itself to a critical state without any external tuning, then
sheds that stress in avalanches whose sizes follow a power law (many small
slides, a few huge ones, no typical size). Bak, Tang and Wiesenfeld introduced
it in 1987 as a toy model for why so many natural systems — earthquakes,
forest fires, neuronal avalanches — show scale-free bursts of activity. The
stable end-state is also a genuine fractal, with visible self-similar
terracing.

## Parameters to try

- Watch a single-point seed relax into the fractal "sandpile identity"
  pattern.
- Compare a single central seed against many scattered seed points and see
  how the avalanche statistics differ.
- Slow the step rate down to watch individual avalanches propagate outward
  from a topple.

## Further reading

- Bak, P., Tang, C., Wiesenfeld, K., "Self-Organized Criticality: An
  Explanation of 1/f Noise" (1987).
- Dhar, D., "Self-Organized Critical State of Sandpile Automaton Models"
  (1990) — the abelian property.
- Wikipedia: "Abelian sandpile model" for the identity element and group
  structure.
