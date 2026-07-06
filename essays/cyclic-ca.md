---
title: Cyclic Cellular Automaton
family: Cellular Automata
slug: cyclic-ca
subtitle: Rock-paper-scissors states chase each other into spiral waves.
---

# Cyclic Cellular Automaton

## What it is

A grid where every cell holds one of N states arranged in a cycle: state 0
loses to state 1, state 1 loses to state 2, and so on around to state N-1
losing back to state 0. Each step, a cell is "eaten" by its successor state
if enough of its neighbours already hold that state, and advances to it.
Starting from uniform random noise, this simple rock-paper-scissors contest
self-organises into travelling spiral waves.

## The rule

A cell in state s becomes state (s + 1) mod N if at least `threshold` of its
neighbours are already in state (s + 1) mod N; otherwise it stays put.
Neighbourhoods can be Moore (all eight surrounding cells) or von Neumann (the
four orthogonal cells only). The grid wraps toroidally, so waves that leave
one edge reappear on the opposite side.

## Why it's interesting

Cyclic cellular automata were introduced by David Griffeath as one of the
simplest local rules that reliably produces rotating spiral waves from
nothing but noise — no seed pattern required. Early on the field looks like
scattered droplets; as neighbouring droplets fight for territory, small
rotating centres ("demons") appear at the boundaries where all N states meet,
and these centres pump out expanding spiral arms that eventually tile the
whole grid. It is a favourite toy model for excitable media and is often
compared to real spiral-wave phenomena such as cardiac arrhythmias and
Belousov-Zhabotinsky chemical waves, despite having a far simpler rule.

## Parameters to try

- Raise the neighbour threshold to slow consumption and favour turbulent,
  fine-grained mixing over clean spirals.
- Fewer states (N around 6-8) tend toward chaotic turbulence; more states
  (N around 12-16) give slower, larger, cleaner spiral demons.
- Switch from Moore to von Neumann neighbourhoods to see sharper, more
  angular wavefronts replace the rounder Moore-neighbourhood spirals.

## Further reading

- Fisch, R., Gravner, J., Griffeath, D., "Cyclic Cellular Automata in Two
  Dimensions" (1991).
- Fisch, R., "Cyclic cellular automata and related processes" (Physica D,
  1990).
- Wikipedia: "Cyclic cellular automaton" — overview and worked examples.
