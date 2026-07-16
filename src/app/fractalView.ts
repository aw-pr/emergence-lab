export type FractalSlug = "mandelbrot" | "julia-set" | "burning-ship";

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

export function panByBitmapDelta(
  slug: FractalSlug,
  view: FractalView,
  width: number,
  height: number,
  dx: number,
  dy: number,
): FractalView {
  const before = complexAtPoint(slug, view, width, height, { x: 0, y: 0 });
  const after = complexAtPoint(slug, view, width, height, { x: dx, y: -dy });
  return {
    centerX: view.centerX - (after.x - before.x),
    centerY: view.centerY - (after.y - before.y),
    zoom: view.zoom,
  };
}

export function isFractalViewSlug(slug: string): slug is FractalSlug {
  return slug === "mandelbrot" || slug === "julia-set" || slug === "burning-ship";
}
