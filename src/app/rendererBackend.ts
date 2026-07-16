import type { ColourMapOptions } from "./colormap.ts";
import type { SimKernel, SimParams } from "./types.ts";

export interface DisplayOptions {
  dotSize: number;
  /**
   * Particle-mode trail persistence: fraction of the previous frame kept each
   * frame (accumulate + fade). 0 = off; ~0.90–0.96 leaves flowing ribbons.
   */
  trailFade: number;
  /**
   * Bloom post-pass intensity (WebGL only): threshold extract + blur +
   * additive composite. 0 = off; ~0.3 is a modest glow.
   */
  bloom: number;
}

export type RenderMode = "grid" | "field" | "smooth" | "fractal" | "particle";

export interface RendererBackendFrame {
  state: Float32Array;
  kernel: SimKernel;
  colourOptions: ColourMapOptions;
  displayOptions: DisplayOptions;
  mode: RenderMode;
  params: SimParams;
  elapsedTime: number;
  speedScale: number;
}

export interface RendererBackend {
  readonly kind: "webgl2" | "canvas2d";
  readonly maxTextureSize?: number;
  /** True when this backend can render the current model without a CPU field. */
  supportsDirectRendering?(
    mode: RenderMode,
    kernel: SimKernel,
    params: SimParams,
  ): boolean;
  /** Advance a GPU-resident simulation without stepping or reading back its CPU kernel. */
  advanceDirect?(steps: number, params: SimParams): boolean;
  /** Apply a grid-space brush directly to GPU-resident simulation state. */
  applyDirectImpulse?(
    x: number,
    y: number,
    radius: number,
    strength: number,
  ): boolean;
  /**
   * Resize the on-screen backing store (device pixels). Cheap: it does not
   * reallocate simulation buffers. The grid is letterboxed into this area.
   */
  resizeDisplay(displayWidth: number, displayHeight: number): void;
  /**
   * (Re)allocate buffers for a new compute grid size. The grid (the kernel's
   * resolution) is independent of the display size.
   */
  setGrid(
    gridWidth: number,
    gridHeight: number,
    kernel: SimKernel,
    mode?: RenderMode,
    params?: SimParams,
  ): void;
  draw(frame: RendererBackendFrame): void;
  destroy(): void;
}

export interface ContainRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The largest centred rectangle that matches the grid's aspect ratio and fits
 * inside the display. Used to letterbox a fixed-resolution grid onto a canvas
 * of any size without distortion.
 */
export function containRect(
  displayWidth: number,
  displayHeight: number,
  gridWidth: number,
  gridHeight: number,
): ContainRect {
  if (displayWidth <= 0 || displayHeight <= 0 || gridWidth <= 0 || gridHeight <= 0) {
    return {
      x: 0,
      y: 0,
      width: Math.max(0, displayWidth),
      height: Math.max(0, displayHeight),
    };
  }

  const scale = Math.min(displayWidth / gridWidth, displayHeight / gridHeight);
  const width = Math.max(1, Math.round(gridWidth * scale));
  const height = Math.max(1, Math.round(gridHeight * scale));
  const x = Math.floor((displayWidth - width) / 2);
  const y = Math.floor((displayHeight - height) / 2);
  return { x, y, width, height };
}
