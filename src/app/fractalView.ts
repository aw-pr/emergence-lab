import { BASE_PLANE_SPAN } from "../sims/markus-lyapunov/model.ts";

export type FractalSlug =
  | "mandelbrot"
  | "julia-set"
  | "burning-ship"
  | "markus-lyapunov";

export interface FractalView {
  centerX: number;
  centerY: number;
  zoom: number;
}

export interface BitmapPoint {
  x: number;
  y: number;
}

const JULIA_BASE_HEIGHT = 3;
const BURNING_BASE_WIDTH = 3.4;

export function complexAtPoint(
  slug: FractalSlug,
  view: FractalView,
  width: number,
  height: number,
  point: BitmapPoint,
): BitmapPoint {
  if (width <= 0 || height <= 0) {
    return { x: view.centerX, y: view.centerY };
  }

  if (slug === "mandelbrot") {
    const scale = 3 / (Math.min(width, height) * view.zoom);
    return {
      x: view.centerX + (point.x - (width - 1) / 2) * scale,
      y: view.centerY + (point.y - (height - 1) / 2) * scale,
    };
  }

  if (slug === "markus-lyapunov") {
    // Mirrors sampleLyapunovGrid in src/sims/markus-lyapunov/model.ts exactly:
    // scale = BASE_PLANE_SPAN / (min(width, height) * zoom), centred on the
    // bitmap, so screen point → (a, b) matches the sampled grid pixel-for-pixel.
    const scale = BASE_PLANE_SPAN / (Math.min(width, height) * view.zoom);
    return {
      x: view.centerX + (point.x - (width - 1) / 2) * scale,
      y: view.centerY + (point.y - (height - 1) / 2) * scale,
    };
  }

  if (slug === "julia-set") {
    const viewHeight = JULIA_BASE_HEIGHT / view.zoom;
    const viewWidth = viewHeight * (width / height);
    const xScale = width > 1 ? viewWidth / (width - 1) : 0;
    const yScale = height > 1 ? viewHeight / (height - 1) : 0;
    return {
      x: view.centerX - viewWidth * 0.5 + point.x * xScale,
      y: view.centerY - viewHeight * 0.5 + point.y * yScale,
    };
  }

  const xDiv = Math.max(1, width - 1);
  const yDiv = Math.max(1, height - 1);
  const viewWidth = BURNING_BASE_WIDTH / view.zoom;
  const viewHeight = viewWidth * (height / width);
  return {
    x: view.centerX + (point.x / xDiv - 0.5) * viewWidth,
    y: view.centerY + (point.y / yDiv - 0.5) * viewHeight,
  };
}

export function zoomAroundPoint(
  slug: FractalSlug,
  view: FractalView,
  width: number,
  height: number,
  point: BitmapPoint,
  zoom: number,
): FractalView {
  const anchor = complexAtPoint(slug, view, width, height, point);
  const centred = complexAtPoint(
    slug,
    { centerX: 0, centerY: 0, zoom },
    width,
    height,
    point,
  );
  return {
    centerX: anchor.x - centred.x,
    centerY: anchor.y - centred.y,
    zoom,
  };
}

// Bitmap Y grows downward. The three classic fractals were authored so that a
// downward drag samples an *upward* plane step, so their pan negates the bitmap
// dy and their param widgets/tests depend on that. markus-lyapunov's
// complexAtPoint increases plane Y with bitmap Y (mirroring sampleLyapunovGrid
// in src/sims/markus-lyapunov/model.ts), so negating dy for it double-counts and
// inverts the vertical drag. Keying this by FractalSlug makes the convention
// explicit and forces any newly admitted slug to declare its own — the compiler
// requires an entry here — rather than silently inheriting the negation.
const PAN_INVERTS_BITMAP_Y: Record<FractalSlug, boolean> = {
  mandelbrot: true,
  "julia-set": true,
  "burning-ship": true,
  "markus-lyapunov": false,
};

export function panByBitmapDelta(
  slug: FractalSlug,
  view: FractalView,
  width: number,
  height: number,
  dx: number,
  dy: number,
): FractalView {
  const sampleDy = PAN_INVERTS_BITMAP_Y[slug] ? -dy : dy;
  const before = complexAtPoint(slug, view, width, height, { x: 0, y: 0 });
  const after = complexAtPoint(slug, view, width, height, { x: dx, y: sampleDy });
  return {
    centerX: view.centerX - (after.x - before.x),
    centerY: view.centerY - (after.y - before.y),
    zoom: view.zoom,
  };
}

export function isFractalViewSlug(slug: string): slug is FractalSlug {
  return (
    slug === "mandelbrot" ||
    slug === "julia-set" ||
    slug === "burning-ship" ||
    slug === "markus-lyapunov"
  );
}
