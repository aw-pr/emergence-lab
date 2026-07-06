import { CanvasRendererBackend } from "./canvasRenderer.ts";
import { defaultColourOptionsFor } from "./colormap.ts";
import { defaultParamsFromSchema } from "./controls.ts";
import { loadKernel } from "./loader.ts";
import { getRenderMode } from "./renderModes.ts";
import type { RendererBackend } from "./rendererBackend.ts";
import type { SimParams } from "./types.ts";
import { createWebGLRendererBackend } from "./webglRenderer.ts";

/**
 * Renders deterministic still previews of sim kernels for the gallery cards.
 *
 * A WebGL2 context is a scarce resource: browsers cap the number of live
 * contexts (~16) and silently drop the oldest once that ceiling is hit, which
 * showed up as gallery thumbnails randomly failing to paint on load/refresh.
 * To stay at exactly one context for the whole gallery, every thumbnail is
 * rendered into a single shared offscreen backend, one at a time, and the
 * result is blitted into each card's own 2D canvas. The stills use the SAME
 * renderer backends and kernel-stepping path the live sim view uses (no
 * reimplementation of kernel logic); a fixed seed and step count keep them
 * reproducible across loads.
 */

/** Per-slug param tweaks that only make sense at the small preview grid, given
 * its cell count. The thumbnail canvas is a fraction of the live grid, so
 * agent-count defaults tuned for the full sim would oversaturate it. Returns a
 * partial param override merged under any caller-supplied params. */
function thumbnailParamOverrides(slug: string, cells: number): SimParams {
  if (slug === "physarum") {
    // Match the live trail density (~0.09 agents/cell) at whatever preview size.
    return { agentCount: Math.max(1000, Math.round(cells * 0.09)) };
  }
  return {};
}

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedBackend: RendererBackend | null = null;
let sharedWidth = 0;
let sharedHeight = 0;

/** Serialises paints so only one kernel/backend is ever live at a time. */
let queue: Promise<unknown> = Promise.resolve();

function acquireBackend(width: number, height: number): RendererBackend {
  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
  }
  if (
    !sharedBackend ||
    sharedWidth !== width ||
    sharedHeight !== height
  ) {
    // Size the backing store before (re)creating the context; the backend reads
    // it on construction.
    sharedCanvas.width = width;
    sharedCanvas.height = height;
    sharedBackend?.destroy();
    sharedBackend =
      createWebGLRendererBackend(sharedCanvas) ??
      new CanvasRendererBackend(sharedCanvas);
    sharedWidth = width;
    sharedHeight = height;
  }
  sharedBackend.resizeDisplay(width, height);
  return sharedBackend;
}

export async function paintKernelThumbnail(
  slug: string,
  canvas: HTMLCanvasElement,
  options: { steps?: number; params?: SimParams } = {},
): Promise<void> {
  // Chain onto the queue's settled state (ignoring any prior failure) so paints
  // never overlap, then expose this paint's own result to the caller.
  const run = queue
    .catch(() => {})
    .then(() => renderThumbnail(slug, canvas, options));
  queue = run.catch(() => {});
  return run;
}

async function renderThumbnail(
  slug: string,
  destination: HTMLCanvasElement,
  options: { steps?: number; params?: SimParams },
): Promise<void> {
  const steps = options.steps ?? 48;
  const width = destination.width;
  const height = destination.height;
  if (width <= 0 || height <= 0) return;

  const kernel = await loadKernel(slug);

  try {
    const backend = acquireBackend(width, height);
    backend.setGrid(width, height, kernel);

    const renderMode = getRenderMode(slug);
    const params = {
      ...defaultParamsFromSchema(kernel.paramSchema),
      ...thumbnailParamOverrides(slug, width * height),
      ...(options.params ?? {}),
      seed: 1,
    };
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
    const displayOptions = {
      dotSize: slug === "boids" ? 2 : 1,
      trailFade: 0,
      bloom: 0,
    };

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

    const ctx = destination.getContext("2d");
    if (!ctx) {
      throw new Error("thumbnail destination canvas has no 2D context");
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(sharedCanvas!, 0, 0, width, height);
  } finally {
    kernel.destroy();
  }
}
