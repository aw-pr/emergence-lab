/**
 * Test adapter for the packed orbit-cloud layout (card 103). Everything here
 * drives production code through the sim page: the resolution preset and the
 * persisted params a user would set, the canvas dataset the renderer
 * publishes, and the canvas pixels it draws. The sampler override is the
 * production `?orbit3dSampler=cpu` diagnostic.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { decodePng, type DecodedImage } from "./frame.ts";
import { SLUG, type SimParams } from "./insideOut.ts";

export const PACKED_ARTIFACT_DIR = "e2e/artifacts/packed-cells";
export const CURRENT_ORIGIN = "http://localhost:5173";
export const BASELINE_ORIGIN = process.env.PACKED_CELLS_BASELINE_URL ?? "http://localhost:5174";

export type ResolutionPreset = "performance" | "balanced" | "high" | "ultra" | "extreme";
export const PRESET_TARGETS: Record<ResolutionPreset, number> = {
  performance: 384 * 384,
  balanced: 640 * 640,
  high: 960 * 960,
  ultra: 1280 * 1280,
  extreme: 1920 * 1920,
};

export interface OpenOptions {
  params: SimParams;
  preset?: ResolutionPreset;
  /** Force the CPU sampling path through the production URL override. */
  cpu?: boolean;
  origin?: string;
  /** Extra URL query, e.g. a diagnostic flag; joined with `?`/`&`. */
  query?: string;
  timeoutMs?: number;
}

/**
 * Open the logistic-Mandelbrot sim with the given persisted params and
 * resolution preset, and wait for a complete 3D build. Returns the canvas
 * and the wall-clock from navigation to `data-orbit3d-build="complete"`.
 */
export async function openPacked(
  page: Page,
  options: OpenOptions,
): Promise<{ canvas: Locator; buildMs: number }> {
  const { params, preset, cpu = false, origin = CURRENT_ORIGIN, timeoutMs = 300_000 } = options;
  await page.addInitScript(
    ([slug, values, resolution]) => {
      localStorage.setItem(`el:values:${slug}`, JSON.stringify(values));
      if (resolution) localStorage.setItem(`el:resolution:${slug}`, resolution);
      else localStorage.removeItem(`el:resolution:${slug}`);
    },
    [SLUG, params, preset ?? ""] as const,
  );
  const queries = [cpu ? "orbit3dSampler=cpu" : "", options.query ?? ""].filter(Boolean);
  const query = queries.length > 0 ? `?${queries.join("&")}` : "";
  // A fresh document every time: navigating to an identical URL (same hash)
  // would not reload, and the persisted params only apply at load.
  await page.goto("about:blank");
  const started = Date.now();
  await page.goto(`${origin}/${query}#/${SLUG}`, { timeout: 30_000 });
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-orbit3d", { timeout: 30_000 });
  await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: timeoutMs });
  const buildMs = Date.now() - started;
  return { canvas, buildMs };
}

export interface CloudStats {
  sampler: string;
  layout: string;
  points: number;
  pointBudget: number;
  candidateCells: number;
  boundedCandidates: number;
  baseCells: number;
  baseRows: number;
  slots: number;
  refinedSubCells: number;
  refinedRows: number;
  visiblePoints: number;
  buildBytes: number;
  samplerBytes: number;
  boundaryDetail: string;
  geometry: string;
  bandPoints: number;
  hybridCloudPoints: number;
  cameraDistance: number;
  cameraAzimuth: number;
}

export async function cloudStats(canvas: Locator): Promise<CloudStats> {
  const d = await canvas.evaluate((element) => ({ ...(element as HTMLCanvasElement).dataset }) as Record<string, string>);
  const n = (key: string): number => (key in d ? Number(d[key]) : NaN);
  return {
    sampler: d.orbit3dSampler ?? "",
    layout: d.orbit3dLayout ?? "",
    points: n("orbit3dPoints"),
    pointBudget: n("orbit3dPointBudget"),
    candidateCells: n("orbit3dCandidateCells"),
    boundedCandidates: n("orbit3dBoundedCandidates"),
    baseCells: n("orbit3dBaseCells"),
    baseRows: n("orbit3dBaseRows"),
    slots: n("orbit3dSlots"),
    refinedSubCells: n("orbit3dRefinedSubCells"),
    refinedRows: n("orbit3dRefinedRows"),
    visiblePoints: n("orbit3dVisiblePoints"),
    buildBytes: n("orbit3dBuildBytes"),
    samplerBytes: n("orbit3dSamplerBytes"),
    boundaryDetail: d.orbit3dBoundaryDetail ?? "",
    geometry: d.orbit3dGeometry ?? "",
    bandPoints: n("orbit3dBandPoints"),
    hybridCloudPoints: n("orbit3dHybridCloudPoints"),
    cameraDistance: n("orbit3dCameraDistance"),
    cameraAzimuth: n("orbit3dCameraAzimuth"),
  };
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 8-bit luma of a pixel. */
function luma(rgba: Uint8Array, index: number): number {
  return 0.2126 * rgba[index] + 0.7152 * rgba[index + 1] + 0.0722 * rgba[index + 2];
}

/** Share of the rectangle's pixels whose luma exceeds `threshold` (8-bit). */
export function litFraction(image: DecodedImage, rect: PixelRect, threshold = 20): number {
  let lit = 0;
  let total = 0;
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(image.width, Math.round(rect.x + rect.width));
  const y1 = Math.min(image.height, Math.round(rect.y + rect.height));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      total += 1;
      if (luma(image.rgba, (y * image.width + x) * 4) > threshold) lit += 1;
    }
  }
  return total === 0 ? 0 : lit / total;
}

/** Mean 8-bit luma over the whole frame. */
export function meanLuma(image: DecodedImage): number {
  let sum = 0;
  const pixels = image.width * image.height;
  for (let index = 0; index < pixels; index += 1) sum += luma(image.rgba, index * 4);
  return pixels === 0 ? 0 : sum / pixels;
}

export async function screenshot(canvas: Locator, path?: string): Promise<DecodedImage> {
  return decodePng(await canvas.screenshot(path ? { path } : {}));
}

/**
 * Dolly the camera toward a viewport point with pointer-centred wheel steps,
 * the way a user zooms, and wait for the camera to come to rest. The world
 * point under the pointer stays put, so a rectangle around the pointer keeps
 * framing the same sheet patch at every zoom.
 */
export async function dollyAt(
  page: Page,
  canvas: Locator,
  x: number,
  y: number,
  steps: number,
): Promise<{ distance: number; azimuth: number }> {
  await canvas.evaluate(
    (element, { x, y, steps }) => {
      const rect = element.getBoundingClientRect();
      for (let step = 0; step < steps; step += 1) {
        element.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + x,
            clientY: rect.top + y,
            deltaY: -100,
          }),
        );
      }
    },
    { x, y, steps },
  );
  await page.waitForTimeout(300);
  await waitForCameraRest(canvas);
  await page.waitForTimeout(400);
  const stats = await cloudStats(canvas);
  return { distance: stats.cameraDistance, azimuth: stats.cameraAzimuth };
}

/** Wait until the camera azimuth and distance stop changing. */
export async function waitForCameraRest(canvas: Locator): Promise<void> {
  let previous = "";
  await expect
    .poll(
      async () => {
        const stats = await cloudStats(canvas);
        const pose = `${stats.cameraAzimuth}|${stats.cameraDistance}`;
        const settled = pose === previous;
        previous = pose;
        return settled;
      },
      { timeout: 20_000, intervals: [400] },
    )
    .toBe(true);
}

/**
 * Orbit the camera to its top-down elevation clamp with a pointer drag, the
 * way a user tilts the view. Looking straight down, every point of a cell
 * shares one screen position whatever its height, so a patch of the plane
 * reads the sample lattice and nothing behind it.
 */
export async function topDown(page: Page, canvas: Locator): Promise<void> {
  const box = (await canvas.boundingBox())!;
  const x = box.x + 150;
  const y = box.y + 120;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + Math.min(box.height - 130, 460), { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await waitForCameraRest(canvas);
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Header of an ELPC v1 bake: cell and sample counts. */
export function elpcHeader(bytes: Buffer): { cellCount: number; sampleCount: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { cellCount: view.getUint32(8, true), sampleCount: view.getUint32(12, true) };
}

export interface MainThreadLoad {
  /** Wall-clock of the window, ms. */
  elapsedMs: number;
  /** Main-thread time spent in tasks over the window, ms (DevTools TaskDuration). */
  taskMs: number;
  /** Main-thread CPU time over the window, ms (DevTools ThreadTime). */
  threadMs: number;
  scriptMs: number;
  layoutMs: number;
  styleMs: number;
  /** taskMs over elapsedMs: the share of the window the main thread was busy. */
  utilisation: number;
}

/**
 * Run `work` and report what the page's renderer main thread did meanwhile,
 * from the DevTools Performance domain (cumulative task, script, layout and
 * style durations, differenced across the window). A frame interval far
 * above both the GPU time and the main-thread task time per frame is spent
 * waiting on the compositor's frame pacing, not on rendering.
 */
export async function mainThreadLoad<T>(page: Page, work: () => Promise<T>): Promise<{ result: T; load: MainThreadLoad }> {
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const snapshot = async (): Promise<Record<string, number>> => {
    const { metrics } = await session.send("Performance.getMetrics");
    return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
  };
  const before = await snapshot();
  const result = await work();
  const after = await snapshot();
  await session.detach();
  const delta = (name: string): number => ((after[name] ?? NaN) - (before[name] ?? NaN)) * 1000;
  const elapsedMs = delta("Timestamp");
  const taskMs = delta("TaskDuration");
  return {
    result,
    load: {
      elapsedMs,
      taskMs,
      threadMs: delta("ThreadTime"),
      scriptMs: delta("ScriptDuration"),
      layoutMs: delta("LayoutDuration"),
      styleMs: delta("RecalcStyleDuration"),
      utilisation: elapsedMs > 0 ? taskMs / elapsedMs : NaN,
    },
  };
}
