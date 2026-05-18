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
export interface SimEntry {
  slug: string;
  name: string;
  description?: string;
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

export const REGISTRY: readonly SimEntry[] = [
  {
    slug: "gray-scott",
    name: "Gray-Scott",
    description:
      "Two-species reaction-diffusion. Watch spots and stripes self-organise from a seed patch.",
    load: async () => {
      const mod = await import("../sims/gray-scott/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "abelian-sandpile",
    name: "Abelian Sandpile",
    description:
      "Grain-by-grain buildup and avalanches on a lattice. Stable patterns emerge near the edge of criticality.",
    load: async () => {
      const mod = await import("../sims/abelian-sandpile/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "game-of-life",
    name: "Game of Life",
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
    description:
      "Excitable reaction–diffusion medium; spiral waves and target patterns propagate across the field.",
    load: async () => {
      const mod = await import("../sims/belousov-zhabotinsky/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "boids",
    name: "Boids",
    description:
      "Simple local rules yield flocking—alignment, cohesion, and separation sculpt coherent motion from noise.",
    load: async () => {
      const mod = await import("../sims/boids/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "lorenz-attractor",
    name: "Lorenz Attractor",
    description:
      "The classic chaotic flow in three dimensions. Follow a trajectory tracing the butterfly-shaped strange attractor.",
    load: async () => {
      const mod = await import("../sims/lorenz-attractor/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
  {
    slug: "diffusion-limited-aggregation",
    name: "Diffusion-Limited Aggregation",
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
    description:
      "Escaping iteration with mirrored absolute axes—ridge-like corridors and flaming hull wakes along jagged quadratic coastlines.",
    load: async () => {
      const mod = await import("../sims/burning-ship/kernel.ts");
      return pickKernelExport(mod as Record<string, unknown>);
    },
  },
];

export function findEntry(slug: string): SimEntry | undefined {
  return REGISTRY.find((entry) => entry.slug === slug);
}
