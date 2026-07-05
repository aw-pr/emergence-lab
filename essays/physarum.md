---
title: Physarum
family: Stigmergy
slug: physarum
subtitle: Trail-following agents weave a slime-mould transport network.
---

# Physarum

## What it is

A swarm of simple agents standing in for *Physarum polycephalum*, the acellular
slime mould. Each agent leaves a chemical trail as it moves and steers toward
the strongest trail it can smell ahead. Thousands of them, all reinforcing and
following the same shared field, self-organise into a branching transport
network — the same tangled, efficient veins the real organism grows across a
Petri dish.

## The rule

Every agent has a position and a heading. Each step it samples the trail field
at three sensors — one straight ahead, one angled left, one angled right — and
rotates toward whichever reads strongest, then steps forward and deposits a
little trail where it lands. After every agent has moved, the whole field is
blurred slightly (diffusion) and multiplied down by an evaporation factor. That
is the entire model: no agent sees another agent, and none of them plans. The
only shared memory is the trail itself.

## Why it's interesting

This is *stigmergy* — coordination through traces left in a shared environment
rather than through direct communication, the same mechanism ants use with
pheromones. The network is never designed; it falls out of a tight loop between
deposition (reinforcing used paths) and evaporation (pruning unused ones).
Physarum is famous for solving mazes and, in a much-cited experiment,
reproducing the layout of the Tokyo rail network when food sources were placed
at the cities. The model here shows how that global, near-optimal structure
emerges from a purely local sniff-turn-deposit rule.

## Parameters to try

- Widen the sensor angle and turn speed for a fine, delicate mesh; narrow them
  with a longer sensor distance for straighter, coral-like exploratory fans.
- Raise evaporation toward 1 to let faint trails persist — the network thickens
  and reconnects; lower it to keep only the busiest highways.
- Increase deposit amount to sharpen contrast between veins and empty space.

## Further reading

- Jeff Jones, "Characteristics of Pattern Formation and Evolution in
  Approximations of Physarum Transport Networks" (2010) — the agent model this
  simulation follows.
- Tero et al., "Rules for Biologically Inspired Adaptive Network Design"
  (Science, 2010) — the Tokyo rail network experiment.
- Nakagaki, Yamada & Tóth, "Maze-solving by an amoeboid organism" (2000).
