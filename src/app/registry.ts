import type { SimKernel } from "./types.ts";

/**
 * Registry of available simulations.
 *
 * Each entry owns the dynamic import path for its kernel module. The renderer
 * never imports kernel files directly: it asks the loader for an instance by
 * slug, and the loader uses this registry to resolve the import.
 *
 * Adding a new sim is a one-line change here plus the kernel file under
 * src/sims/<slug>/kernel.ts. The renderer reads everything else off the
 * SimKernel instance (paramSchema, channelCount, channelRanges, etc.).
 */
/**
 * A selectable configuration within a single sim kernel, surfaced as its own
 * gallery card and reachable at #/<slug>/<variant>. The kernel is shared; only
 * the initial params (and presentation copy) differ. Used by the strange
 * attractors, where one integrator draws several named attractors.
 */
export interface SimVariant {
  /** Route suffix under the parent slug: #/<slug>/<variant>. */
  variant: string;
  name: string;
  subtitle?: string;
  description?: string;
  /** Initial kernel params that pick this variant (e.g. { attractor }). */
  params: Record<string, number | boolean | string>;
}

export interface SimEntry {
  slug: string;
  name: string;
  /** Model family this sim belongs to (shown as a tag in the sim header). */
  family?: string;
  /** One-line intro shown under the title in the sim header. */
  subtitle?: string;
  description?: string;
  /** Optional per-variant cards backed by the same kernel (see SimVariant). */
  variants?: readonly SimVariant[];
  load: () => Promise<SimKernel>;
}

function pickKernelExport(mod: Record<string, unknown>): SimKernel {
  const candidate =
    (mod as { default?: unknown }).default ??
    Object.values(mod).find((value) => typeof value === "function");

  if (typeof candidate !== "function") {
    throw new Error(
      "Kernel module exposes no constructor (expected a default export or a class export).",
    );
  }

  const instance = new (candidate as new () => unknown)();
  assertSimKernel(instance);
  return instance;
}

function assertSimKernel(value: unknown): asserts value is SimKernel {
  const k = value as Partial<SimKernel>;
  if (
    !k ||
    typeof k.init !== "function" ||
    typeof k.step !== "function" ||
    typeof k.readState !== "function" ||
    typeof k.destroy !== "function" ||
    typeof k.channelCount !== "number" ||
    !Array.isArray(k.channelRanges) ||
    !Array.isArray(k.channelLabels) ||
    !Array.isArray(k.paramSchema) ||
    typeof k.name !== "string"
  ) {
    throw new Error("Loaded module does not satisfy SimKernel interface.");
  }
}

/**
 * Feature flag: sims shelved from the app without removing their code.
 * A slug listed here disappears from the gallery and its route stops
 * resolving; kernels, presets, and tests stay intact. Delete the slug
 * from this set to bring the sim back.
 */
const SHELVED_SLUGS: ReadonlySet<string> = new Set([
  "swarmalators",
  "markus-lyapunov",
]);

const CATALOGUE: readonly SimEntry[] = [
  {
    slug: "gray-scott",
    name: "Gray-Scott",
    family: "Reaction–Diffusion",
    subtitle: "Two chemicals diffuse and react into Turing spots and stripes.",
    description:
      "Two-species reaction-diffusion. Watch spots and stripes self-organise from a warm-started central seed.",
    load: async () => {
      const mod = await import("../sims/gray-scott/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "abelian-sandpile",
    name: "Abelian Sandpile",
    family: "Self-Organised Criticality",
    subtitle: "Toppling grains relax a critical pile into fractal terraces.",
    description:
      "Grain-by-grain buildup and avalanches on a lattice. Stable patterns emerge near the edge of criticality.",
    load: async () => {
      const mod = await import("../sims/abelian-sandpile/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "ising-model",
    name: "2D Ising Model",
    family: "Statistical Physics",
    subtitle: "Thermal noise and local spin agreement assemble critical domains.",
    description:
      "A magnetic lattice near its phase transition: local alignment competes with heat until islands suddenly organise across the whole field.",
    load: async () => {
      const mod = await import("../sims/ising-model/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "kuramoto-oscillators",
    name: "Kuramoto Oscillators",
    family: "Synchronisation",
    subtitle: "Coupled phases cross a threshold and begin to move together.",
    description:
      "A field of oscillators with different natural frequencies. Local or global coupling pulls their phases into waves, vortices, and collective synchrony.",
    load: async () => {
      const mod = await import("../sims/kuramoto-oscillators/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "game-of-life",
    name: "Game of Life",
    family: "Cellular Automata",
    subtitle: "Birth and survival rules on a grid breed gliders and still lifes.",
    description:
      "Conway's cellular automaton: simple local rules produce gliders, oscillators, and complex dynamics.",
    load: async () => {
      const mod = await import("../sims/game-of-life/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "belousov-zhabotinsky",
    name: "Belousov–Zhabotinsky",
    family: "Reaction–Diffusion",
    subtitle: "An excitable chemical medium rolls out spirals and target waves.",
    description:
      "Excitable reaction–diffusion medium; spiral waves and target patterns propagate across the field.",
    load: async () => {
      const mod = await import("../sims/belousov-zhabotinsky/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "physarum",
    name: "Physarum",
    family: "Stigmergy",
    subtitle: "Trail-following agents weave a slime-mould transport network.",
    description:
      "Thousands of agents sniff, steer toward, and reinforce a shared trail field—diffusion and decay prune it into branching, self-optimising veins.",
    load: async () => {
      const mod = await import("../sims/physarum/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "boids",
    name: "Boids",
    family: "Swarm & Flocking",
    subtitle: "Three steering urges turn scattered agents into a flock.",
    description:
      "Simple local rules yield flocking—alignment, cohesion, and separation sculpt coherent motion from noise.",
    load: async () => {
      const mod = await import("../sims/boids/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "particle-life",
    name: "Particle Life",
    family: "Swarm & Flocking",
    subtitle: "A random attraction matrix breeds chasing, orbiting, cell-like life.",
    description:
      "Coloured particles pull and push by species. Asymmetric forces—A chases B while B flees A—self-organise into membranes, cells, and roving hunters.",
    load: async () => {
      const mod = await import("../sims/particle-life/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "swarmalators",
    name: "Swarmalators",
    family: "Swarm & Flocking",
    subtitle: "Oscillators couple where they gather to shape living phase waves.",
    description:
      "Particles attract and repel while their internal clocks synchronise or split—forming still discs, rainbow rings, rotating shards, and restless waves.",
    load: async () => {
      const mod = await import("../sims/swarmalators/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "lorenz-attractor",
    name: "Strange Attractors",
    family: "Chaotic Systems",
    subtitle: "A gallery of three-variable flows tracing strange attractors.",
    description:
      "Pick an attractor—Lorenz butterfly, Rössler spiral, Thomas coil, Aizawa spindle or Halvorsen bloom—and follow a single trajectory trace out its shape.",
    variants: [
      {
        variant: "lorenz",
        name: "Lorenz Attractor",
        subtitle: "The classic butterfly: convection rolls that never repeat.",
        description:
          "Two lobes traced by a single never-repeating orbit—the original strange attractor.",
        params: { attractor: "lorenz" },
      },
      {
        variant: "rossler",
        name: "Rössler Attractor",
        subtitle: "A flat spiral that periodically folds up out of plane.",
        description:
          "A slow outward spiral punctuated by a sharp z-axis fold—chaos from one quadratic term.",
        params: { attractor: "rossler" },
      },
      {
        variant: "thomas",
        name: "Thomas Attractor",
        subtitle: "A cyclically symmetric sine flow winding a slow coil.",
        description:
          "Cyclically symmetric sine dynamics coil into a labyrinthine, slowly drifting knot.",
        params: { attractor: "thomas" },
      },
      {
        variant: "aizawa",
        name: "Aizawa Attractor",
        subtitle: "A spindle wrapped in threads with a punched-through axis.",
        description:
          "An onion-like spindle threaded by orbits that pierce and re-wrap its polar axis.",
        params: { attractor: "aizawa" },
      },
      {
        variant: "halvorsen",
        name: "Halvorsen Attractor",
        subtitle: "A three-armed cyclically symmetric spiral bloom.",
        description:
          "Three symmetric arms spiral inward and out in a continuously blooming rosette.",
        params: { attractor: "halvorsen" },
      },
    ],
    load: async () => {
      const mod = await import("../sims/lorenz-attractor/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "clifford-dejong",
    name: "Clifford & De Jong",
    family: "Chaotic Systems",
    subtitle: "Two sin/cos rules scatter millions of points into gauzy attractors.",
    description:
      "Iterate a four-coefficient trigonometric map and plot every visit: the density histogram condenses into folded, smoke-like figures — Clifford's weighted curls, De Jong's whorls, Svensson's ribbons.",
    variants: [
      {
        variant: "clifford",
        name: "Clifford Attractor",
        subtitle: "Pickover's coefficient-weighted sin/cos curls.",
        description:
          "Clifford Pickover's map: two sine terms bent by cosine feedback, folding the plane into layered, curling veils.",
        params: { map: "clifford", a: -1.4, b: 1.6, c: 1.0, d: 0.7 },
      },
      {
        variant: "dejong",
        name: "De Jong Attractor",
        subtitle: "All-trig folding into dense loops and whorls.",
        description:
          "Peter de Jong's map: four pure trig terms confine the orbit to a 4×4 box it fills with knotted, self-crossing whorls.",
        params: { map: "dejong", a: 1.4, b: -2.3, c: 2.4, d: -2.1 },
      },
      {
        variant: "svensson",
        name: "Svensson Attractor",
        subtitle: "A scaled variant stretching wide, symmetric ribbons.",
        description:
          "Johnny Svensson's variant: a large scaling coefficient stretches the figure into broad, near-symmetric drapes.",
        // Higher exposure than the schema default: this drape spreads its
        // density over far more cells than the other two maps, so the same
        // per-point deposit leaves it looking washed out.
        params: { map: "svensson", a: 1.4, b: 1.56, c: 1.4, d: -6.56, exposure: 0.08 },
      },
    ],
    load: async () => {
      const mod = await import("../sims/clifford-dejong/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "diffusion-limited-aggregation",
    name: "Diffusion-Limited Aggregation",
    family: "Aggregation & Growth",
    subtitle: "Random walkers freeze on contact into branching dendrites.",
    description:
      "Random walkers stick to a seed; branching clusters grow outward without global planning.",
    load: async () => {
      const mod = await import("../sims/diffusion-limited-aggregation/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "elementary-cellular-automata",
    name: "Elementary Cellular Automata",
    family: "Cellular Automata",
    subtitle: "A one-dimensional Wolfram rule grows row by row into complexity.",
    description:
      "One-dimensional rule space: pick a Wolfram rule and watch patterns evolve from a single row.",
    load: async () => {
      const mod = await import("../sims/elementary-cellular-automata/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "brians-brain",
    name: "Brian's Brain",
    family: "Cellular Automata",
    subtitle: "A three-state automaton with refractory cells and travelling wavefronts.",
    description:
      "Three-state CA: births, living cells die to refractory, forming wavefronts and spirals.",
    load: async () => {
      const mod = await import("../sims/brians-brain/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "mandelbrot",
    name: "Mandelbrot",
    family: "Escape-Time Fractals",
    subtitle: "Iterating z² + c maps which points stay bounded forever.",
    description:
      "Quadratic cardioid shoreline—deep zoom stacks escape-time into saturated rings, the zoom-and-palette rhythm of dedicated fractal explorers.",
    load: async () => {
      const mod = await import("../sims/mandelbrot/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "julia-set",
    name: "Julia Set",
    family: "Escape-Time Fractals",
    subtitle: "A fixed seed c splits the plane into prisoner and escapee sets.",
    description:
      "Fix a complex seed c and carve the prisoner set—dendrites, spirals and lacework tides shift as one constant rewires the whole picture.",
    load: async () => {
      const mod = await import("../sims/julia-set/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "burning-ship",
    name: "Burning Ship",
    family: "Escape-Time Fractals",
    subtitle: "Absolute-value iteration forges a jagged flaming hull.",
    description:
      "Escaping iteration with mirrored absolute axes—ridge-like corridors and flaming hull wakes along jagged quadratic coastlines.",
    load: async () => {
      const mod = await import("../sims/burning-ship/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "logistic-mandelbrot",
    name: "Logistic Mandelbrot",
    family: "Escape-Time Fractals",
    subtitle: "Orbit attractors stacked over the c-plane reveal the bifurcation diagram.",
    description:
      "For each c the settled orbit of z² + c is plotted as height: bulbs fan into period sheets, the real axis hangs the logistic cascade as a curtain, and the Mandelbrot set anchors the floor.",
    load: async () => {
      const mod = await import("../sims/logistic-mandelbrot/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "markus-lyapunov",
    name: "Markus–Lyapunov Fractal",
    family: "Escape-Time Fractals",
    subtitle: "Alternating logistic maps divide stable cycles from chaos.",
    description:
      "Sweep two growth rates across the plane and follow their repeating schedule: amber islands mark settling orbits while blue-black channels expose chaos between them, the whole plane turning slowly about its centre.",
    load: async () => {
      const mod = await import("../sims/markus-lyapunov/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "cyclic-ca",
    name: "Cyclic Cellular Automaton",
    family: "Cellular Automata",
    subtitle: "Rock-paper-scissors states chase each other into spiral waves.",
    description:
      "Each cell's state is consumed by its cyclic successor once enough neighbours reach it—random noise resolves into droplets, demons, and full-screen spirals.",
    load: async () => {
      const mod = await import("../sims/cyclic-ca/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "lenia",
    name: "Lenia",
    family: "Cellular Automata",
    subtitle: "A continuous Game of Life where soft blobs condense and glide.",
    description:
      "Continuous-state cellular automaton: a ring kernel and a Gaussian growth rule turn scattered blobs into self-organising creatures.",
    load: async () => {
      const mod = await import("../sims/lenia/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
];

export const REGISTRY: readonly SimEntry[] = CATALOGUE.filter(
  (entry) => !SHELVED_SLUGS.has(entry.slug),
);

export function findEntry(slug: string): SimEntry | undefined {
  return REGISTRY.find((entry) => entry.slug === slug);
}
