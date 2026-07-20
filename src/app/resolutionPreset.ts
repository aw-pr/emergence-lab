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
  // this dense is wasted on texture-upload pipelines but feeds the orbit3d
  // point-cloud builder a larger candidate pool.
  extreme: 1920 * 1920,
};

export const DEFAULT_RESOLUTION: ResolutionPreset = "balanced";
