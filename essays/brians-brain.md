---
title: Brian's Brain
family: Cellular Automata
slug: brians-brain
subtitle: A three-state automaton with refractory cells and travelling wavefronts.
---

# Brian's Brain

## What it is

Three-state CA: births, living cells die to refractory, forming wavefronts
and spirals. Instead of Life's binary alive/dead, every cell can also be
"dying" — a mandatory in-between state that gives the automaton a sense of
directional memory a simple on/off rule can't have.

## The rule

A dead (off) cell with exactly two live neighbours is born. Any currently
alive (on) cell unconditionally becomes dying, no matter its neighbourhood.
Any dying cell unconditionally becomes dead. That third state — always
decaying forward, never able to re-fire immediately — is what turns the
automaton's activity into travelling wavefronts and spiral scrolls rather
than the more static still-lifes and gliders typical of two-state automata.

## Why it's interesting

Brian Silverman devised this rule as a deliberately simple two-state-plus-one
variant of Life, and it turned out to behave less like a settling puzzle and
more like an excitable medium — echoing the same "refractory period" idea
that drives real neural tissue and the Belousov–Zhabotinsky reaction, but
built from a rule table simple enough to state in one sentence. It rarely
reaches a static, stable equilibrium; instead it tends to keep generating
new wavefronts indefinitely, making it a nice minimal example of sustained,
non-settling activity from a completely deterministic local rule.

## Parameters to try

- Seed from a dense random field and watch it self-organise into travelling
  spiral and line wavefronts rather than fizzling out.
- Compare a sparse seed (activity often dies out) against a dense one
  (activity usually persists) to feel out the rough density threshold.
- Slow playback to trace a single wavefront's shape as it advances.

## Further reading

- Silverman, B. — original rule description via Rudy Rucker's CelLab / the
  Cellular Automata FAQ (Usenet, early 1990s).
- Wolfram, S., "A New Kind of Science" — multi-state cellular automata,
  Chapter 5.
- Wikipedia: "Brian's Brain" for the rule table and known emergent
  structures.
