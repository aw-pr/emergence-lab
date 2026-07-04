---
title: Diffusion-Limited Aggregation
family: Aggregation & Growth
slug: diffusion-limited-aggregation
subtitle: Random walkers freeze on contact into branching dendrites.
---

# Diffusion-Limited Aggregation

## What it is

Random walkers stick to a seed; branching clusters grow outward without
global planning. A single seed point sits in the middle of the field, and a
constant stream of particles wanders in from the edges, freezing the instant
one of them bumps into the growing structure.

## The rule

Release a particle at a random point and let it take a random walk, one
step at a time in a random direction. If it becomes adjacent to the existing
cluster, it sticks permanently and becomes part of it. If not, it keeps
wandering (or is discarded if it walks too far or for too long). Repeat with
a fresh particle. The cluster only ever grows; nothing already stuck ever
moves again.

## Why it's interesting

DLA, formalised by Witten and Sander in 1981, is the standard toy model for
why branching, treelike structures show up constantly in nature without any
plan behind them: mineral dendrites, lightning bolts, coral growth,
electrodeposition patterns, and some models of bacterial colonies all echo
its look. The mechanism is a race condition made visible — a random walker is
far more likely to hit a branch tip sticking out toward it than to find its
way into a deep concave gap — so growth is self-reinforcing at the tips and
starved in the crevices, and the whole cluster becomes fractal purely as a
side effect of that asymmetry.

## Parameters to try

- Increase walkers-per-step to grow the cluster faster (same fractal
  structure, sped up).
- Lower stickiness so walkers sometimes bounce off contact rather than
  sticking immediately, producing a denser, less spindly cluster.
- Cap max walk steps low to see how many walkers give up before reaching the
  cluster at all, versus raising it to let distant walkers eventually arrive.

## Further reading

- Witten, T. A. and Sander, L. M., "Diffusion-Limited Aggregation, a Kinetic
  Critical Phenomenon" (Physical Review Letters, 1981).
- Meakin, P., "Fractals, Scaling and Growth Far from Equilibrium" (1998).
- Wikipedia: "Diffusion-limited aggregation" for a survey of real-world
  analogues.
