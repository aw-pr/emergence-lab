---
title: Elementary Cellular Automata
family: Cellular Automata
slug: elementary-cellular-automata
subtitle: A one-dimensional Wolfram rule grows row by row into complexity.
---

# Elementary Cellular Automata

## What it is

One-dimensional rule space: pick a Wolfram rule and watch patterns evolve
from a single row. A single line of on/off cells is redrawn, row after row,
each new row stacked below the last, so the whole history of the automaton
is visible at once as a two-dimensional image.

## The rule

Every cell in the next row is decided purely by its own current state and
its two immediate neighbours — eight possible three-cell neighbourhoods in
total. A "rule number" from 0 to 255 is just an 8-bit lookup table assigning
on/off to each of those eight neighbourhoods. Change the rule number and you
change the automaton completely; the update procedure itself never changes.

## Why it's interesting

Stephen Wolfram catalogued and classified all 256 of these rules in the
1980s and found something startling: some of the very simplest possible
rules (rule 30, rule 110) generate output that looks statistically random,
or is provably capable of universal computation, despite the transition
table being trivial to write down by hand. Wolfram used this — most visibly
in "A New Kind of Science" (2002) — to argue that simple deterministic rules,
not complicated equations, are the more natural explanation for complexity
in nature. Rule 30 is also notable as the random number generator behind
Mathematica's default RNG for a period, precisely because of how convincingly
patternless its output looks.

## Parameters to try

- Switch between rule 30 (chaotic, "random-looking" texture), rule 90
  (a clean Sierpinski triangle), and rule 110 (proven Turing-complete,
  visibly structured but never repeating).
- Start from a single lit cell versus a random row and compare how much the
  initial condition matters for a given rule.
- Slow playback to watch one particular rule's local pattern replicate or
  die out row by row.

## Further reading

- Wolfram, S., "Statistical Mechanics of Cellular Automata" (Reviews of
  Modern Physics, 1983) — the original classification.
- Wolfram, S., "A New Kind of Science" (2002).
- Cook, M., "Universality in Elementary Cellular Automata" (2004) — the
  rule 110 universality proof.
