---
title: Boids
family: Swarm & Flocking
slug: boids
subtitle: Three steering urges turn scattered agents into a flock.
---

# Boids

## What it is

Simple local rules yield flocking — alignment, cohesion, and separation
sculpt coherent motion from noise. Each boid is an independent agent that
only ever looks at its nearby neighbours; there is no leader and no shared
plan.

## The rule

Every boid updates its velocity each step by blending three urges computed
from nearby flockmates only: steer toward the average heading of neighbours
(alignment), steer toward their average position (cohesion), and steer away
from anyone getting too close (separation). Sum the three, weight them, and
that's the new heading — repeated independently, in parallel, by every agent
in the flock.

## Why it's interesting

Craig Reynolds introduced Boids in 1986 to answer a specific question: how do
real flocks, herds and schools coordinate without a leader or a global plan?
His answer — three purely local steering rules — turned out to be enough to
reproduce convincing flocking, swirling, and obstacle-avoidance behaviour, and
it became one of the most widely reused algorithms in computer graphics
(used in film for bat swarms and stampedes) as well as a genuine reference
point in biology for how collective animal motion might actually work.

## Parameters to try

- Turn down separation and watch the flock collapse into an overlapping
  clump; turn it up and watch it scatter into loosely-coupled clusters.
- Increase the neighbour radius to see more of the flock move as one
  coherent mass rather than several sub-flocks.
- Push cohesion much higher than alignment to see agents crowd toward a
  centre point rather than move as a unified stream.

## Further reading

- Reynolds, C. W., "Flocks, Herds, and Schools: A Distributed Behavioral
  Model" (SIGGRAPH, 1987).
- Couzin, I. D. et al., "Collective Memory and Spatial Sorting in Animal
  Groups" (2002) — the biology side of the same question.
- Reynolds' own boids.co.uk pages on the original model and its variants.
