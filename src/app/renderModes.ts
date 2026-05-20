import type { RenderMode } from "./rendererBackend.ts";

const GRID_SLUGS = new Set([
  "abelian-sandpile",
  "game-of-life",
  "diffusion-limited-aggregation",
  "elementary-cellular-automata",
  "brians-brain",
]);

const FRACTAL_SLUGS = new Set(["mandelbrot", "julia-set", "burning-ship"]);

export function getRenderMode(slug: string): RenderMode {
  if (GRID_SLUGS.has(slug)) return "grid";
  if (FRACTAL_SLUGS.has(slug)) return "fractal";
  if (slug === "lorenz-attractor") return "smooth";
  if (slug === "boids") return "particle";
  return "field";
}

export function shouldUseSmoothCanvasPresentation(mode: RenderMode): boolean {
  return mode === "field" || mode === "smooth" || mode === "fractal";
}
