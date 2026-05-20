import type { ColourMapOptions } from "./colormap.ts";
import type { SimKernel, SimParams } from "./types.ts";

export interface DisplayOptions {
  dotSize: number;
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
  resize(width: number, height: number, kernel: SimKernel): void;
  draw(frame: RendererBackendFrame): void;
  destroy(): void;
}
