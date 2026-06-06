/**
 * Page-side sweep driver.
 *
 * `driveKernel` is serialised by Playwright and executed inside the browser
 * page, where the Vite dev server can resolve the app's module graph. It imports
 * the real kernel registry, constructs a fresh kernel, injects a parameter set,
 * steps it deterministically, and returns two frames of the primary channel
 * (normalised to [0, 1]). No rendering happens — this is pure kernel numerics, so
 * the result depends only on (params, grid size, step count).
 *
 * The registry URL is passed in rather than written as a literal import so the
 * TypeScript test process treats the dynamic import as opaque (the module lives
 * in the browser, not in Node).
 */

export interface SweepDriverConfig {
  registryUrl: string;
  slug: string;
  params: Record<string, number | boolean | string>;
  gridWidth: number;
  gridHeight: number;
  /** kernel.step() calls before frame A is captured. */
  warmupSteps: number;
  /** kernel.step() calls between frame A and frame B (for temporal flux). */
  fluxGap: number;
  /** Channel index used as the scalar field for scoring. */
  primaryChannel: number;
  /** dt passed to step(); fixed for reproducibility. */
  dt: number;
}

export interface SweepDriverResult {
  width: number;
  height: number;
  frameA: number[];
  frameB: number[];
}

export async function driveKernel(
  cfg: SweepDriverConfig,
): Promise<SweepDriverResult> {
  const specifier = cfg.registryUrl;
  const reg: any = await import(/* @vite-ignore */ specifier);
  const entry = reg.REGISTRY.find((e: any) => e.slug === cfg.slug);
  if (!entry) throw new Error(`unknown slug: ${cfg.slug}`);

  const kernel: any = await entry.load();
  const w = cfg.gridWidth;
  const h = cfg.gridHeight;
  kernel.init(w, h, cfg.params);

  const cc = kernel.channelCount as number;
  const range = kernel.channelRanges[cfg.primaryChannel] ?? [0, 1];
  const lo = range[0];
  const span = range[1] - range[0] || 1;

  const extract = (): number[] => {
    const state: ArrayLike<number> = kernel.readState();
    const out = new Array<number>(w * h);
    for (let cell = 0; cell < w * h; cell += 1) {
      let v = (state[cell * cc + cfg.primaryChannel] - lo) / span;
      if (v < 0) v = 0;
      else if (v > 1) v = 1;
      out[cell] = v;
    }
    return out;
  };

  for (let i = 0; i < cfg.warmupSteps; i += 1) kernel.step(cfg.dt);
  const frameA = extract();
  for (let i = 0; i < cfg.fluxGap; i += 1) kernel.step(cfg.dt);
  const frameB = extract();

  kernel.destroy();
  return { width: w, height: h, frameA, frameB };
}
