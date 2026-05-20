import type { ParamDescriptor, SimParams } from "./types.ts";

/** Slugs whose kernels use centre/zoom fractal navigation (see each kernel's init mapping). */
export const FRACTAL_SLUGS = new Set<string>([
  "mandelbrot",
  "julia-set",
  "burning-ship",
]);

export function isFractalSlug(slug: string): boolean {
  return FRACTAL_SLUGS.has(slug);
}

const PALETTE_CYCLE_SPEED_PARAM = "cycleSpeed";

export interface FractalPaletteCycleKeyboardOptions {
  slug: string;
  paramSchema: readonly ParamDescriptor[];
  getParams: () => SimParams;
  /** Push updated params through the renderer and refresh control widgets (no callback loops). */
  setParams: (next: SimParams) => void;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "BUTTON") return true;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Fractal-only: Arrow Up / Arrow Down adjust kernel palette `cycleSpeed`, clamped
 * to the param schema. Reverse animation is not expressible as negative speed
 * while schema min is 0 (kernels clamp); use Colour → cycle direction instead.
 */
export function attachFractalPaletteCycleKeyboard(
  options: FractalPaletteCycleKeyboardOptions,
): () => void {
  if (!FRACTAL_SLUGS.has(options.slug)) {
    return () => {};
  }

  const descriptor = options.paramSchema.find((p) => p.key === PALETTE_CYCLE_SPEED_PARAM);
  if (!descriptor || descriptor.type !== "number") {
    return () => {};
  }

  const step =
    typeof descriptor.step === "number" && descriptor.step > 0 ? descriptor.step : 0.001;
  const min = typeof descriptor.min === "number" ? descriptor.min : 0;
  const max = typeof descriptor.max === "number" ? descriptor.max : 1;
  const fallback =
    typeof descriptor.default === "number" ? descriptor.default : min;

  const abort = new AbortController();

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
    if (ev.repeat) return;
    if (isEditableKeyboardTarget(ev.target)) return;

    ev.preventDefault();

    const params = options.getParams();
    const raw = params[PALETTE_CYCLE_SPEED_PARAM];
    const cur = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
    const delta = ev.key === "ArrowUp" ? step : -step;
    const nextSpeed = Math.min(max, Math.max(min, cur + delta));
    if (nextSpeed === cur) return;

    options.setParams({ ...params, [PALETTE_CYCLE_SPEED_PARAM]: nextSpeed });
  };

  window.addEventListener("keydown", onKeyDown, { signal: abort.signal, capture: true });
  return () => abort.abort();
}

export interface FractalCanvasInteractionOptions {
  slug: string;
  canvas: HTMLCanvasElement;
  paramSchema: readonly ParamDescriptor[];
  getParams: () => SimParams;
  /** Push updated params through the renderer and refresh control widgets (no callback loops). */
  setParams: (next: SimParams) => void;
}

/**
 * Wheel zoom around pointer and drag-to-pan for fractal sims only.
 * Coordinate math matches each kernel's pixel → complex-plane mapping.
 */
export function attachFractalCanvasInteractions(
  options: FractalCanvasInteractionOptions,
): () => void {
  const { canvas, paramSchema, getParams, setParams } = options;
  const slug = options.slug;

  const abort = new AbortController();
  const { signal } = abort;

  let dragPointerId: number | null = null;
  let lastClientX = 0;
  let lastClientY = 0;

  const bounds = (key: string): { min: number; max: number } => {
    const d = paramSchema.find((p) => p.key === key);
    const min = d?.type === "number" ? d.min ?? -Infinity : -Infinity;
    const max = d?.type === "number" ? d.max ?? Infinity : Infinity;
    return { min, max };
  };

  const clampKey = (key: string, value: number): number => {
    const { min, max } = bounds(key);
    return Math.min(max, Math.max(min, value));
  };

  const num = (params: SimParams, key: string, fallback: number): number => {
    const v = params[key];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };

  const bitmapDelta = (clientX: number, clientY: number): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height : 1;
    return [(clientX - lastClientX) * sx, (clientY - lastClientY) * sy];
  };

  const pixelToCss = (clientX: number, clientY: number): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height : 1;
    return [(clientX - rect.left) * sx, (clientY - rect.top) * sy];
  };

  const applyCenterZoom = (
    params: SimParams,
    centerX: number,
    centerY: number,
    zoom: number,
  ): void => {
    setParams({
      ...params,
      centerX: clampKey("centerX", centerX),
      centerY: clampKey("centerY", centerY),
      zoom: clampKey("zoom", zoom),
    });
  };

  const zoomAroundCursor = (params: SimParams, clientX: number, clientY: number, factor: number): void => {
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return;

    const zoom0 = num(params, "zoom", 1);
    const cx0 = num(params, "centerX", 0);
    const cy0 = num(params, "centerY", 0);
    const [fx, fy] = pixelToCss(clientX, clientY);

    const zoom1 = clampKey("zoom", zoom0 * factor);

    if (slug === "mandelbrot") {
      const scale0 = 3 / (Math.min(w, h) * zoom0);
      const scale1 = 3 / (Math.min(w, h) * zoom1);
      const wx = cx0 + (fx - (w - 1) / 2) * scale0;
      const wy = cy0 + (fy - (h - 1) / 2) * scale0;
      const cx1 = wx - (fx - (w - 1) / 2) * scale1;
      const cy1 = wy - (fy - (h - 1) / 2) * scale1;
      applyCenterZoom(params, cx1, cy1, zoom1);
      return;
    }

    if (slug === "julia-set") {
      const aspect = w / h;
      const viewHeight0 = JULIA_BASE_HEIGHT / zoom0;
      const viewWidth0 = viewHeight0 * aspect;
      const xScale0 = w > 1 ? viewWidth0 / (w - 1) : 0;
      const yScale0 = h > 1 ? viewHeight0 / (h - 1) : 0;
      const wx = cx0 - viewWidth0 * 0.5 + fx * xScale0;
      const wy = cy0 - viewHeight0 * 0.5 + fy * yScale0;

      const viewHeight1 = JULIA_BASE_HEIGHT / zoom1;
      const viewWidth1 = viewHeight1 * aspect;
      const xScale1 = w > 1 ? viewWidth1 / (w - 1) : 0;
      const yScale1 = h > 1 ? viewHeight1 / (h - 1) : 0;
      const cx1 = wx + viewWidth1 * 0.5 - fx * xScale1;
      const cy1 = wy + viewHeight1 * 0.5 - fy * yScale1;
      applyCenterZoom(params, cx1, cy1, zoom1);
      return;
    }

    if (slug === "burning-ship") {
      const xDiv = Math.max(1, w - 1);
      const yDiv = Math.max(1, h - 1);
      const ws0 = BURNING_BASE_WIDTH / zoom0;
      const hs0 = ws0 * (h / w);
      const wx = cx0 + (fx / xDiv - 0.5) * ws0;
      const wy = cy0 + (fy / yDiv - 0.5) * hs0;

      const ws1 = BURNING_BASE_WIDTH / zoom1;
      const hs1 = ws1 * (h / w);
      const cx1 = wx - (fx / xDiv - 0.5) * ws1;
      const cy1 = wy - (fy / yDiv - 0.5) * hs1;
      applyCenterZoom(params, cx1, cy1, zoom1);
    }
  };

  const panByBitmapDelta = (params: SimParams, dx: number, dy: number): void => {
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return;

    const zoom = num(params, "zoom", 1);
    let cx = num(params, "centerX", 0);
    let cy = num(params, "centerY", 0);

    if (slug === "mandelbrot") {
      const scale = 3 / (Math.min(w, h) * zoom);
      cx -= dx * scale;
      cy += dy * scale;
    } else if (slug === "julia-set") {
      const aspect = w / h;
      const viewHeight = JULIA_BASE_HEIGHT / zoom;
      const viewWidth = viewHeight * aspect;
      const xScale = w > 1 ? viewWidth / (w - 1) : 0;
      const yScale = h > 1 ? viewHeight / (h - 1) : 0;
      cx -= dx * xScale;
      cy += dy * yScale;
    } else if (slug === "burning-ship") {
      const xDiv = Math.max(1, w - 1);
      const yDiv = Math.max(1, h - 1);
      const widthScale = BURNING_BASE_WIDTH / zoom;
      const heightScale = widthScale * (h / w);
      cx -= (dx / xDiv) * widthScale;
      cy += (dy / yDiv) * heightScale;
    }

    applyCenterZoom(params, cx, cy, zoom);
  };

  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const sensitivity = ev.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.35 : 0.0025;
      const factor = Math.exp(-ev.deltaY * sensitivity);
      const clamped = Math.min(1.35, Math.max(1 / 1.35, factor));
      zoomAroundCursor(getParams(), ev.clientX, ev.clientY, clamped);
    },
    { passive: false, signal },
  );

  canvas.addEventListener(
    "pointerdown",
    (ev) => {
      if (ev.button !== 0) return;
      dragPointerId = ev.pointerId;
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;
      canvas.setPointerCapture(ev.pointerId);
    },
    { signal },
  );

  canvas.addEventListener(
    "pointermove",
    (ev) => {
      if (dragPointerId === null || ev.pointerId !== dragPointerId) return;
      const [dx, dy] = bitmapDelta(ev.clientX, ev.clientY);
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;
      if (dx !== 0 || dy !== 0) {
        panByBitmapDelta(getParams(), dx, dy);
      }
    },
    { signal },
  );

  const endDrag = (ev: PointerEvent): void => {
    if (dragPointerId === null || ev.pointerId !== dragPointerId) return;
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    dragPointerId = null;
  };

  canvas.addEventListener("pointerup", endDrag, { signal });
  canvas.addEventListener("pointercancel", endDrag, { signal });

  return () => abort.abort();
}

/** Matches `BASE_VIEW_HEIGHT` in the Julia kernel. */
const JULIA_BASE_HEIGHT = 3;

/** Matches `BASE_VIEW_WIDTH` in the Burning Ship kernel. */
const BURNING_BASE_WIDTH = 3.4;
