import type { ParamDescriptor, SimParams } from "./types.ts";
import {
  isFractalViewSlug,
  panByBitmapDelta,
  zoomAroundPoint,
  type FractalView,
} from "./fractalView.ts";

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
  previewParams: (next: SimParams) => void;
  commitParams: (next: SimParams) => void;
}

/**
 * Wheel zoom around pointer and drag-to-pan for fractal sims only.
 * Coordinate math matches each kernel's pixel → complex-plane mapping.
 */
export function attachFractalCanvasInteractions(
  options: FractalCanvasInteractionOptions,
): () => void {
  const { canvas, paramSchema, getParams, previewParams, commitParams } = options;
  const slug = options.slug;
  if (!isFractalViewSlug(slug)) return () => {};

  const abort = new AbortController();
  const { signal } = abort;

  let dragPointerId: number | null = null;
  let dragOriginClientX = 0;
  let dragOriginClientY = 0;
  let dragCurrentCssDx = 0;
  let dragCurrentCssDy = 0;
  let dragStartParams: SimParams | null = null;
  let lastClientX = 0;
  let lastClientY = 0;
  let gestureStart: { zoom: number; clientX: number; clientY: number } | null = null;
  let pendingParams: SimParams | null = null;
  let previewFrame = 0;
  let settleTimer = 0;

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

  const cssDeltaToBitmapDelta = (dxCss: number, dyCss: number): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height : 1;
    return [dxCss * sx, dyCss * sy];
  };

  const pixelToCss = (clientX: number, clientY: number): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height : 1;
    return [(clientX - rect.left) * sx, (clientY - rect.top) * sy];
  };

  const withCenterZoom = (
    params: SimParams,
    centerX: number,
    centerY: number,
    zoom: number,
  ): SimParams => ({
      ...params,
      centerX: clampKey("centerX", centerX),
      centerY: clampKey("centerY", centerY),
      zoom: clampKey("zoom", zoom),
  });

  const viewFrom = (params: SimParams): FractalView => ({
    centerX: num(params, "centerX", 0),
    centerY: num(params, "centerY", 0),
    zoom: num(params, "zoom", 1),
  });

  const schedulePreview = (next: SimParams): void => {
    pendingParams = next;
    if (previewFrame === 0) {
      previewFrame = requestAnimationFrame(() => {
        previewFrame = 0;
        if (pendingParams) previewParams(pendingParams);
      });
    }
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      if (previewFrame !== 0) {
        cancelAnimationFrame(previewFrame);
        previewFrame = 0;
      }
      const settled = pendingParams;
      pendingParams = null;
      if (settled) commitParams(settled);
    }, 140);
  };

  const zoomAroundCursor = (
    params: SimParams,
    clientX: number,
    clientY: number,
    factor: number,
  ): SimParams => {
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return params;

    const zoom0 = num(params, "zoom", 1);
    const [fx, fy] = pixelToCss(clientX, clientY);
    const zoom1 = clampKey("zoom", zoom0 * factor);
    const next = zoomAroundPoint(
      slug,
      viewFrom(params),
      w,
      h,
      { x: fx, y: fy },
      zoom1,
    );
    return withCenterZoom(params, next.centerX, next.centerY, next.zoom);
  };

  const panParamsByBitmapDelta = (
    params: SimParams,
    dx: number,
    dy: number,
  ): SimParams => {
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return params;
    const next = panByBitmapDelta(slug, viewFrom(params), w, h, dx, dy);
    return withCenterZoom(params, next.centerX, next.centerY, next.zoom);
  };

  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const sensitivity = ev.ctrlKey
        ? 0.02
        : ev.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 0.47
          : 0.0025;
      const factor = Math.exp(-ev.deltaY * sensitivity);
      const ceiling = ev.deltaMode === WheelEvent.DOM_DELTA_LINE || ev.ctrlKey ? 1.7 : 1.35;
      const clamped = Math.min(ceiling, Math.max(1 / ceiling, factor));
      const base = pendingParams ?? getParams();
      schedulePreview(zoomAroundCursor(base, ev.clientX, ev.clientY, clamped));
    },
    { passive: false, signal },
  );

  canvas.addEventListener(
    "gesturestart",
    (ev) => {
      ev.preventDefault();
      const gesture = ev as any;
      const params = getParams();
      gestureStart = {
        zoom: num(params, "zoom", 1),
        clientX: typeof gesture.clientX === "number" ? gesture.clientX : lastClientX,
        clientY: typeof gesture.clientY === "number" ? gesture.clientY : lastClientY,
      };
    },
    { passive: false, signal },
  );

  canvas.addEventListener(
    "gesturechange",
    (ev) => {
      ev.preventDefault();
      if (gestureStart === null) return;
      const gesture = ev as any;
      const scale = typeof gesture.scale === "number" && Number.isFinite(gesture.scale)
        ? gesture.scale
        : 1;
      const params = getParams();
      const zoom0 = num(params, "zoom", 1);
      if (zoom0 <= 0) return;
      const targetZoom = clampKey("zoom", gestureStart.zoom * scale);
      const clientX = typeof gesture.clientX === "number" ? gesture.clientX : gestureStart.clientX;
      const clientY = typeof gesture.clientY === "number" ? gesture.clientY : gestureStart.clientY;
      schedulePreview(zoomAroundCursor(params, clientX, clientY, targetZoom / zoom0));
    },
    { passive: false, signal },
  );

  canvas.addEventListener(
    "gestureend",
    (ev) => {
      ev.preventDefault();
      gestureStart = null;
    },
    { passive: false, signal },
  );

  canvas.addEventListener(
    "pointerdown",
    (ev) => {
      if (ev.button !== 0) return;
      dragPointerId = ev.pointerId;
      dragOriginClientX = ev.clientX;
      dragOriginClientY = ev.clientY;
      dragCurrentCssDx = 0;
      dragCurrentCssDy = 0;
      dragStartParams = { ...getParams() };
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;
      canvas.style.transform = "";
      canvas.setPointerCapture(ev.pointerId);
    },
    { signal },
  );

  canvas.addEventListener(
    "pointermove",
    (ev) => {
      if (dragPointerId === null || ev.pointerId !== dragPointerId) return;
      dragCurrentCssDx = ev.clientX - dragOriginClientX;
      dragCurrentCssDy = ev.clientY - dragOriginClientY;
      canvas.style.transform = `translate3d(${dragCurrentCssDx}px, ${dragCurrentCssDy}px, 0)`;
    },
    { signal },
  );

  const endDrag = (ev: PointerEvent, commit: boolean): void => {
    if (dragPointerId === null || ev.pointerId !== dragPointerId) return;
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    const params = dragStartParams;
    const [bitmapDx, bitmapDy] = cssDeltaToBitmapDelta(dragCurrentCssDx, dragCurrentCssDy);
    canvas.style.transform = "";
    if (commit && params !== null && (bitmapDx !== 0 || bitmapDy !== 0)) {
      commitParams(panParamsByBitmapDelta(params, bitmapDx, bitmapDy));
    }
    dragPointerId = null;
    dragStartParams = null;
    dragCurrentCssDx = 0;
    dragCurrentCssDy = 0;
  };

  canvas.addEventListener("pointerup", (ev) => endDrag(ev, true), { signal });
  canvas.addEventListener("pointercancel", (ev) => endDrag(ev, false), { signal });

  return () => {
    abort.abort();
    if (previewFrame !== 0) cancelAnimationFrame(previewFrame);
    window.clearTimeout(settleTimer);
  };
}
