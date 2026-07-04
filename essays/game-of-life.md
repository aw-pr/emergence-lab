---
title: Game of Life
family: Cellular Automata
slug: game-of-life
subtitle: Birth and survival rules on a grid breed gliders and still lifes.
---

# Game of Life

## What it is

Conway's cellular automaton: simple local rules produce gliders, oscillators,
and complex dynamics. Every cell on a grid is alive or dead; the next
generation is decided purely by how many live neighbours each cell currently
has.

## The rule

A dead cell with exactly three live neighbours is born. A live cell survives
if it has two or three live neighbours; otherwise it dies, from either
loneliness or overcrowding. That's the entire rule — applied to every cell,
simultaneously, forever.

## Why it's interesting

John Conway devised Life in 1970 as the simplest rule set he could find that
was still Turing complete — powerful enough, in principle, to compute
anything a computer can. Gliders, guns, and oscillators are not designed;
they are discovered, emerging from a rule with no notion of "shape" at all.
Life is probably the most famous demonstration in existence that trivial
local rules can generate unbounded complexity, and it kicked off decades of
hobbyist and academic interest in cellular automata as a model of
computation and of life itself.

## Parameters to try

- Seed from a glider or glider-gun pattern and watch it interact with random
  noise.
- Compare a sparse random seed against a dense one — density strongly affects
  whether the field dies out, stabilises, or churns indefinitely.
- Slow playback down to trace a single oscillator's period.

## Further reading

- Gardner, M., "Mathematical Games: The Fantastic Combinations of John
  Conway's New Solitaire Game 'Life'" (Scientific American, 1970).
- Berlekamp, Conway, Guy, "Winning Ways for Your Mathematical Plays" (Life
  as a Turing-complete system).
- LifeWiki (conwaylife.com) — the community catalogue of known patterns.
