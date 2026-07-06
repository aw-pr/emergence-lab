/** The slice of the renderer the pointer-impulse handler needs. */
export interface PointerImpulseTarget {
  supportsImpulse(): boolean;
  applyPointerImpulse(clientX: number, clientY: number, strength?: number): boolean;
}

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

  canvas.addEventListener(
    "pointerdown",
    (ev) => {
      if (ev.button !== 0) return;
      activePointerId = ev.pointerId;
      canvas.setPointerCapture(ev.pointerId);
      target.applyPointerImpulse(ev.clientX, ev.clientY, 1);
    },
    { signal },
  );

  canvas.addEventListener(
    "pointermove",
    (ev) => {
      if (activePointerId === null || ev.pointerId !== activePointerId) return;
      target.applyPointerImpulse(ev.clientX, ev.clientY, 1);
    },
    { signal },
  );

  const end = (ev: PointerEvent): void => {
    if (activePointerId === null || ev.pointerId !== activePointerId) return;
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    activePointerId = null;
  };

  canvas.addEventListener("pointerup", end, { signal });
  canvas.addEventListener("pointercancel", end, { signal });

  return () => abort.abort();
}
