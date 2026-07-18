import type { RenderMode } from "./rendererBackend.ts";
import type { ResolutionPreset } from "./resolutionPreset.ts";

export interface QualityProfile {
  defaultPreset: ResolutionPreset;
  /** Source cells per CSS pixel before the preset cell budget is applied. */
  computeScale: number;
  /** Device-pixel ratio ceiling for the standalone display backing store. */
  displayDprCap: number;
  maxDisplayDimension: number;
  maxDisplayPixels: number;
}

export type DeviceTier = "phone" | "tablet" | "desktop";

/**
 * Pure classifier so device-tier logic is unit-testable without a DOM. A
 * coarse pointer (touch) below a phone-sized viewport is a phone; a coarse
 * pointer above that is a tablet; anything with a fine pointer is desktop
 * regardless of window size (a small laptop window is not a mobile device).
 */
export function classifyDeviceTier(
  coarsePointer: boolean,
  minViewportDim: number,
): DeviceTier {
  if (!coarsePointer) return "desktop";
  return minViewportDim < 768 ? "phone" : "tablet";
}

export function detectDeviceTier(): DeviceTier {
  if (typeof window === "undefined") return "desktop";
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const minViewportDim = Math.min(window.innerWidth, window.innerHeight);
  return classifyDeviceTier(coarsePointer, minViewportDim);
}

// Ordered so a tier cap can find "is this preset above the ceiling" with a
// plain index comparison instead of a bespoke rank table per call site.
const PRESET_ORDER: readonly ResolutionPreset[] = [
  "performance",
  "balanced",
  "high",
  "ultra",
  "extreme",
];

function capPreset(
  preset: ResolutionPreset,
  cap: ResolutionPreset,
): ResolutionPreset {
  return PRESET_ORDER.indexOf(preset) > PRESET_ORDER.indexOf(cap)
    ? cap
    : preset;
}

// Grid compute cost, point-cloud density, and texture-upload/draw cost all
// scale with the compute grid, so these are the sims that hurt most on
// underpowered hardware — the ones worth force-capping on phones rather
// than just letting the general balanced cap apply.
const PHONE_FORCED_PERFORMANCE = new Set([
  "gray-scott",
  "belousov-zhabotinsky",
  "physarum",
  "logistic-mandelbrot",
  "lenia",
]);

const ULTRA_DEFAULTS = new Set([
  "logistic-mandelbrot",
  "lorenz-attractor",
  // Point-map histograms sharpen with every extra cell; the per-frame cost is
  // the fade sweep, which stays cheap even at the ultra grid.
  "clifford-dejong",
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

export function qualityProfileFor(
  slug: string,
  mode: RenderMode,
  tier: DeviceTier = detectDeviceTier(),
): QualityProfile {
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

  // Device tier adjusts the per-sim default above, never the other way
  // round, so a slug's baseline choice of preset stays the single source of
  // truth and the tier logic only ever pulls it down. Desktop keeps each
  // slug's baseline as-is (logistic-mandelbrot's "extreme" point cloud
  // included); only tablet and phone trim it down.
  if (tier === "tablet") {
    defaultPreset = capPreset(defaultPreset, "balanced");
  } else if (tier === "phone") {
    defaultPreset = capPreset(defaultPreset, "balanced");
    if (PHONE_FORCED_PERFORMANCE.has(slug)) defaultPreset = "performance";
  }

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
