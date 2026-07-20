# Emergence lab

![Status: Proof of Concept](https://img.shields.io/badge/status-proof%20of%20concept-orange) ![Phase: Hone](https://img.shields.io/badge/phase-hone-blue) ![Stack: TypeScript + Vite](https://img.shields.io/badge/stack-TypeScript%20%2B%20Vite-3178c6) ![Renderer: WebGL2](https://img.shields.io/badge/renderer-WebGL2-990000) ![Agents: Claude + Codex](https://img.shields.io/badge/agents-Claude%20%2B%20Codex-7c3aed) ![Licence: MIT](https://img.shields.io/badge/licence-MIT-green)

> Many agents following simple local rules exhibit *emergent
> behaviour*, seen in everything from ecosystems to economies. 
>
> A test project for multi-agent orchestration across
> Claude and Codex using the Autometta repo. The higher tier models plan and orchestrate while lower tiers code and verify with clear boundaries. Cross-family orchestration improves outcomes and catches failure modes that a single model misses, at more than twice the cost...

[Run the app in a browser](https://amazing-empanada-7d6e5f.netlify.app/)

[View the research: Emergent behaviour from nature to management theory.](https://anthonywest.co.uk/research/emergent-behaviour-cross-domain)  

![Julia set, escape-time render from the lab](docs/images/julia-hero.png)

## The nineteen

Nineteen deterministic kernels behind one renderer. Each is a different
discipline's way of pointing at the same thing: local rules, global form.

- **Gray-Scott** reaction diffusion. Chemistry's version of the question.
- **Abelian sandpile.** Self-organised criticality in one toy.
- **2D Ising model.** A magnetic lattice assembling order at a phase transition.
- **Kuramoto oscillators.** Different rhythms crossing into collective synchrony.
- **Conway's Game of Life.** The original, and still the cleanest.
- **Belousov-Zhabotinsky** waves. The reaction that taught chemistry about excitable media.
- **Boids.** Flocking from three local rules.
- **Particle life.** A handful of attraction rules, and cells assemble themselves.
- **Physarum.** Slime-mould agents laying pheromone trails into networks.
- **Strange attractors** (Lorenz, Rössler, Thomas, Aizawa, Halvorsen — five separate cards). Where deterministic equations stop being predictable.
- **Diffusion-limited aggregation.** How dendrites and lightning agree.
- **Elementary cellular automata.** Wolfram's one-dimensional zoo.
- **Brian's Brain.** Three states. Somehow it breathes.
- **Cyclic cellular automata.** Rock-paper-scissors that spirals into itself.
- **Lenia.** Continuous cellular automata, and life gets smooth gliders.
- **Mandelbrot, Julia, Burning Ship.** Iterated maps as the geometry of feedback.
- **Logistic Mandelbrot.** The bifurcation cascade hung off the Mandelbrot set as a curtain.

Gray-Scott is the priority kernel. The others are calibrated and held.

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173/`.

Checks:

```bash
npm run verify   # types, kernel tests, production build
npm test
npm run build
```

## Publish into the site

The lab's own Netlify deploy serves from the root path (`/`) and is unaffected
by the steps below. To vendor a build into the promo-flow site instead, at
`/labs/app/`:

```bash
npm run publish:site
```

This publishes four artifacts (`scripts/publish-site.sh`), each rsynced with
`-a --delete` so stale files from a previous build are removed:

- `dist/` → `public/labs/app/` — the static app (Vite base `/labs/app/`),
  standalone and fullscreen target
- `dist-lib/` → `public/labs/lib/` — the library build (`vite.lib.config.ts`,
  entry `src/app/lib.ts`): the `<emergence-lab-sim>` web component plus
  `mountLab`, which the site's /labs/run shell imports by URL and mounts inline
- KaTeX css + fonts → `public/labs/app/katex/` — stable unhashed path the web
  component links into its shadow root (class rules) and the host document
  (font faces)
- registry manifest → `src/vendor/emergence-lab/registry.json` — lets the
  site's build fail on slug drift instead of shipping dead deep links

The promo-flow path defaults to a sibling checkout; override it with
`PROMO_FLOW_DIR` if promo-flow lives elsewhere:

```bash
PROMO_FLOW_DIR=/path/to/promo-flow npm run publish:site
```

Nothing is committed or pushed on the promo-flow side; that repository
commits its own copy of the vendored build.

## Stack

Vite and TypeScript throughout. Kernels are pure deterministic numerics
with no runtime dependencies. The renderer uses a quality-first WebGL2/GPU
path, including direct fragment-shader fractals, with Canvas 2D kept as a
fallback and debug surface.
Legacy browsers are not a target.

## Adding a simulation

1. Extend the `SimKernel` contract in [`docs/INTERFACE.md`](docs/INTERFACE.md) if the new sim needs it.
2. Add the kernel under `src/sims/<name>/` and wire the gallery in `src/app/**`.
3. Write the essay in `essays/<name>.md`.

There is no fixed split of the codebase by model — any agent may work any  
part of it. Multi-agent work runs through autometta (a worker/verifier loop)  
when parallel work and cross-checking are wanted. The kernel contract in  
[`docs/INTERFACE.md`](docs/INTERFACE.md) stays a reviewed boundary. See  
[`MODELS.md`](MODELS.md).

## Repository layout

```
emergence-lab/
  src/                    # kernels, renderer, controls, gallery
    sims/<name>/kernel.ts # deterministic kernel
    app/                  # renderer, gallery, controls, presets
  essays/                 # one .md per sim
  docs/
    INTERFACE.md          # the SimKernel contract
    PUBLISH-WORKFLOW.md   # publish-safety hooks and remotes
  state/handoffs/         # autometta worker completion envelopes
```

## Version history

| Version | Date | Summary |
|---|---|---|
| v0.2.0 | 2026-07-20 | Immersive fullscreen, web-component build + site publish pipeline |
| v0.1.0 | 2026-07-20 | Initial public mirror: 19 kernels behind one renderer |
