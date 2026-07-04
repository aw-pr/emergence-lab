---
title: Gray-Scott
family: Reaction–Diffusion
slug: gray-scott
subtitle: Two chemicals diffuse and react into Turing spots and stripes.
---

# Gray-Scott

## What it is

Two-species reaction-diffusion. Watch spots and stripes self-organise from a
seed patch. Two chemicals, U and V, spread across a grid and react with each
other; the balance between diffusion and reaction is what turns a random seed
into a stable, repeating pattern.

## The rule

Each cell holds a concentration of U and a concentration of V. Both diffuse
into their neighbours every step. V consumes U in a feed reaction, and V
itself decays away at a fixed rate. Two constants, feed (F) and kill (k),
control the whole show — small changes to either tip the field between dead
zero-state, spots, stripes, or slow-moving worms.

## Why it's interesting

This is the textbook example of a Turing pattern: Alan Turing showed in 1952
that a system of two diffusing, reacting chemicals could explain how a
uniform blob of cells develops stripes, spots, or other regular structure
without any central blueprint. Zebra stripes, leopard spots, and the spacing
of hair follicles are all suspected to follow some variant of this mechanism.
It is one of the cleanest demonstrations that complex, repeating spatial
structure can emerge from two numbers and a diffusion equation.

## Parameters to try

- Nudge feed and kill together along the well-known Pearson parameter map to
  walk through spots → stripes → maze → worms.
- Increase feed on its own to speed up how fast new material enters the
  system — patterns grow and merge faster.
- Lower the diffusion rate of V relative to U to sharpen pattern edges.

## Further reading

- Alan Turing, "The Chemical Basis of Morphogenesis" (1952).
- Pearson, J. E., "Complex Patterns in a Simple System" (1993) — the classic
  Gray-Scott parameter atlas.
- Karl Sims and others' visual explorers of the Gray-Scott parameter space.
