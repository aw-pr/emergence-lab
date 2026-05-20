import type { SimParams } from "./types.ts";

export interface ParamPreset {
  id: string;
  label: string;
  params: SimParams;
}

const PRESETS: Record<string, readonly ParamPreset[]> = {
  "gray-scott": [
    {
      id: "worms",
      label: "Worm trails",
      params: { Du: 0.16, Dv: 0.08, F: 0.035, k: 0.065 },
    },
    {
      id: "coral",
      label: "Coral growth",
      params: { Du: 0.18, Dv: 0.09, F: 0.06, k: 0.062 },
    },
    {
      id: "labyrinth",
      label: "Labyrinth",
      params: { Du: 0.2097, Dv: 0.105, F: 0.029, k: 0.057 },
    },
  ],
  "abelian-sandpile": [
    {
      id: "classic-critical",
      label: "Classic critical",
      params: {
        initialPile: 100000,
        toppleThreshold: 4,
        grainsPerStep: 1,
        topplesPerStep: 50000,
      },
    },
    {
      id: "fast-avalanches",
      label: "Fast avalanches",
      params: {
        initialPile: 250000,
        toppleThreshold: 4,
        grainsPerStep: 16,
        topplesPerStep: 150000,
      },
    },
    {
      id: "high-threshold",
      label: "High threshold",
      params: {
        initialPile: 350000,
        toppleThreshold: 8,
        grainsPerStep: 8,
        topplesPerStep: 120000,
      },
    },
  ],
  "game-of-life": [
    {
      id: "conway",
      label: "Conway",
      params: {
        birthMin: 3,
        birthMax: 3,
        surviveMin: 2,
        surviveMax: 3,
        seedDensity: 0.28,
      },
    },
    {
      id: "maze",
      label: "Maze-like",
      params: {
        birthMin: 3,
        birthMax: 3,
        surviveMin: 1,
        surviveMax: 5,
        seedDensity: 0.36,
      },
    },
    {
      id: "dense-ash",
      label: "Dense ash",
      params: {
        birthMin: 3,
        birthMax: 4,
        surviveMin: 2,
        surviveMax: 4,
        seedDensity: 0.42,
      },
    },
  ],
  "belousov-zhabotinsky": [
    {
      id: "spiral-waves",
      label: "Spiral waves",
      params: {
        diffusionA: 0.18,
        diffusionB: 0.08,
        diffusionC: 0.035,
        feed: 0.024,
        kill: 0.055,
        stepsPerFrame: 2,
      },
    },
    {
      id: "soft-rings",
      label: "Soft rings",
      params: {
        diffusionA: 0.14,
        diffusionB: 0.06,
        diffusionC: 0.055,
        feed: 0.018,
        kill: 0.045,
        stepsPerFrame: 3,
      },
    },
    {
      id: "fast-catalyst",
      label: "Fast catalyst",
      params: {
        diffusionA: 0.24,
        diffusionB: 0.11,
        diffusionC: 0.08,
        feed: 0.03,
        kill: 0.065,
        stepsPerFrame: 4,
      },
    },
  ],
  boids: [
    {
      id: "balanced-flock",
      label: "Balanced flock",
      params: {
        boidCount: 120,
        visualRadius: 16,
        separationRadius: 5,
        maxSpeed: 2,
        alignment: 0.055,
        cohesion: 0.009,
        separation: 0.2,
      },
    },
    {
      id: "tight-flock",
      label: "Tight flock",
      params: {
        boidCount: 180,
        visualRadius: 22,
        separationRadius: 4,
        maxSpeed: 2.6,
        alignment: 0.09,
        cohesion: 0.018,
        separation: 0.14,
      },
    },
    {
      id: "scatter",
      label: "Scatter",
      params: {
        boidCount: 90,
        visualRadius: 10,
        separationRadius: 10,
        maxSpeed: 3.4,
        alignment: 0.025,
        cohesion: 0.003,
        separation: 0.55,
      },
    },
  ],
  "lorenz-attractor": [
    {
      id: "classic",
      label: "Classic butterfly",
      params: { sigma: 10, rho: 28, beta: 2.6667, stepsPerFrame: 8, fade: 0.985 },
    },
    {
      id: "wide-wings",
      label: "Wide wings",
      params: { sigma: 10, rho: 35, beta: 2.6667, stepsPerFrame: 12, fade: 0.99 },
    },
    {
      id: "fast-trace",
      label: "Fast trace",
      params: { sigma: 14, rho: 32, beta: 3.1, stepsPerFrame: 20, fade: 0.975 },
    },
  ],
  "diffusion-limited-aggregation": [
    {
      id: "branching",
      label: "Branching",
      params: {
        walkersPerStep: 16,
        maxWalkSteps: 160,
        spawnRadius: 0.48,
        stickiness: 1,
        seedCount: 1,
      },
    },
    {
      id: "dense-coral",
      label: "Dense coral",
      params: {
        walkersPerStep: 18,
        maxWalkSteps: 160,
        spawnRadius: 0.42,
        stickiness: 0.35,
        seedCount: 3,
      },
    },
    {
      id: "multi-seed",
      label: "Multi-seed",
      params: {
        walkersPerStep: 16,
        maxWalkSteps: 160,
        spawnRadius: 0.45,
        stickiness: 0.65,
        seedCount: 8,
      },
    },
  ],
  "elementary-cellular-automata": [
    {
      id: "rule-30",
      label: "Rule 30 chaos",
      params: { rule: 30, seedMode: 0, stepsPerFrame: 1 },
    },
    {
      id: "rule-90",
      label: "Rule 90 triangles",
      params: { rule: 90, seedMode: 0, stepsPerFrame: 1 },
    },
    {
      id: "rule-110",
      label: "Rule 110 complexity",
      params: { rule: 110, seedMode: 0, stepsPerFrame: 1 },
    },
    {
      id: "rule-184",
      label: "Rule 184 traffic",
      params: { rule: 184, seedMode: 1, stepsPerFrame: 2 },
    },
  ],
  "brians-brain": [
    {
      id: "classic",
      label: "Classic waves",
      params: { birthCount: 2, seedDensity: 0.22, dyingValue: 0.5 },
    },
    {
      id: "sparse-spirals",
      label: "Sparse spirals",
      params: { birthCount: 2, seedDensity: 0.12, dyingValue: 0.62 },
    },
    {
      id: "storm",
      label: "Storm",
      params: { birthCount: 2, seedDensity: 0.36, dyingValue: 0.42 },
    },
  ],
  mandelbrot: [
    {
      id: "whole-set",
      label: "Whole set",
      params: {
        centerX: -0.5,
        centerY: 0,
        zoom: 1,
        maxIterations: 128,
        palettePhase: 0,
        cycleSpeed: 0.0008,
      },
    },
    {
      id: "seahorse-valley",
      label: "Seahorse valley",
      params: {
        centerX: -0.75,
        centerY: 0.047,
        zoom: 18,
        maxIterations: 256,
        palettePhase: 0.08,
        cycleSpeed: 0.0012,
      },
    },
    {
      id: "spiral-hub",
      label: "Spiral hub",
      params: {
        centerX: -0.761574,
        centerY: -0.0847596,
        zoom: 96,
        maxIterations: 384,
        palettePhase: 0.28,
        cycleSpeed: 0.0018,
      },
    },
  ],
  "julia-set": [
    {
      id: "kernel-dendrite",
      label: "Dendrite seed",
      params: {
        cRe: -0.8,
        cIm: 0.156,
        centerX: 0,
        centerY: 0,
        zoom: 1,
        maxIterations: 128,
        palettePhase: 0,
        cycleSpeed: 0.001,
      },
    },
    {
      id: "douady-rabbit",
      label: "Douady rabbit",
      params: {
        cRe: -0.123,
        cIm: 0.745,
        centerX: 0,
        centerY: 0,
        zoom: 1.15,
        maxIterations: 220,
        palettePhase: 0.12,
        cycleSpeed: 0.0013,
      },
    },
    {
      id: "filled-spiral",
      label: "Dense spiral",
      params: {
        cRe: -0.4,
        cIm: 0.6,
        centerX: 0,
        centerY: 0,
        zoom: 1.45,
        maxIterations: 180,
        palettePhase: 0.38,
        cycleSpeed: 0.0017,
      },
    },
  ],
  "burning-ship": [
    {
      id: "harbour",
      label: "Harbour view",
      params: {
        centerX: -0.5,
        centerY: -0.5,
        zoom: 1,
        maxIterations: 128,
        palettePhase: 0.15,
        cycleSpeed: 0.0007,
      },
    },
    {
      id: "mast",
      label: "Mast detail",
      params: {
        centerX: -1.755,
        centerY: -0.03,
        zoom: 14,
        maxIterations: 260,
        palettePhase: 0.1,
        cycleSpeed: 0.0011,
      },
    },
    {
      id: "ridge-deep",
      label: "Ridge deep zoom",
      params: {
        centerX: -1.744,
        centerY: -0.017,
        zoom: 72,
        maxIterations: 384,
        palettePhase: 0.42,
        cycleSpeed: 0.0016,
      },
    },
  ],
};

export function presetsFor(slug: string): readonly ParamPreset[] {
  return PRESETS[slug] ?? [];
}
