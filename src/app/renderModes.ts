import type { RenderMode } from "./rendererBackend.ts";

const GRID_SLUGS = new Set([
  "game-of-life",
  "diffusion-limited-aggregation",
  "elementary-cellular-automata",
  "brians-brain",
  "cyclic-ca",
  "ising-model",
  // Grain counts on a lattice, not a continuous field. Smoothing interpolated
  // between neighbouring terraces and resampled the fractal, which read as
  // blur plus moire; the terraces are the whole point of the model.
  "abelian-sandpile",
]);

const FRACTAL_SLUGS = new Set(["mandelbrot", "julia-set", "burning-ship"]);

export function getRenderMode(slug: string): RenderMode {
  if (GRID_SLUGS.has(slug)) return "grid";
  if (FRACTAL_SLUGS.has(slug)) return "fractal";
  if (slug === "lorenz-attractor") return "smooth";
  if (slug === "boids" || slug === "particle-life") return "particle";
  return "field";
}

export function shouldUseSmoothCanvasPresentation(mode: RenderMode): boolean {
  return (
    mode === "field" ||
    mode === "smooth" ||
    mode === "fractal" ||
    mode === "particle"
  );
}
