# Clifford & De Jong Attractors

Two lines of arithmetic, iterated a few million times, that paint like smoke.

## The rule

Take a point, push it through a pair of trigonometric formulas, and plot where
it lands. Do it again from the new point. The Clifford map is

```
x' = sin(a·y) + c·cos(a·x)
y' = sin(b·x) + d·cos(b·y)
```

and De Jong's variant replaces the weighted cosines with pure ones. Four
coefficients — a, b, c, d — are the entire genome of the figure.

Unlike the strange attractors traced by differential equations, there is no
motion to follow here. Consecutive points land far apart; the orbit teleports
across the plane. Watching a single point tells you nothing. The picture only
exists in aggregate: plot enough visits and the histogram condenses into
filaments, veils and voids — the map's invariant measure made visible.

## Why it cannot escape

Every term is a sine or cosine, bounded between −1 and 1. However wild the
coefficients, the next point is always confined to a small box: [−2, 2]² for
De Jong, ±(1+|c|) by ±(1+|d|) for Clifford. The chaos is total but the arena
is fixed — which is why the whole coefficient space is safe to explore. Some
settings collapse to a handful of fixed points or a closed loop; those are
real behaviours of the map, not failures. Nudge a coefficient and the figure
either deforms smoothly or bifurcates into something unrecognisable.

## Colouring a histogram

Density gives brightness, but the hue channel has choices. Colouring by
*speed* — how far the orbit jumped to reach each cell — shades the figure by
how violently the map stretches there, and the stretch varies smoothly across
the attractor even though consecutive points do not. Colouring by *angle*
gives radial gradients about the centre; *cycle* drifts the whole palette over
time, the same convention as the strange-attractor trails.

## Provenance

These maps come from the home-computer chaos culture of the 1980s and 90s —
Clifford Pickover's books, Peter de Jong's Usenet-era map, Johnny Svensson's
scaled variant — an aesthetic search through coefficient space, keeping
whatever looked alive.
