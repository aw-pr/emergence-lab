import {
  buildMapper,
  type ColourMapOptions,
  type RgbMapper,
} from "./colormap.ts";
import type {
  DisplayOptions,
  RendererBackend,
  RendererBackendFrame,
} from "./rendererBackend.ts";
import type { SimKernel } from "./types.ts";

export class CanvasRendererBackend implements RendererBackend {
  readonly kind = "canvas2d" as const;

  private readonly ctx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private mapper: RgbMapper;
  private channelCount = 0;
  private channelRanges: readonly (readonly [number, number])[] = [];
  private colourOptions: ColourMapOptions | null = null;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Canvas 2D context is not available in this browser.");
    }
    this.ctx = ctx;
    this.imageData = ctx.createImageData(1, 1);
    this.mapper = buildMapper(0, [], undefined);
  }

  resize(width: number, height: number, kernel: SimKernel): void {
    this.width = width;
    this.height = height;
    this.imageData = this.ctx.createImageData(width, height);
    this.rebuildMapper(kernel, this.colourOptions);
  }

  draw(frame: RendererBackendFrame): void {
    this.rebuildMapper(frame.kernel, frame.colourOptions);

    const { state, kernel, displayOptions } = frame;
    const channelCount = kernel.channelCount;
    const expectedLength = this.width * this.height * channelCount;
    if (state.length !== expectedLength) return;

    const pixels = this.imageData.data;
    let pixelOffset = 0;
    for (let cell = 0; cell < this.width * this.height; cell += 1) {
      const channelOffset = cell * channelCount;
      const [r, g, b] = this.mapper(state, channelOffset);
      pixels[pixelOffset] = r;
      pixels[pixelOffset + 1] = g;
      pixels[pixelOffset + 2] = b;
      pixels[pixelOffset + 3] = 255;
      pixelOffset += 4;
    }

    if (displayOptions.dotSize > 1) {
      this.expandActiveCells(state, channelCount, displayOptions);
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }

  destroy(): void {}

  private rebuildMapper(
    kernel: SimKernel,
    colourOptions: ColourMapOptions | null,
  ): void {
    if (
      this.channelCount === kernel.channelCount &&
      this.channelRanges === kernel.channelRanges &&
      this.colourOptions === colourOptions
    ) {
      return;
    }

    this.channelCount = kernel.channelCount;
    this.channelRanges = kernel.channelRanges;
    this.colourOptions = colourOptions;
    this.mapper = buildMapper(
      kernel.channelCount,
      kernel.channelRanges,
      colourOptions ?? undefined,
    );
  }

  private expandActiveCells(
    state: Float32Array,
    channelCount: number,
    displayOptions: DisplayOptions,
  ): void {
    const pixels = this.imageData.data;
    const radius = Math.floor(displayOptions.dotSize / 2);

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const cell = y * this.width + x;
        const channelOffset = cell * channelCount;
        if (this.signalAt(state, channelOffset, channelCount) <= 0.02) {
          continue;
        }

        const [r, g, b] = this.mapper(state, channelOffset);
        const minY = Math.max(0, y - radius);
        const maxY = Math.min(this.height - 1, y + radius);
        const minX = Math.max(0, x - radius);
        const maxX = Math.min(this.width - 1, x + radius);

        for (let py = minY; py <= maxY; py += 1) {
          for (let px = minX; px <= maxX; px += 1) {
            const pixelOffset = (py * this.width + px) * 4;
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
      const [min, max] = this.channelRanges[channel] ?? [0, 1];
      const value = max === min ? 0 : (state[offset + channel] - min) / (max - min);
      if (Number.isFinite(value)) {
        signal = Math.max(signal, Math.min(1, Math.max(0, value)));
      }
    }
    return signal;
  }
}
