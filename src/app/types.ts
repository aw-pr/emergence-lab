/**
 * Local mirror of the kernel/renderer contract defined in docs/INTERFACE.md (v1.0).
 *
 * The contract itself is owned by Claude; this file only restates the types the
 * renderer needs to consume kernels. Do not edit the shape without first
 * updating docs/INTERFACE.md and bumping its version.
 */

export interface ParamDescriptor {
  key: string;
  label: string;
  type: "number" | "boolean" | "enum";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
}

export type SimParams = Record<string, number | boolean | string>;

export interface SimKernel {
  init(width: number, height: number, params: SimParams): void;
  step(dt: number): void;
  readState(): Float32Array;
  readonly channelCount: number;
  readonly channelRanges: readonly (readonly [number, number])[];
  readonly name: string;
  readonly channelLabels: readonly string[];
  readonly paramSchema: readonly ParamDescriptor[];
  destroy(): void;
}

export type SimKernelConstructor = new () => SimKernel;
