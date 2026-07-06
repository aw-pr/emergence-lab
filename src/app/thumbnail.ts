import { CanvasRendererBackend } from "./canvasRenderer.ts";
import { defaultColourOptionsFor } from "./colormap.ts";
import { defaultParamsFromSchema } from "./controls.ts";
import { loadKernel } from "./loader.ts";
import { getRenderMode } from "./renderModes.ts";
import type { RendererBackend } from "./rendererBackend.ts";
import { createWebGLRendererBackend } from "./webglRenderer.ts";

/**
 * Renders a deterministic still preview of a sim's kernel onto a canvas, using
 * the SAME renderer backends and kernel-stepping path the live sim view uses
 * (no reimplementation of kernel logic). Intended for lazily-populated gallery
 * card thumbnails: a fixed seed and a fixed step count make the still
 * reproducible across loads.
 *
 * The canvas passed in owns its own backing-store size (set canvas.width /
 * canvas.height before calling); this function does not touch layout.
 */
export async function paintKernelThumbnail(
  slug: string,
  canvas: HTMLCanvasElement,
  options: { steps?: number } = {},
): Promise<void> {
  const steps = options.steps ?? 48;
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) return;

  const kernel = await loadKernel(slug);
  let backend: RendererBackend | null = null;

  try {
    backend = createWebGLRendererBackend(canvas) ?? new CanvasRendererBackend(canvas);
    backend.resizeDisplay(width, height);
    backend.setGrid(width, height, kernel);

    const renderMode = getRenderMode(slug);
    const params = { ...defaultParamsFromSchema(kernel.paramSchema), seed: 1 };
    kernel.init(width, height, params);

    const dt = 1 / 30;
    if (renderMode === "particle") {
      kernel.step(dt * steps);
    } else {
      for (let i = 0; i < steps; i += 1) {
        kernel.step(dt);
      }
    }

    const colourOptions = defaultColourOptionsFor(slug, kernel.channelCount);
    const displayOptions = { dotSize: slug === "boids" ? 2 : 1, trailFade: 0 };

    backend.draw({
      state: kernel.readState(),
      kernel,
      colourOptions,
      displayOptions,
      mode: renderMode,
      params,
      elapsedTime: 0,
      speedScale: 1,
    });
  } finally {
    backend?.destroy();
    kernel.destroy();
  }
}
