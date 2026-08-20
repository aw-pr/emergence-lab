/** The slice of the renderer the pointer-impulse handler needs. */
export interface PointerImpulseTarget {
  applyPointerImpulse?(clientX: number, clientY: number, strength?: number): boolean;
  editsObstacles?(): boolean;
  placeCustomRock?(clientX: number, clientY: number): boolean;
  placeCustomCapsule?(
    startClientX: number,
    startClientY: number,
    endClientX: number,
    endClientY: number,
  ): boolean;
  removeCustomObstacleAt?(clientX: number, clientY: number): boolean;
}

const OBSTACLE_DRAG_THRESHOLD = 4;

/**
 * Click / drag on a non-fractal sim canvas either edits obstacles or perturbs
 * the simulation through its optional impulse path. Left button only; the
 * primary pointer is captured for the duration of the drag. Fractal sims own
 * their own pointer gestures and never use this. Returns a detach function.
 */
export function attachPointerImpulse(
  canvas: HTMLCanvasElement,
  target: PointerImpulseTarget,
): () => void {
  const abort = new AbortController();
  const { signal } = abort;
  let activePointerId: number | null = null;
  let obstacleGesture = false;
  let startClientX = 0;
  let startClientY = 0;
  let latestClientX = 0;
  let latestClientY = 0;

  canvas.addEventListener(
    "pointerdown",
    (ev) => {
      if (ev.button !== 0) return;
      activePointerId = ev.pointerId;
      obstacleGesture = target.editsObstacles?.() === true;
      startClientX = ev.clientX;
      startClientY = ev.clientY;
      latestClientX = ev.clientX;
      latestClientY = ev.clientY;
      canvas.setPointerCapture(ev.pointerId);
      if (!obstacleGesture) {
        target.applyPointerImpulse?.(ev.clientX, ev.clientY, 1);
      }
    },
    { signal },
  );

  canvas.addEventListener(
    "pointermove",
    (ev) => {
      if (activePointerId === null || ev.pointerId !== activePointerId) return;
      if (obstacleGesture) {
        latestClientX = ev.clientX;
        latestClientY = ev.clientY;
      } else {
        target.applyPointerImpulse?.(ev.clientX, ev.clientY, 1);
      }
    },
    { signal },
  );

  const end = (ev: PointerEvent, commitObstacleGesture: boolean): void => {
    if (activePointerId === null || ev.pointerId !== activePointerId) return;
    if (obstacleGesture && commitObstacleGesture) {
      latestClientX = ev.clientX;
      latestClientY = ev.clientY;
      const dragDistance = Math.hypot(
        latestClientX - startClientX,
        latestClientY - startClientY,
      );
      if (dragDistance >= OBSTACLE_DRAG_THRESHOLD) {
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
    obstacleGesture = false;
  };

  canvas.addEventListener("pointerup", (ev) => end(ev, true), { signal });
  canvas.addEventListener("pointercancel", (ev) => end(ev, false), { signal });

  return () => abort.abort();
}
