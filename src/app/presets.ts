import type { SimParams } from "./types.ts";

export interface ParamPreset {
  id: string;
  label: string;
  params: SimParams;
}

const PRESETS: Record<string, readonly ParamPreset[]> = {
  "gray-scott": [
    {
      id: "mitosis",
      label: "Mitosis",
      params: { Du: 0.2097, Dv: 0.105, F: 0.0367, k: 0.0649, stepsPerFrame: 20 },
    },
    {
      id: "coral",
      label: "Coral",
      params: { Du: 0.2097, Dv: 0.105, F: 0.0545, k: 0.062, stepsPerFrame: 20 },
    },
    {
      id: "worms",
      label: "Worms",
      params: { Du: 0.2097, Dv: 0.105, F: 0.054, k: 0.063, stepsPerFrame: 20 },
    },
    {
      id: "maze",
      label: "Maze",
      params: { Du: 0.2097, Dv: 0.105, F: 0.029, k: 0.057, stepsPerFrame: 20 },
    },
    {
      id: "spots",
      label: "Spots",
      params: { Du: 0.2097, Dv: 0.105, F: 0.026, k: 0.0597, stepsPerFrame: 20 },
    },
    {
      id: "waves",
      label: "Waves",
      params: { Du: 0.2097, Dv: 0.105, F: 0.018, k: 0.0487, stepsPerFrame: 20 },
    },
    {
      id: "u-skate",
      label: "U-skate gliders",
      params: { Du: 0.2097, Dv: 0.105, F: 0.062, k: 0.0609, stepsPerFrame: 20 },
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
        seedDensity: 0.05,
      },
    },
    {
      id: "dense-ash",
      label: "Dense ash",
      params: {
        birthMin: 3,
        birthMax: 3,
        surviveMin: 2,
        surviveMax: 3,
        seedDensity: 0.28,
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
        boidCount: 700,
        visualRadius: 36,
        separationRadius: 6,
        maxSpeed: 16,
        alignment: 0.06,
        cohesion: 0.012,
        separation: 0.2,
      },
    },
    {
      id: "tight-flock",
      label: "Tight flock",
      params: {
        boidCount: 900,
        visualRadius: 30,
        separationRadius: 5,
        maxSpeed: 20,
        alignment: 0.1,
        cohesion: 0.02,
        separation: 0.16,
      },
    },
    {
      id: "scatter",
      label: "Scatter",
      params: {
        boidCount: 450,
        visualRadius: 24,
        separationRadius: 10,
        maxSpeed: 26,
        alignment: 0.03,
        cohesion: 0.004,
        separation: 0.5,
      },
    },
  ],
  physarum: [
    {
      id: "veins",
      label: "Veins",
      params: {
        agentCount: 32000,
        sensorAngle: 22.5,
        sensorDistance: 9,
        turnSpeed: 22.5,
        moveSpeed: 1,
        depositAmount: 0.24,
        evaporation: 0.9,
        stepsPerFrame: 1,
      },
    },
    {
      id: "coral-fans",
      label: "Coral fans",
      params: {
        agentCount: 26000,
        sensorAngle: 15,
        sensorDistance: 17,
        turnSpeed: 14,
        moveSpeed: 1.35,
        depositAmount: 0.2,
        evaporation: 0.94,
        stepsPerFrame: 1,
      },
    },
    {
      id: "filigree-web",
      label: "Filigree web",
      params: {
        agentCount: 60000,
        sensorAngle: 38,
        sensorDistance: 5,
        turnSpeed: 34,
        moveSpeed: 0.8,
        depositAmount: 0.12,
        evaporation: 0.96,
        stepsPerFrame: 1,
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
        walkersPerStep: 64,
        maxWalkSteps: 400,
        spawnRadius: 0.06,
        stickiness: 1,
        seedCount: 1,
      },
    },
    {
      id: "dense-coral",
      label: "Dense coral",
      params: {
        walkersPerStep: 80,
        maxWalkSteps: 400,
        spawnRadius: 0.03,
        stickiness: 0.4,
        seedCount: 3,
      },
    },
    {
      id: "multi-seed",
      label: "Multi-seed",
      params: {
        walkersPerStep: 64,
        maxWalkSteps: 400,
        spawnRadius: 0.06,
        stickiness: 0.8,
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
        cycleSpeed: 0.25,
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
        cycleSpeed: 0.35,
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
        cycleSpeed: 0.55,
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
        cycleSpeed: 0.30,
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
        cycleSpeed: 0.40,
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
        cycleSpeed: 0.20,
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
        cycleSpeed: 0.35,
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
        cycleSpeed: 0.50,
      },
    },
  ],
};

export function presetsFor(slug: string): readonly ParamPreset[] {
  return PRESETS[slug] ?? [];
}
