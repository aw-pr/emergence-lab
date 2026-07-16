---
title: "2D Ising Model"
slug: "ising-model"
family: "Statistical Physics"
---

## What it is

The Ising model is a lattice of two-state spins. Each spin prefers to agree with its neighbours, while temperature continually disrupts that agreement. No spin sees the whole field, yet large domains appear and compete.

## The rule

Each attempted flip changes the lattice energy. Flips that lower energy are accepted; flips that raise it may still occur, with a probability controlled by temperature. Near the critical temperature, correlations stretch across many scales and the field never settles into either simple order or featureless noise.

## Why it is interesting

It is one of the clearest demonstrations of a phase transition. A tiny change in temperature can move the same local rule between global alignment, critical islands, and thermal disorder. The model is deliberately a magnetic toy system, not a literal model of social behaviour.

## Parameters to try

- **Temperature** moves the lattice between ordered and disordered regimes.
- **Coupling** controls how strongly neighbouring spins prefer agreement.
- **External field** favours one orientation across the lattice.
- **Updates per frame** changes how quickly domains reorganise.
- Click or drag to seed an aligned patch.

## Further reading

- Nicholas Metropolis et al., *Equation of State Calculations by Fast Computing Machines* (1953).
- Ernst Ising, *Contribution to the Theory of Ferromagnetism* (1925).
