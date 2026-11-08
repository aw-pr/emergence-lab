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
  /** Keep invalid/out-of-range samples observable for static diagnostics. */
  preserveRange?: boolean;
  /** Opt-in ECA clock: exact generated rows, including init's row. fluxGap
   * counts rows here. Extra batch rows are cropped, never counted as history. */
  generatedRows?: number;
  /** Opt-in separated field pairs on one trajectory, avoiding repeated warmup. */
  sampleSteps?: number[];
}

export interface SweepDriverResult {
  width: number;
  height: number;
  frameA: number[];
  frameB: number[];
  snapshots?: { steps: number; frameA: number[]; frameB: number[] }[];
}

export async function driveKernel(
  cfg: SweepDriverConfig,
): Promise<SweepDriverResult> {
  const specifier = cfg.registryUrl;
  const reg: any = await import(/* @vite-ignore */ specifier);
  const entry = reg.REGISTRY.find((e: any) => e.slug === cfg.slug);

  // A slug listed in registry.ts's SHELVED_SLUGS is filtered out of REGISTRY, so
  // it is unreachable through the normal path even though its kernel is intact
  // and worth scoring. Fall back to the fixed module convention
  // (src/sims/<slug>/kernel.ts), resolved relative to the registry URL, and pick
  // the constructor the same way registry.ts's pickKernelExport does.
  // Everything stays inline: Playwright serialises only this function into the
  // page, so a module-scope helper would be undefined there.
  let kernel: any;
  if (entry) {
    kernel = await entry.load();
  } else {
    const kernelUrl = new URL(`../sims/${cfg.slug}/kernel.ts`, specifier).href;
    const mod: any = await import(/* @vite-ignore */ kernelUrl);
    const ctor =
      mod.default ?? Object.values(mod).find((v) => typeof v === "function");
    if (typeof ctor !== "function") {
      throw new Error(`unknown slug: ${cfg.slug} (no kernel at ${kernelUrl})`);
    }
    kernel = new (ctor as new () => unknown)();
  }
  const w = cfg.gridWidth;
  const h = cfg.gridHeight;
  const rowRate = cfg.generatedRows === undefined ? 1 : Number(cfg.params.stepsPerFrame ?? 1);
  kernel.init(w, cfg.generatedRows === undefined ? h : h + rowRate - 1, cfg.params);

  const cc = kernel.channelCount as number;
  const range = kernel.channelRanges[cfg.primaryChannel] ?? [0, 1];
  const lo = range[0];
  const span = range[1] - range[0] || 1;

  const extract = (rowOffset = 0): number[] => {
    const state: ArrayLike<number> = kernel.readState();
    const out = new Array<number>(w * h);
    for (let cell = 0; cell < w * h; cell += 1) {
      let v = (state[(cell + rowOffset * w) * cc + cfg.primaryChannel] - lo) / span;
      if (!cfg.preserveRange) {
        if (v < 0) v = 0;
        else if (v > 1) v = 1;
      }
      out[cell] = v;
    }
    return out;
  };

  if (cfg.sampleSteps) {
    if (!cfg.sampleSteps.length || cfg.sampleSteps.some((t, i, ts) => !Number.isInteger(t) || t < 0 || (i > 0 && t <= ts[i - 1] + cfg.fluxGap))) {
      throw new Error("Snapshot steps must be increasing, nonnegative and separated by more than fluxGap");
    }
    const snapshots = [];
    let calls = 0;
    for (const steps of cfg.sampleSteps) {
      for (; calls < steps; calls += 1) kernel.step(cfg.dt);
      const frameA = extract();
      for (; calls < steps + cfg.fluxGap; calls += 1) kernel.step(cfg.dt);
      snapshots.push({ steps, frameA, frameB: extract() });
    }
    kernel.destroy();
    return { width: w, height: h, frameA: snapshots[0].frameA, frameB: snapshots[0].frameB, snapshots };
  }

  let frameA: number[], frameB: number[];
  if (cfg.generatedRows !== undefined) {
    if (cfg.generatedRows < h || !Number.isInteger(rowRate) || rowRate < 1) throw new Error("Invalid generated-row clock");
    let calls = Math.ceil((cfg.generatedRows - 1) / rowRate);
    for (let i = 0; i < calls; i += 1) kernel.step(cfg.dt);
    frameA = extract(1 + calls * rowRate - cfg.generatedRows);
    const nextCalls = Math.ceil((cfg.generatedRows + cfg.fluxGap - 1) / rowRate);
    for (; calls < nextCalls; calls += 1) kernel.step(cfg.dt);
    frameB = extract(1 + calls * rowRate - cfg.generatedRows - cfg.fluxGap);
  } else {
    for (let i = 0; i < cfg.warmupSteps; i += 1) kernel.step(cfg.dt);
    frameA = extract();
    for (let i = 0; i < cfg.fluxGap; i += 1) kernel.step(cfg.dt);
    frameB = extract();
  }

  kernel.destroy();
  return { width: w, height: h, frameA, frameB };
}

export interface DiagnosticDriverConfig {
  registryUrl: string;
  slug: string;
  params: Record<string, number | boolean | string>;
  gridWidth: number;
  gridHeight: number;
  fluxGap: number;
  primaryChannel: number;
  dt: number;
  /** Absolute step counts for fixed-time captures (strictly increasing). */
  sampleSteps?: number[];
  /** Occupied-cell milestones for growth kernels; steps until each is reached
   * or `stepCap` is spent. Mutually exclusive with sampleSteps. */
  milestones?: number[];
  stepCap?: number;
}

export interface DiagnosticSnapshot {
  steps: number;
  target: number | null;
  frameA: number[];
  frameB: number[];
  diagnostics: Record<string, number>;
}

/**
 * Opt-in diagnostics path (stage 146, method growth-criticality-v1). Same
 * fresh-kernel, same-step determinism as driveKernel, but one trajectory yields
 * several captures and kernel-internal state is read for the growth/avalanche/
 * domain diagnostics. Diagnostics describe a capture; they never feed score.
 */
export async function driveKernelDiagnostic(
  cfg: DiagnosticDriverConfig,
): Promise<{ width: number; height: number; snapshots: DiagnosticSnapshot[] }> {
  const reg: any = await import(/* @vite-ignore */ cfg.registryUrl);
  const entry = reg.REGISTRY.find((e: any) => e.slug === cfg.slug);
  let kernel: any;
  if (entry) {
    kernel = await entry.load();
  } else {
    const mod: any = await import(/* @vite-ignore */ new URL(`../sims/${cfg.slug}/kernel.ts`, cfg.registryUrl).href);
    kernel = new (mod.default ?? Object.values(mod).find((v) => typeof v === "function") as new () => unknown)();
  }
  const w = cfg.gridWidth, h = cfg.gridHeight, cc = kernel.channelCount as number;
  kernel.init(w, h, cfg.params);
  // Sandpile conservation baseline: the grains this row's own init deposited.
  let initialInventory = 0;
  if (cfg.slug === "abelian-sandpile") for (const g of kernel.grains as Float32Array) initialInventory += g;
  const range = kernel.channelRanges[cfg.primaryChannel] ?? [0, 1];
  const lo = range[0], span = range[1] - range[0] || 1;
  const raw = (): { field: number[]; nonFinite: number } => {
    const state: ArrayLike<number> = kernel.readState();
    const field = new Array<number>(w * h);
    let nonFinite = 0;
    for (let cell = 0; cell < w * h; cell += 1) {
      const sample = state[cell * cc + cfg.primaryChannel];
      if (!Number.isFinite(sample)) nonFinite += 1;
      const v = (sample - lo) / span;
      field[cell] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return { field, nonFinite };
  };
  const describe = (field: number[], nonFinite: number, steps: number, issued: number): Record<string, number> => {
    const n = w * h;
    let endpoint = 0, sum = 0;
    for (let i = 0; i < n; i += 1) { if (field[i] <= 0 || field[i] >= 1) endpoint += 1; sum += field[i]; }
    const d: Record<string, number> = { nonFiniteFraction: nonFinite / n, endpointFraction: endpoint / n, meanField: sum / n };
    if (cfg.slug === "abelian-sandpile") {
      const grains: Float32Array = kernel.grains;
      let total = 0, extent = 0, edge = 0, edgeCells = 0, active = 0;
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
        const g = grains[y * w + x];
        total += g;
        if (g > 0) extent = Math.max(extent, Math.hypot(x - Math.floor(w / 2), y - Math.floor(h / 2)));
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { edgeCells += 1; if (g > 0) edge += 1; }
        if (kernel.activity[y * w + x] > 0) active += 1;
      }
      const injected = initialInventory + Number(cfg.params.grainsPerStep ?? 0) * issued;
      d.pendingTopples = kernel.queueCount;
      d.relaxed = kernel.queueCount === 0 ? 1 : 0;
      d.lostGrainFraction = injected > 0 ? (injected - total) / injected : 0;
      d.edgeTouchFraction = edge / edgeCells;
      d.extentFraction = extent / (Math.min(w, h) / 2);
      d.activeFraction = active / n;
    } else if (cfg.slug === "diffusion-limited-aggregation") {
      d.clusterSize = kernel.clusterSize;
      d.radiusFraction = kernel.maxRadius / kernel.maxGridRadius();
      d.edgeStopped = kernel.isComplete() ? 1 : 0;
    } else if (cfg.slug === "ising-model") {
      let up = 0, walls = 0;
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
        const s = field[y * w + x] > 0.5 ? 1 : 0;
        up += s;
        walls += (s !== (field[y * w + (x + 1) % w] > 0.5 ? 1 : 0) ? 1 : 0) + (s !== (field[((y + 1) % h) * w + x] > 0.5 ? 1 : 0) ? 1 : 0);
      }
      d.absMagnetisation = Math.abs(2 * up / n - 1);
      d.domainWallDensity = walls / (2 * n);
    }
    d.steps = steps;
    return d;
  };
  let calls = 0;
  const snapshots: DiagnosticSnapshot[] = [];
  const capture = (target: number | null): void => {
    const a = raw();
    const issuedA = calls;
    const diagnostics = describe(a.field, a.nonFinite, calls, issuedA);
    for (let i = 0; i < cfg.fluxGap; i += 1) { kernel.step(cfg.dt); calls += 1; }
    snapshots.push({ steps: issuedA, target, frameA: a.field, frameB: raw().field, diagnostics });
  };
  if (cfg.milestones) {
    const cap = cfg.stepCap ?? 3000;
    for (const milestone of cfg.milestones) {
      while (calls < cap && kernel.clusterSize < milestone && !kernel.isComplete()) { kernel.step(cfg.dt); calls += 1; }
      capture(milestone);
      const last = snapshots[snapshots.length - 1];
      last.diagnostics.milestoneReached = last.diagnostics.clusterSize >= milestone ? 1 : 0;
    }
  } else {
    for (const steps of cfg.sampleSteps ?? []) {
      for (; calls < steps; calls += 1) kernel.step(cfg.dt);
      capture(steps);
    }
  }
  kernel.destroy();
  return { width: w, height: h, snapshots };
}
