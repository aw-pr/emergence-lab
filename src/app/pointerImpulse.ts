/** The slice of the renderer the pointer-impulse handler needs. */
export interface PointerImpulseTarget {
  applyPointerImpulse?(clientX: number, clientY: number, strength?: number): boolean;
  editsObstacles?(): boolean;
  beginCustomTrail?(): void;
  placeCustomTrailPoint?(clientX: number, clientY: number): boolean;
  placeCustomRock?(clientX: number, clientY: number): boolean;
  removeCustomObstacleAt?(clientX: number, clientY: number): boolean;
}

const OBSTACLE_DRAG_THRESHOLD = 4;

/**
 * Click / drag on a non-fractal sim canvas either edits obstacles or perturbs
 * the simulation through its optional impulse path. Left button only; the
 * primary pointer is captured for the duration of the drag. Fractal sims own
 * their own pointer gestures and never use this. Returns a detach function.
 *
 * Obstacle gestures: a tap removes the dropped obstacle under the pointer or
 * drops a boulder; holding and dragging lays a live line of boulders that
 * follows the pointer, spaced by the target's trail spacing.
 */
export function attachPointerImpulse(
  canvas: HTMLCanvasElement,
  target: PointerImpulseTarget,
): () => void {
  const abort = new AbortController();
  const { signal } = abort;
  let activePointerId: number | null = null;
  let obstacleGesture = false;
  let trailActive = false;
  let startClientX = 0;
  let startClientY = 0;

  canvas.addEventListener(
    "pointerdown",
    (ev) => {
      if (ev.button !== 0) return;
      activePointerId = ev.pointerId;
      obstacleGesture = target.editsObstacles?.() === true;
      trailActive = false;
      startClientX = ev.clientX;
      startClientY = ev.clientY;
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
      if (!obstacleGesture) {
        target.applyPointerImpulse?.(ev.clientX, ev.clientY, 1);
        return;
      }
      if (!trailActive) {
        const dragDistance = Math.hypot(
          ev.clientX - startClientX,
          ev.clientY - startClientY,
        );
        if (dragDistance < OBSTACLE_DRAG_THRESHOLD) return;
        trailActive = true;
        target.beginCustomTrail?.();
        target.placeCustomTrailPoint?.(startClientX, startClientY);
      }
      target.placeCustomTrailPoint?.(ev.clientX, ev.clientY);
    },
    { signal },
  );

  const end = (ev: PointerEvent, commitObstacleGesture: boolean): void => {
    if (activePointerId === null || ev.pointerId !== activePointerId) return;
    if (obstacleGesture && commitObstacleGesture) {
      if (trailActive) {
        target.placeCustomTrailPoint?.(ev.clientX, ev.clientY);
      } else if (!target.removeCustomObstacleAt?.(ev.clientX, ev.clientY)) {
        target.placeCustomRock?.(ev.clientX, ev.clientY);
      }
    }
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    activePointerId = null;
    obstacleGesture = false;
    trailActive = false;
  };

  canvas.addEventListener("pointerup", (ev) => end(ev, true), { signal });
  canvas.addEventListener("pointercancel", (ev) => end(ev, false), { signal });

  return () => abort.abort();
}
