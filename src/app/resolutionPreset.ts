/**
 * Quality presets for the simulation's compute grid. They set a target cell
 * count, NOT a pixel size — the grid is independent of the display, so the
 * per-frame cost is the same on any screen. The actual grid dimensions are
 * derived from the target and the viewport aspect ratio.
 *
 * Kept in its own zero-dependency module (rather than living in renderer.ts)
 * so lighter-weight consumers like qualityProfiles.ts can depend on the
 * preset type without pulling in the WebGL/canvas renderer backends.
 */
export type ResolutionPreset =
  | "performance"
  | "balanced"
  | "high"
  | "ultra"
  | "extreme";

export const RESOLUTION_TARGETS: Readonly<Record<ResolutionPreset, number>> = {
  performance: 384 * 384,
  balanced: 640 * 640,
  high: 960 * 960,
  ultra: 1280 * 1280,
  // Only surfaced for sims that opt in (see showExtremeResolution); a grid
  // this dense is wasted on texture-upload pipelines but is the candidate
  // pool the orbit3d point-cloud builder sweeps for bounded cells. At 8
  // samples about a quarter of the pool survives and packs into roughly 1.6
  // rows a cell, so 1920 by 1920 filled about 15% of the 9.6M point budget
  // and left the plane's lattice coarser than the budget allows. 2560 by
  // 2560 is 1.78 times the candidates, a lattice 1.33 times finer on each
  // axis, and a base tier that still fits under its share of the budget at
  // the slider's maximum. The GPU sampler sweeps it in two calls of at most
  // MAX_SAMPLE_JOBS_PER_CALL jobs.
  extreme: 2560 * 2560,
};

export const DEFAULT_RESOLUTION: ResolutionPreset = "balanced";
