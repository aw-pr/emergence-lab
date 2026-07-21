import { isEditableKeyboardEvent } from "./keyboardTarget.ts";
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
    if (isEditableKeyboardEvent(ev)) return;

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

export interface Orbit3DMarkerClientSnapshot {
  re: number;
  im: number;
  period: number;
  clientX: number;
  clientY: number;
}

export interface LogisticMandelbrotCanvasInteractionOptions {
  slug: string;
  canvas: HTMLCanvasElement;
  getMarker: () => Orbit3DMarkerClientSnapshot | null;
  moveMarker: (
    clientX: number,
    clientY: number,
  ) => Orbit3DMarkerClientSnapshot | null;
  orbit: (deltaCssX: number, deltaCssY: number) => void;
  pan: (deltaCssX: number, deltaCssY: number) => void;
  dolly: (factor: number) => void;
  resetCamera: () => void;
  onMarkerChange: (marker: Orbit3DMarkerClientSnapshot) => void;
}

interface ActiveOrbitPointer {
  clientX: number;
  clientY: number;
  pointerType: string;
  moved: boolean;
  pan: boolean;
}

/** Logistic-Mandelbrot only: orbit camera, dolly, reset, and c-marker drag. */
export function attachLogisticMandelbrotCanvasInteractions(
  options: LogisticMandelbrotCanvasInteractionOptions,
): () => void {
  if (options.slug !== "logistic-mandelbrot") return () => {};

  const { canvas } = options;
  const abort = new AbortController();
  const { signal } = abort;
  const pointers = new Map<number, ActiveOrbitPointer>();
  const originalTouchAction = canvas.style.touchAction;
  let markerPointerId: number | null = null;
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let multiTouchGesture = false;

  canvas.style.touchAction = "none";

  const markerHit = (ev: PointerEvent): boolean => {
    const marker = options.getMarker();
    if (!marker) return false;
    const radius = ev.pointerType === "touch" ? 32 : 21;
    return Math.hypot(ev.clientX - marker.clientX, ev.clientY - marker.clientY) <= radius;
  };

  const releasePointer = (pointerId: number): void => {
    try {
      canvas.releasePointerCapture(pointerId);
    } catch {
      /* capture may already have been released */
    }
  };

  canvas.addEventListener(
    "pointerdown",
    (ev) => {
      if (ev.button !== 0 && ev.button !== 2) return;
      ev.preventDefault();
      pointers.set(ev.pointerId, {
        clientX: ev.clientX,
        clientY: ev.clientY,
        pointerType: ev.pointerType,
        moved: false,
        pan: ev.button === 2 || ev.shiftKey,
      });
      canvas.setPointerCapture(ev.pointerId);

      if (pointers.size === 1 && !ev.shiftKey && ev.button === 0 && markerHit(ev)) {
        markerPointerId = ev.pointerId;
      } else if (pointers.size > 1) {
        markerPointerId = null;
        multiTouchGesture = true;
      }
    },
    { passive: false, signal },
  );

  canvas.addEventListener(
    "pointermove",
    (ev) => {
      const previous = pointers.get(ev.pointerId);
      if (!previous) return;
      ev.preventDefault();

      const before = Array.from(pointers.values());
      const dx = ev.clientX - previous.clientX;
      const dy = ev.clientY - previous.clientY;
      pointers.set(ev.pointerId, {
        ...previous,
        clientX: ev.clientX,
        clientY: ev.clientY,
        moved: previous.moved || Math.hypot(dx, dy) > 2,
      });

      if (pointers.size >= 2) {
        const after = Array.from(pointers.values());
        const beforeDistance = Math.hypot(
          before[0].clientX - before[1].clientX,
          before[0].clientY - before[1].clientY,
        );
        const afterDistance = Math.hypot(
          after[0].clientX - after[1].clientX,
          after[0].clientY - after[1].clientY,
        );
        if (beforeDistance > 0 && afterDistance > 0) {
          options.dolly(Math.min(1.25, Math.max(0.8, beforeDistance / afterDistance)));
        }
        const centroidDx =
          (after[0].clientX + after[1].clientX - before[0].clientX - before[1].clientX) / 2;
        const centroidDy =
          (after[0].clientY + after[1].clientY - before[0].clientY - before[1].clientY) / 2;
        if (centroidDx !== 0 || centroidDy !== 0) options.pan(centroidDx, centroidDy);
        return;
      }

      if (markerPointerId === ev.pointerId) {
        const marker = options.moveMarker(ev.clientX, ev.clientY);
        if (marker) options.onMarkerChange(marker);
        return;
      }
      const active = pointers.get(ev.pointerId);
      if (active?.pan) {
        options.pan(dx, dy);
        return;
      }
      options.orbit(dx, dy);
    },
    { passive: false, signal },
  );

  const endPointer = (ev: PointerEvent): void => {
    const pointer = pointers.get(ev.pointerId);
    if (!pointer) return;
    ev.preventDefault();
    releasePointer(ev.pointerId);
    pointers.delete(ev.pointerId);
    if (markerPointerId === ev.pointerId) markerPointerId = null;

    if (
      ev.type === "pointerup" &&
      pointer.pointerType === "touch" &&
      !pointer.moved &&
      !multiTouchGesture
    ) {
      const now = performance.now();
      const nearPrevious = Math.hypot(ev.clientX - lastTapX, ev.clientY - lastTapY) < 32;
      if (now - lastTapAt < 320 && nearPrevious) {
        options.resetCamera();
        lastTapAt = 0;
      } else {
        lastTapAt = now;
        lastTapX = ev.clientX;
        lastTapY = ev.clientY;
      }
    }
    if (pointers.size === 0) multiTouchGesture = false;
  };

  canvas.addEventListener("pointerup", endPointer, { passive: false, signal });
  canvas.addEventListener("pointercancel", endPointer, { passive: false, signal });

  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const sensitivity = ev.ctrlKey
        ? 0.012
        : ev.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 0.08
          : 0.0015;
      const factor = Math.exp(ev.deltaY * sensitivity);
      options.dolly(Math.min(1.35, Math.max(1 / 1.35, factor)));
    },
    { passive: false, signal },
  );

  canvas.addEventListener(
    "dblclick",
    (ev) => {
      ev.preventDefault();
      options.resetCamera();
    },
    { signal },
  );

  canvas.addEventListener(
    "contextmenu",
    (ev) => ev.preventDefault(),
    { signal },
  );

  const initialMarker = options.getMarker();
  if (initialMarker) options.onMarkerChange(initialMarker);

  return () => {
    abort.abort();
    for (const pointerId of pointers.keys()) releasePointer(pointerId);
    pointers.clear();
    canvas.style.touchAction = originalTouchAction;
  };
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
