/**
 * Local mirror of the kernel/renderer contract defined in docs/INTERFACE.md (v1.2.0).
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
  /**
   * Optional pointer-interaction hook (v1.1.0). Perturbs the simulation under
   * the pointer; x/y are grid cells, radius is in cells, strength is [0, 1].
   * Kernels without it are simply not interactive. See docs/INTERFACE.md.
   */
  applyImpulse?(x: number, y: number, radius: number, strength: number): void;
  /**
   * Optional completion signal (v1.2.0). Returns true once a run has reached a
   * terminal state further step() calls will not change. The renderer polls it
   * to auto-cycle into a fresh run when the user enables auto-cycle. Kernels
   * without it never complete and run indefinitely. See docs/INTERFACE.md.
   */
  isComplete?(): boolean;
}

export type SimKernelConstructor = new () => SimKernel;
