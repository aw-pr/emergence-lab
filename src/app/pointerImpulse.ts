/** The slice of the renderer the pointer-impulse handler needs. */
export interface PointerImpulseTarget {
  supportsImpulse(): boolean;
  applyPointerImpulse(clientX: number, clientY: number, strength?: number): boolean;
  isCustomObstacleMode?(): boolean;
  placeCustomRock?(clientX: number, clientY: number): boolean;
  placeCustomCapsule?(
    startClientX: number,
    startClientY: number,
    endClientX: number,
    endClientY: number,
  ): boolean;
  removeCustomObstacleAt?(clientX: number, clientY: number): boolean;
}

const CUSTOM_DRAG_THRESHOLD = 4;

/**
 * Click / drag on a non-fractal sim canvas perturbs the simulation under the
 * pointer via the kernel's optional applyImpulse. Left button only; the primary
 * pointer is captured for the duration of the drag so a poke keeps tracking off
 * the canvas edge. Fractal sims own their own pointer gestures (pan/zoom) and
 * never use this. Returns a detach function.
 */
export function attachPointerImpulse(
  canvas: HTMLCanvasElement,
  target: PointerImpulseTarget,
): () => void {
  const abort = new AbortController();
  const { signal } = abort;
  let activePointerId: number | null = null;
  let customGesture = false;
  let startClientX = 0;
  let startClientY = 0;
  let latestClientX = 0;
  let latestClientY = 0;

  canvas.addEventListener(
    "pointerdown",
    (ev) => {
      if (ev.button !== 0) return;
      activePointerId = ev.pointerId;
      customGesture = target.isCustomObstacleMode?.() === true;
      startClientX = ev.clientX;
      startClientY = ev.clientY;
      latestClientX = ev.clientX;
      latestClientY = ev.clientY;
      canvas.setPointerCapture(ev.pointerId);
      if (!customGesture) {
        target.applyPointerImpulse(ev.clientX, ev.clientY, 1);
      }
    },
    { signal },
  );

  canvas.addEventListener(
    "pointermove",
    (ev) => {
      if (activePointerId === null || ev.pointerId !== activePointerId) return;
      if (customGesture) {
        latestClientX = ev.clientX;
        latestClientY = ev.clientY;
      } else {
        target.applyPointerImpulse(ev.clientX, ev.clientY, 1);
      }
    },
    { signal },
  );

  const end = (ev: PointerEvent, commitCustomGesture: boolean): void => {
    if (activePointerId === null || ev.pointerId !== activePointerId) return;
    if (customGesture && commitCustomGesture) {
      latestClientX = ev.clientX;
      latestClientY = ev.clientY;
      const dragDistance = Math.hypot(
        latestClientX - startClientX,
        latestClientY - startClientY,
      );
      if (dragDistance >= CUSTOM_DRAG_THRESHOLD) {
        target.placeCustomCapsule?.(
          startClientX,
          startClientY,
          latestClientX,
          latestClientY,
        );
      } else if (!target.removeCustomObstacleAt?.(latestClientX, latestClientY)) {
        target.placeCustomRock?.(latestClientX, latestClientY);
      }
    }
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    activePointerId = null;
    customGesture = false;
  };

  canvas.addEventListener("pointerup", (ev) => end(ev, true), { signal });
  canvas.addEventListener("pointercancel", (ev) => end(ev, false), { signal });

  return () => abort.abort();
}
