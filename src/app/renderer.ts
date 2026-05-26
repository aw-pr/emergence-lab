import { CanvasRendererBackend } from "./canvasRenderer.ts";
import { DEFAULT_COLOUR_OPTIONS, type ColourMapOptions } from "./colormap.ts";
import {
  type DisplayOptions,
  type RenderMode,
  type RendererBackend,
} from "./rendererBackend.ts";
import { createWebGLRendererBackend } from "./webglRenderer.ts";
import type { SimKernel, SimParams } from "./types.ts";

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
}

export type { DisplayOptions } from "./rendererBackend.ts";

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
  private colourOptions: ColourMapOptions;
  private displayOptions: DisplayOptions;
  private renderMode: RenderMode;

  private running = false;
  private rafHandle = 0;
  private lastTimestamp = 0;
  private elapsedTime = 0;
  private stepsPerFrame: number;
  private stepAccumulator = 0;

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

    this.backend =
      createWebGLRendererBackend(this.canvas) ?? new CanvasRendererBackend(this.canvas);
    this.canvas.dataset.renderer = this.backend.kind;
    console.info(
      `emergence-lab renderer: ${this.backend.kind}`,
      this.backend.maxTextureSize
        ? `(max texture ${this.backend.maxTextureSize}px)`
        : "",
    );

    this.observeResize();
    this.reinitFromCanvasSize();
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

  /** Re-initialise the kernel at the current canvas size with the given params. */
  reset(nextParams?: SimParams): void {
    if (nextParams) {
      this.params = { ...nextParams };
    }
    this.reinitFromCanvasSize();
  }

  /** Update params in-place and re-init (the kernel only consumes params on init). */
  updateParams(nextParams: SimParams): void {
    this.params = { ...nextParams };
    this.reinitFromCanvasSize();
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

    for (let i = 0; i < stepCount; i += 1) {
      this.kernel.step(dt);
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
      this.resizeFrame = requestAnimationFrame(() => this.reinitFromCanvasSize());
    });
    this.resizeObserver.observe(this.canvas);
  }

  private reinitFromCanvasSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.resolutionScale();
    const MAX_RENDER_DIM = this.maxRenderDim();
    const MAX_PIXELS = this.maxRenderPixels();
    const FALLBACK_CSS_PX = 512;
    const MIN_GRID = 64;

    const rectWidth = Math.max(
      1,
      Math.floor((rect.width || FALLBACK_CSS_PX) * dpr),
    );
    const rectHeight = Math.max(
      1,
      Math.floor((rect.height || FALLBACK_CSS_PX) * dpr),
    );

    // Preserve CSS aspect ratio: scale width and height by the same factor so the
    // backing bitmap is not stretched into a different aspect on the stage.
    const scaleForMaxDim = MAX_RENDER_DIM / Math.max(rectWidth, rectHeight);
    const scaleForPixels = Math.sqrt(MAX_PIXELS / (rectWidth * rectHeight));
    let s = Math.min(1, scaleForMaxDim, scaleForPixels);

    let w = s * rectWidth;
    let h = s * rectHeight;

    const scaleUp = Math.max(1, MIN_GRID / w, MIN_GRID / h);
    w *= scaleUp;
    h *= scaleUp;

    const scaleDown = Math.min(
      1,
      MAX_RENDER_DIM / Math.max(w, h),
      Math.sqrt(MAX_PIXELS / (w * h)),
    );
    w *= scaleDown;
    h *= scaleDown;

    const width = Math.max(MIN_GRID, Math.floor(w));
    const height = Math.max(MIN_GRID, Math.floor(h));

    if (width === 0 || height === 0) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.dataset.renderSize = `${width}x${height}`;
    this.gridWidth = width;
    this.gridHeight = height;

    this.backend.resize(width, height, this.kernel);

    this.kernel.init(width, height, this.params);
    this.iterationCount = 0;
    this.onIterationChange?.(this.iterationCount);
    this.draw();
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
