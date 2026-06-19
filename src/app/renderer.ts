import { CanvasRendererBackend } from "./canvasRenderer.ts";
import { DEFAULT_COLOUR_OPTIONS, type ColourMapOptions } from "./colormap.ts";
import {
  type DisplayOptions,
  type RenderMode,
  type RendererBackend,
} from "./rendererBackend.ts";
import { createWebGLRendererBackend } from "./webglRenderer.ts";
import type { SimKernel, SimParams } from "./types.ts";

/**
 * Quality presets for the simulation's compute grid. They set a target cell
 * count, NOT a pixel size — the grid is independent of the display, so the
 * per-frame cost is the same on any screen. The actual grid dimensions are
 * derived from the target and the viewport aspect ratio.
 */
export type ResolutionPreset = "performance" | "balanced" | "high" | "ultra";

export const RESOLUTION_TARGETS: Readonly<Record<ResolutionPreset, number>> = {
  performance: 384 * 384,
  balanced: 640 * 640,
  high: 960 * 960,
  ultra: 1280 * 1280,
};

export const DEFAULT_RESOLUTION: ResolutionPreset = "balanced";

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  kernel: SimKernel;
  /** Number of kernel.step() calls per animation frame. Defaults to 1. */
  stepsPerFrame?: number;
  /** Current sim parameters (used on init and reset). */
  params: SimParams;
  colourOptions?: ColourMapOptions;
  displayOptions?: DisplayOptions;
  renderMode?: RenderMode;
  /** Compute-grid quality preset. Defaults to "balanced". */
  resolution?: ResolutionPreset;
}

export type { DisplayOptions } from "./rendererBackend.ts";

/** A non-zero 32-bit seed handed to kernel.init for run-to-run variety. */
function nextSeed(): number {
  return ((Math.random() * 0x100000000) >>> 0) || 1;
}

/**
 * Owns the canvas, the animation loop, and the float → pixel mapping.
 *
 * The renderer talks to the kernel only through the SimKernel interface:
 *   - init(width, height, params)
 *   - step(dt)
 *   - readState()
 *   - destroy()
 *
 * No simulation logic lives here.
 */
export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly backend: RendererBackend;
  private kernel: SimKernel;
  private params: SimParams;

  private gridWidth = 0;
  private gridHeight = 0;
  private displayWidth = 0;
  private displayHeight = 0;
  private resolution: ResolutionPreset;
  private colourOptions: ColourMapOptions;
  private displayOptions: DisplayOptions;
  private renderMode: RenderMode;

  private running = false;
  private rafHandle = 0;
  private lastTimestamp = 0;
  private elapsedTime = 0;
  private stepsPerFrame: number;
  private stepAccumulator = 0;
  /** Fresh per load/reset; passed to kernel.init so sims that read `seed` vary
   * between runs while param tweaks (which keep it) preserve the layout. */
  private seed = 1;

  private fpsSamples: number[] = [];
  private onFpsChange: ((fps: number) => void) | null = null;
  private iterationCount = 0;
  private onIterationChange: ((iterations: number) => void) | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame = 0;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.kernel = options.kernel;
    this.params = { ...options.params };
    this.stepsPerFrame = Math.max(0, options.stepsPerFrame ?? 1);
    this.colourOptions = options.colourOptions ?? DEFAULT_COLOUR_OPTIONS;
    this.displayOptions = options.displayOptions ?? { dotSize: 1 };
    this.renderMode = options.renderMode ?? "grid";
    this.resolution = options.resolution ?? DEFAULT_RESOLUTION;

    this.backend =
      createWebGLRendererBackend(this.canvas) ?? new CanvasRendererBackend(this.canvas);
    this.canvas.dataset.renderer = this.backend.kind;
    console.info(
      `emergence-lab renderer: ${this.backend.kind}`,
      this.backend.maxTextureSize
        ? `(max texture ${this.backend.maxTextureSize}px)`
        : "",
    );

    this.seed = nextSeed();
    this.observeResize();
    this.resizeDisplay();
    this.reinitGrid();
  }

  /** Set or clear an FPS observer. Called once per ~500ms with a smoothed value. */
  setFpsListener(listener: ((fps: number) => void) | null): void {
    this.onFpsChange = listener;
  }

  /** Set or clear an iteration observer. Called after init and after each frame that steps. */
  setIterationListener(listener: ((iterations: number) => void) | null): void {
    this.onIterationChange = listener;
    listener?.(this.iterationCount);
  }

  setStepsPerFrame(value: number): void {
    this.stepsPerFrame = Math.max(0, value);
  }

  setColourOptions(options: ColourMapOptions): void {
    this.colourOptions = { ...options };
    this.draw();
  }

  setDisplayOptions(options: DisplayOptions): void {
    this.displayOptions = {
      dotSize: Math.max(1, Math.min(6, Math.floor(options.dotSize))),
    };
    this.draw();
  }

  isRunning(): boolean {
    return this.running;
  }

  play(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = performance.now();
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  pause(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
  }

  /** Re-initialise the kernel at the current grid size with the given params. */
  reset(nextParams?: SimParams): void {
    if (nextParams) {
      this.params = { ...nextParams };
    }
    this.seed = nextSeed();
    this.reinitGrid();
  }

  /** Update params in-place and re-init (the kernel only consumes params on init). */
  updateParams(nextParams: SimParams): void {
    this.params = { ...nextParams };
    this.reinitGrid();
  }

  /**
   * Change the compute-grid quality preset. Re-seeds the simulation, since the
   * grid is reallocated. No effect for sims whose grid follows the display
   * (e.g. fractals), where detail is per-pixel.
   */
  setResolution(preset: ResolutionPreset): void {
    if (this.resolution === preset) return;
    this.resolution = preset;
    this.reinitGrid();
  }

  destroy(): void {
    this.pause();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.backend.destroy();
    this.kernel.destroy();
  }

  private tick = (timestamp: number): void => {
    if (!this.running) return;

    const dt = Math.max(0, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    this.elapsedTime += dt;

    this.stepAccumulator += this.stepsPerFrame;
    const stepCount = Math.floor(this.stepAccumulator);
    this.stepAccumulator -= stepCount;

    if (this.renderMode === "particle") {
      // Continuous-time sims (boids) integrate dt and stay stable at large
      // time-steps, so advance ONCE with a dt scaled by the speed setting
      // rather than repeating the costly neighbour pass N times per frame.
      // Same visual speed, far cheaper per paint — which keeps the frame rate
      // smooth. The kernel clamps the time-step, so a long frame can't blow up.
      if (this.stepsPerFrame > 0 && dt > 0) {
        this.kernel.step(dt * this.stepsPerFrame);
      }
    } else {
      for (let i = 0; i < stepCount; i += 1) {
        this.kernel.step(dt);
      }
    }
    if (stepCount > 0) {
      this.iterationCount += stepCount;
      this.onIterationChange?.(this.iterationCount);
    }
    this.draw();
    this.recordFps(dt);

    this.rafHandle = requestAnimationFrame(this.tick);
  };

  private draw(): void {
    const state = this.kernel.readState();
    const channelCount = this.kernel.channelCount;
    const width = this.gridWidth;
    const height = this.gridHeight;
    if (width === 0 || height === 0) return;

    const expectedLength = width * height * channelCount;
    if (state.length !== expectedLength) {
      // Kernel size and renderer size are out of sync. Skip frame; resize handler
      // will re-init shortly.
      return;
    }

    this.backend.draw({
      state,
      kernel: this.kernel,
      colourOptions: this.colourOptions,
      displayOptions: this.displayOptions,
      mode: this.renderMode,
      params: this.params,
      elapsedTime: this.elapsedTime,
      speedScale: this.stepsPerFrame,
    });
  }

  private recordFps(dt: number): void {
    if (dt <= 0) return;
    this.fpsSamples.push(1 / dt);
    if (this.fpsSamples.length > 30) {
      this.fpsSamples.shift();
    }
    if (this.onFpsChange && this.fpsSamples.length >= 10) {
      const mean =
        this.fpsSamples.reduce((acc, v) => acc + v, 0) / this.fpsSamples.length;
      this.onFpsChange(mean);
    }
  }

  private observeResize(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => this.handleResize());
    });
    this.resizeObserver.observe(this.canvas);
  }

  /**
   * A pure viewport resize. Updates only the display backing store and lets the
   * backend letterbox the existing grid into it — the simulation state and grid
   * are preserved (no reset). Fractal-style sims, whose grid follows the
   * display for per-pixel detail, recompute at the new size instead.
   */
  private handleResize(): void {
    this.resizeDisplay();
    if (this.usesFixedGrid()) {
      this.draw();
    } else {
      this.reinitGrid();
    }
  }

  /** Whether the compute grid is fixed (decoupled from display) for this mode. */
  private usesFixedGrid(): boolean {
    return this.renderMode !== "fractal";
  }

  /** Resize the on-screen backing store. Cheap; never reseeds the simulation. */
  private resizeDisplay(): void {
    const { width, height } = this.computeDisplaySize();
    this.displayWidth = width;
    this.displayHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.dataset.displaySize = `${width}x${height}`;
    this.backend.resizeDisplay(width, height);
  }

  /** (Re)allocate the compute grid and re-seed the kernel. Resets iterations. */
  private reinitGrid(): void {
    const { width, height } = this.computeGridSize();
    if (width === 0 || height === 0) return;

    this.gridWidth = width;
    this.gridHeight = height;
    this.canvas.dataset.renderSize = `${width}x${height}`;

    this.backend.setGrid(width, height, this.kernel);
    this.kernel.init(width, height, { ...this.params, seed: this.seed });
    this.iterationCount = 0;
    this.onIterationChange?.(this.iterationCount);
    this.draw();
  }

  private computeDisplaySize(): { width: number; height: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.resolutionScale();
    const MAX_RENDER_DIM = this.maxRenderDim();
    const MAX_PIXELS = this.maxRenderPixels();
    const FALLBACK_CSS_PX = 512;

    let w = Math.max(1, Math.floor((rect.width || FALLBACK_CSS_PX) * dpr));
    let h = Math.max(1, Math.floor((rect.height || FALLBACK_CSS_PX) * dpr));

    const scale = Math.min(
      1,
      MAX_RENDER_DIM / Math.max(w, h),
      Math.sqrt(MAX_PIXELS / (w * h)),
    );
    w = Math.max(1, Math.floor(w * scale));
    h = Math.max(1, Math.floor(h * scale));
    return { width: w, height: h };
  }

  private computeGridSize(): { width: number; height: number } {
    // Fractal-style sims compute per-pixel detail, so the grid follows the
    // display for crispness. Resolution presets don't apply to them.
    if (!this.usesFixedGrid()) {
      return { width: this.displayWidth, height: this.displayHeight };
    }

    // The preset is a COST CEILING, not a fixed size. The grid fits the current
    // window (~1 cell per CSS px → crisp) but never exceeds the preset's cell
    // budget, so a big window caps out (bounded blur + bounded step cost) while
    // small/medium windows render close to 1:1. Evaluated only on load / preset
    // / reset / param change — a plain resize keeps the grid (no reseed).
    const MIN_GRID = 64;
    const rect = this.canvas.getBoundingClientRect();
    const cssW = rect.width || 512;
    const cssH = rect.height || 512;
    const cap = RESOLUTION_TARGETS[this.resolution];

    let w = Math.max(1, cssW);
    let h = Math.max(1, cssH);

    const overCap = Math.sqrt(cap / (w * h));
    if (overCap < 1) {
      w *= overCap;
      h *= overCap;
    }

    const maxDim = this.gridMaxDim();
    const down = Math.min(1, maxDim / Math.max(w, h));
    w *= down;
    h *= down;

    const up = Math.max(1, MIN_GRID / w, MIN_GRID / h);
    w *= up;
    h *= up;

    return {
      width: Math.max(MIN_GRID, Math.round(w)),
      height: Math.max(MIN_GRID, Math.round(h)),
    };
  }

  private gridMaxDim(): number {
    const gpuLimit = this.backend.maxTextureSize ?? 4096;
    return Math.max(256, Math.min(gpuLimit, 4096));
  }

  private resolutionScale(): number {
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    if (this.backend.kind !== "webgl2") {
      return Math.min(1, Math.max(1, dpr));
    }
    if (this.renderMode === "grid" || this.renderMode === "particle") {
      return Math.min(2, Math.max(1, dpr));
    }
    return Math.min(3, Math.max(1, dpr));
  }

  private maxRenderDim(): number {
    if (this.backend.kind === "webgl2") {
      const gpuLimit = this.backend.maxTextureSize ?? 4096;
      const target =
        this.renderMode === "grid" || this.renderMode === "particle" ? 2048 : 4096;
      return Math.max(1024, Math.min(gpuLimit, target));
    }
    return 1024;
  }

  private maxRenderPixels(): number {
    if (this.backend.kind === "webgl2") {
      return this.renderMode === "grid" || this.renderMode === "particle"
        ? 3_145_728
        : 8_388_608;
    }
    return 786_432;
  }
}
