---
title: Particle Life
family: Swarm & Flocking
slug: particle-life
subtitle: A random attraction matrix breeds chasing, orbiting, cell-like life.
---

# Particle Life

## What it is

A handful of coloured particle species drift on a wrap-around plane, each one
nudged by every neighbour inside a short interaction radius. There is no goal,
no fitness, and no genome — only a small square table of numbers that says how
much each species is drawn to, or repelled by, each other species. From that
table alone the field settles into membranes, cells, wandering hunters, and
slow orbiting knots.

## The rule

Every particle sums the forces from its nearby neighbours. Two particles that
get too close always shove apart — a universal short-range repulsion that stops
everything collapsing to a point. Beyond that repulsion band and out to the
interaction radius, the force is a simple linear ramp scaled by the attraction
coefficient for that pair of species: positive pulls them together, negative
pushes them apart, and the pull peaks midway between the two radii. The force
nudges velocity, friction bleeds it off, and the particle drifts. Repeat for
every particle, every frame.

The trick is that the attraction table is **asymmetric**. Red can chase green
while green flees red. That single broken symmetry is what turns a static clump
into motion: pursuer and pursued lock into a loop neither can leave, and whole
colonies migrate because they are forever falling toward something that is
forever getting out of the way.

## Why it's interesting

Particle Life is a minimal answer to a big question: how little do you need to
specify before lifelike organisation appears on its own? The rules here know
nothing about cells, membranes, or predators — those are words we put on the
patterns afterwards. Yet a randomly generated matrix will, more often than not,
produce structures that look uncannily biological: encapsulating shells, dividing
blobs, and self-propelling creatures built from particles that individually do
nothing but add up a few forces. It is a vivid demonstration that complexity can
be cheap, and that "behaviour" can be an emergent property of interaction rather
than something any single part contains.

## Parameters to try

- Reseed a few times (reload) to draw fresh attraction matrices — most are
  inert soups, but some seeds hit on chasers or dividing cells. The variety is
  the point.
- Raise friction and watch motion damp into stable membranes and static cells;
  drop it and the same matrix erupts into restless chasing and orbiting.
- Widen the interaction radius to let distant species feel each other and merge
  local clumps into larger colonies; narrow it for grainy, short-lived texture.
- Push the matrix bias toward attraction to condense everything into dense
  bodies, or toward repulsion to blow the field apart into a diffuse gas.

## Further reading

- Ventrella, J., "Clusters" — an early interactive incarnation of the idea.
- Mohr, T., "Particle Life" — a widely-copied implementation and explainer of
  the asymmetric-force model.
- Schmickl, T. et al., "How a life-like system emerges from a simple particle
  motion law" (Scientific Reports, 2016) — the "Lenia"-adjacent research lineage
  on primordial-particle systems.
