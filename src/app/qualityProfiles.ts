import type { RenderMode } from "./rendererBackend.ts";
import type { ResolutionPreset } from "./renderer.ts";

export interface QualityProfile {
  defaultPreset: ResolutionPreset;
  /** Source cells per CSS pixel before the preset cell budget is applied. */
  computeScale: number;
  /** Device-pixel ratio ceiling for the standalone display backing store. */
  displayDprCap: number;
  maxDisplayDimension: number;
  maxDisplayPixels: number;
}

const ULTRA_DEFAULTS = new Set([
  "lorenz-attractor",
  "elementary-cellular-automata",
  "game-of-life",
  "diffusion-limited-aggregation",
  "boids",
  "cyclic-ca",
  "particle-life",
  "brians-brain",
  "ising-model",
  "kuramoto-oscillators",
  // The mandala's finest terraces are one cell wide, so a grid below the
  // canvas resolution loses them to resampling before the eye ever sees them.
  "abelian-sandpile",
]);

export function qualityProfileFor(slug: string, mode: RenderMode): QualityProfile {
  let defaultPreset: ResolutionPreset = "balanced";
  if (ULTRA_DEFAULTS.has(slug)) defaultPreset = "ultra";
  // The point-cloud builder consumes every extra candidate cell, and the
  // draw-side density slider keeps the frame cost adjustable without a
  // rebuild, so the densest tier is the right default here.
  if (slug === "logistic-mandelbrot") defaultPreset = "extreme";
  if (slug === "gray-scott" || slug === "belousov-zhabotinsky" || slug === "physarum") {
    defaultPreset = "high";
  }
  if (slug === "lenia") defaultPreset = "performance";

  let computeScale = mode === "field" || mode === "smooth" ? 1.2 : 1;
  // orbit3d derives its quality tier from this capped compute grid, then
  // converts that tier into a point budget in the WebGL point-cloud builder.
  if (slug === "logistic-mandelbrot") computeScale = 1.5;
  if (slug === "gray-scott") computeScale = 1.25;
  if (slug === "physarum" || slug === "lenia") computeScale = 1;

  const expensiveDisplay =
    mode === "field" ||
    mode === "smooth" ||
    mode === "fractal" ||
    mode === "orbit3d";
  return {
    defaultPreset,
    computeScale,
    displayDprCap: expensiveDisplay ? 3 : 2.5,
    maxDisplayDimension: expensiveDisplay ? 6144 : 4096,
    maxDisplayPixels: expensiveDisplay ? 12_582_912 : 8_388_608,
  };
}
