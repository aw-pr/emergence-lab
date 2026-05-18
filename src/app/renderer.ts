import type { SimKernel, SimParams } from "./types.ts";
import {
  buildMapper,
  DEFAULT_COLOUR_OPTIONS,
  type ColourMapOptions,
} from "./colormap.ts";

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  kernel: SimKernel;
  /** Number of kernel.step() calls per animation frame. Defaults to 1. */
  stepsPerFrame?: number;
  /** Current sim parameters (used on init and reset). */
  params: SimParams;
  colourOptions?: ColourMapOptions;
  displayOptions?: DisplayOptions;
}

export interface DisplayOptions {
  dotSize: number;
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
  private readonly ctx: CanvasRenderingContext2D;
  private kernel: SimKernel;
  private params: SimParams;

  private imageData: ImageData;
  private gridWidth = 0;
  private gridHeight = 0;
  private colourOptions: ColourMapOptions;
  private displayOptions: DisplayOptions;
  private mapper = buildMapper(0, [], DEFAULT_COLOUR_OPTIONS);

  private running = false;
  private rafHandle = 0;
  private lastTimestamp = 0;
  private stepsPerFrame: number;

  private fpsSamples: number[] = [];
  private onFpsChange: ((fps: number) => void) | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame = 0;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.kernel = options.kernel;
    this.params = { ...options.params };
    this.stepsPerFrame = Math.max(1, Math.floor(options.stepsPerFrame ?? 1));
    this.colourOptions = options.colourOptions ?? DEFAULT_COLOUR_OPTIONS;
    this.displayOptions = options.displayOptions ?? { dotSize: 1 };

    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Canvas 2D context is not available in this browser.");
    }
    this.ctx = ctx;
    this.imageData = ctx.createImageData(1, 1);

    this.observeResize();
    this.reinitFromCanvasSize();
  }

  /** Set or clear an FPS observer. Called once per ~500ms with a smoothed value. */
  setFpsListener(listener: ((fps: number) => void) | null): void {
    this.onFpsChange = listener;
  }

  setStepsPerFrame(value: number): void {
    this.stepsPerFrame = Math.max(1, Math.floor(value));
  }

  setColourOptions(options: ColourMapOptions): void {
    this.colourOptions = { ...options };
    this.mapper = buildMapper(
      this.kernel.channelCount,
      this.kernel.channelRanges,
      this.colourOptions,
    );
    this.draw();
  }

  setDisplayOptions(options: DisplayOptions): void {
    this.displayOptions = {
      dotSize: Math.max(1, Math.min(16, Math.floor(options.dotSize))),
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
    this.kernel.destroy();
  }

  private tick = (timestamp: number): void => {
    if (!this.running) return;

    const dt = Math.max(0, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;

    for (let i = 0; i < this.stepsPerFrame; i += 1) {
      this.kernel.step(dt);
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

    const pixels = this.imageData.data;
    const mapper = this.mapper;
    let pixelOffset = 0;

    for (let cell = 0; cell < width * height; cell += 1) {
      const channelOffset = cell * channelCount;
      const [r, g, b] = mapper(state, channelOffset);
      pixels[pixelOffset] = r;
      pixels[pixelOffset + 1] = g;
      pixels[pixelOffset + 2] = b;
      pixels[pixelOffset + 3] = 255;
      pixelOffset += 4;
    }

    if (this.displayOptions.dotSize > 1) {
      this.expandActiveCells(state, channelCount, width, height);
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }

  private expandActiveCells(
    state: Float32Array,
    channelCount: number,
    width: number,
    height: number,
  ): void {
    const pixels = this.imageData.data;
    const radius = Math.floor(this.displayOptions.dotSize / 2);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cell = y * width + x;
        const channelOffset = cell * channelCount;
        if (this.signalAt(state, channelOffset, channelCount) <= 0.02) {
          continue;
        }

        const [r, g, b] = this.mapper(state, channelOffset);
        const minY = Math.max(0, y - radius);
        const maxY = Math.min(height - 1, y + radius);
        const minX = Math.max(0, x - radius);
        const maxX = Math.min(width - 1, x + radius);

        for (let py = minY; py <= maxY; py += 1) {
          for (let px = minX; px <= maxX; px += 1) {
            const pixelOffset = (py * width + px) * 4;
            pixels[pixelOffset] = r;
            pixels[pixelOffset + 1] = g;
            pixels[pixelOffset + 2] = b;
            pixels[pixelOffset + 3] = 255;
          }
        }
      }
    }
  }

  private signalAt(
    state: Float32Array,
    offset: number,
    channelCount: number,
  ): number {
    let signal = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const [min, max] = this.kernel.channelRanges[channel] ?? [0, 1];
      const value = max === min ? 0 : (state[offset + channel] - min) / (max - min);
      if (Number.isFinite(value)) {
        signal = Math.max(signal, Math.min(1, Math.max(0, value)));
      }
    }
    return signal;
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
    const MAX_RENDER_DIM = 1024;
    const MAX_PIXELS = 786_432;
    const FALLBACK_CSS_PX = 512;
    const MIN_GRID = 64;

    const rectWidth = Math.max(1, Math.floor(rect.width) || FALLBACK_CSS_PX);
    const rectHeight = Math.max(1, Math.floor(rect.height) || FALLBACK_CSS_PX);

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
    this.gridWidth = width;
    this.gridHeight = height;

    this.imageData = this.ctx.createImageData(width, height);
    this.mapper = buildMapper(
      this.kernel.channelCount,
      this.kernel.channelRanges,
      this.colourOptions,
    );

    this.kernel.init(width, height, this.params);
    this.draw();
  }
}
