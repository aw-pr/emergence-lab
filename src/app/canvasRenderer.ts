import {
  buildMapper,
  type ColourMapOptions,
  type RgbMapper,
} from "./colormap.ts";
import {
  containRect,
  type DisplayOptions,
  type RenderMode,
  type RendererBackend,
  type RendererBackendFrame,
} from "./rendererBackend.ts";
import type { SimKernel } from "./types.ts";

export class CanvasRendererBackend implements RendererBackend {
  readonly kind = "canvas2d" as const;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly buffer: HTMLCanvasElement;
  private readonly bufferCtx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private mapper: RgbMapper;
  private channelCount = 0;
  private channelRanges: readonly (readonly [number, number])[] = [];
  private colourOptions: ColourMapOptions | null = null;
  private gridWidth = 1;
  private gridHeight = 1;
  private displayWidth = 1;
  private displayHeight = 1;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Canvas 2D context is not available in this browser.");
    }
    this.ctx = ctx;

    // Offscreen buffer holds the grid-resolution image; the display canvas
    // shows it letterboxed into a centred, aspect-preserving rectangle.
    this.buffer = document.createElement("canvas");
    this.buffer.width = 1;
    this.buffer.height = 1;
    const bufferCtx = this.buffer.getContext("2d", { alpha: false });
    if (!bufferCtx) {
      throw new Error("Canvas 2D context is not available in this browser.");
    }
    this.bufferCtx = bufferCtx;

    this.imageData = bufferCtx.createImageData(1, 1);
    this.mapper = buildMapper(0, [], undefined);
  }

  resizeDisplay(displayWidth: number, displayHeight: number): void {
    this.displayWidth = Math.max(1, Math.floor(displayWidth));
    this.displayHeight = Math.max(1, Math.floor(displayHeight));
  }

  setGrid(gridWidth: number, gridHeight: number, kernel: SimKernel): void {
    this.gridWidth = Math.max(1, Math.floor(gridWidth));
    this.gridHeight = Math.max(1, Math.floor(gridHeight));
    this.buffer.width = this.gridWidth;
    this.buffer.height = this.gridHeight;
    this.imageData = this.bufferCtx.createImageData(this.gridWidth, this.gridHeight);
    this.rebuildMapper(kernel, this.colourOptions);
  }

  draw(frame: RendererBackendFrame): void {
    this.rebuildMapper(frame.kernel, frame.colourOptions);

    const { state, kernel, displayOptions, mode } = frame;
    const channelCount = kernel.channelCount;
    const expectedLength = this.gridWidth * this.gridHeight * channelCount;
    if (state.length !== expectedLength) return;

    if (isBoidsState(kernel)) {
      this.drawBoidsToBuffer(frame);
    } else {
      this.paintFieldToBuffer(state, channelCount, displayOptions);
    }

    this.present(mode);
  }

  destroy(): void {}

  /** Letterbox the grid-resolution buffer onto the display canvas. */
  private present(mode: RenderMode): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
    ctx.imageSmoothingEnabled = isSmoothMode(mode);

    const rect = containRect(
      this.displayWidth,
      this.displayHeight,
      this.gridWidth,
      this.gridHeight,
    );
    ctx.drawImage(
      this.buffer,
      0,
      0,
      this.gridWidth,
      this.gridHeight,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    );
  }

  private paintFieldToBuffer(
    state: Float32Array,
    channelCount: number,
    displayOptions: DisplayOptions,
  ): void {
    const pixels = this.imageData.data;
    let pixelOffset = 0;
    for (let cell = 0; cell < this.gridWidth * this.gridHeight; cell += 1) {
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

    this.bufferCtx.putImageData(this.imageData, 0, 0);
  }

  private drawBoidsToBuffer(frame: RendererBackendFrame): void {
    const { state, kernel, displayOptions, params } = frame;
    const ctx = this.bufferCtx;
    const pointSize =
      typeof params.pointSize === "number" && Number.isFinite(params.pointSize)
        ? params.pointSize
        : displayOptions.dotSize;
    const size = Math.max(4, Math.min(16, pointSize));
    const radius = size * 0.5; // smaller dot; soft halo fades to zero by the rim
    const cellCount = this.gridWidth * this.gridHeight;
    const [meanX, meanY] = boidsMeanDirection(
      state,
      kernel.channelCount,
      cellCount,
    );

    // Trail persistence: a translucent background fill fades the previous
    // frame instead of erasing it, the cheap canvas2d equivalent of the WebGL
    // accumulate-and-fade pass.
    const trailFade = Math.min(0.985, Math.max(0, displayOptions.trailFade || 0));
    ctx.fillStyle =
      trailFade > 0
        ? `rgba(5, 8, 18, ${(1 - trailFade).toFixed(3)})`
        : "#050812";
    ctx.fillRect(0, 0, this.gridWidth, this.gridHeight);

    for (let y = 0; y < this.gridHeight; y += 1) {
      for (let x = 0; x < this.gridWidth; x += 1) {
        const offset = (y * this.gridWidth + x) * kernel.channelCount;
        const density = state[offset];
        if (density <= 0.02) {
          continue;
        }

        const vx = state[offset + 2];
        const vy = state[offset + 3];
        const magnitude = Math.hypot(vx, vy);
        const alignment =
          magnitude <= 0.0001 ? 0 : (vx * meanX + vy * meanY) / magnitude;
        const t = (1 - alignment) / 2; // 0 = aligned with flock, 1 = opposed
        const grey = Math.round((1 - t) * 235); // bright (aligned) .. dark

        const px = x + 0.5;
        const py = y + 0.5;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
        grad.addColorStop(0, `rgba(${grey}, ${grey}, ${grey}, 0.92)`);
        grad.addColorStop(0.35, `rgba(${grey}, ${grey}, ${grey}, 0.6)`);
        grad.addColorStop(1, `rgba(${grey}, ${grey}, ${grey}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

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

    for (let y = 0; y < this.gridHeight; y += 1) {
      for (let x = 0; x < this.gridWidth; x += 1) {
        const cell = y * this.gridWidth + x;
        const channelOffset = cell * channelCount;
        if (this.signalAt(state, channelOffset, channelCount) <= 0.02) {
          continue;
        }

        const [r, g, b] = this.mapper(state, channelOffset);
        const minY = Math.max(0, y - radius);
        const maxY = Math.min(this.gridHeight - 1, y + radius);
        const minX = Math.max(0, x - radius);
        const maxX = Math.min(this.gridWidth - 1, x + radius);

        for (let py = minY; py <= maxY; py += 1) {
          for (let px = minX; px <= maxX; px += 1) {
            const pixelOffset = (py * this.gridWidth + px) * 4;
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

function isSmoothMode(mode: RenderMode): boolean {
  return (
    mode === "field" ||
    mode === "smooth" ||
    mode === "fractal" ||
    mode === "particle"
  );
}

function isBoidsState(kernel: SimKernel): boolean {
  return (
    kernel.name === "Boids" &&
    kernel.channelCount >= 4 &&
    kernel.channelLabels[2] === "Velocity X" &&
    kernel.channelLabels[3] === "Velocity Y"
  );
}

function boidsMeanDirection(
  state: Float32Array,
  channelCount: number,
  cellCount: number,
): [number, number] {
  let sumX = 0;
  let sumY = 0;
  for (let cell = 0; cell < cellCount; cell += 1) {
    const offset = cell * channelCount;
    const density = state[offset];
    if (density <= 0.02) continue;
    sumX += state[offset + 2] * density;
    sumY += state[offset + 3] * density;
  }
  const magnitude = Math.hypot(sumX, sumY);
  if (magnitude <= 1e-6) return [0, 0];
  return [sumX / magnitude, sumY / magnitude];
}
