# docs/INTERFACE.md — Kernel to Renderer Interface Contract

**Owner: Claude**
**Status: FINAL — v1.0 (2026-05-15)**

This file defines the TypeScript interface that all simulation kernels must
implement and that the renderer consumes. It is the only shared surface
between kernels and the renderer. Code agents (currently Codex) implement and
consume the interface but do not modify it; Claude does. Any change is a new
version and must be committed before any dependent code work begins.

---

## SimKernel interface

```typescript
/**
 * A single tunable parameter, used by the renderer to auto-generate controls.
 * No per-sim hardcoding in the renderer: it builds the controls panel from
 * the kernel's paramSchema alone.
 */
export interface ParamDescriptor {
  key: string;            // matches a key in SimParams
  label: string;          // human-readable, for the control label
  type: "number" | "boolean" | "enum";
  default: number | boolean | string;
  min?: number;           // required when type === "number"
  max?: number;           // required when type === "number"
  step?: number;          // slider granularity when type === "number"
  options?: readonly string[]; // required when type === "enum"
}

/**
 * Parameters passed to a kernel on initialisation. Keys must correspond to
 * ParamDescriptor.key entries in the kernel's paramSchema.
 */
export type SimParams = Record<string, number | boolean | string>;

/**
 * The contract every simulation kernel must satisfy.
 *
 * Lifecycle:
 *   1. new KernelClass()          — construct; no side effects
 *   2. kernel.init(w, h, params)  — allocate buffers, set initial state
 *   3. kernel.step(dt)            — advance simulation by dt seconds
 *   4. kernel.readState()         — read current state for rendering
 *   5. kernel.destroy()           — release any resources
 */
export interface SimKernel {
  /**
   * Initialise or re-initialise the simulation.
   * Must be idempotent — calling again resets to initial conditions.
   *
   * @param width   Canvas width in pixels (grid columns)
   * @param height  Canvas height in pixels (grid rows)
   * @param params  Simulation-specific parameter set. Missing keys take the
   *                 default from paramSchema.
   */
  init(width: number, height: number, params: SimParams): void;

  /**
   * Advance the simulation. SYNCHRONOUS by contract.
   *
   * Workers, WASM and GPU compute are an internal kernel detail. A kernel that
   * computes asynchronously must double-buffer internally and have step()
   * advance to the latest available state without blocking the caller. step()
   * never returns a promise. This keeps the render loop and the Codex/Cursor
   * boundary simple; the cost of async is borne inside the kernels that need
   * it, not imposed on every simple sim.
   *
   * @param dt  Elapsed time in seconds since the last step. Kernels that use a
   *            fixed internal timestep may ignore the value but must accept it.
   */
  step(dt: number): void;

  /**
   * Return the current state as a flat Float32Array.
   *
   * Float32Array is the single canonical state representation: it preserves
   * field precision. Kernels never produce ImageData or Uint8 buffers. Mapping
   * floats to pixels (colour maps, normalisation) is the renderer's job, using
   * channelRanges to normalise.
   *
   * Layout: one float per cell per channel, row-major, channel-interleaved.
   * Length must equal width * height * channelCount.
   *
   * The renderer calls this after every step(); the kernel must return a
   * stable pre-allocated reference and must not allocate per call.
   */
  readState(): Float32Array;

  /**
   * Number of float channels per cell (e.g. 1 scalar field, 2 for
   * reaction-diffusion U+V, 4 for RGBA).
   */
  readonly channelCount: number;

  /**
   * Expected [min, max] value range for each channel, so the renderer can
   * normalise to a colour map without inspecting the data. Length must equal
   * channelCount. Use the analytic range where known (e.g. [0, 1]).
   */
  readonly channelRanges: readonly (readonly [number, number])[];

  /**
   * Human-readable name of this simulation, e.g. "Gray-Scott".
   */
  readonly name: string;

  /**
   * Descriptive label for each channel, for the renderer's legend.
   * Length must equal channelCount.
   */
  readonly channelLabels: readonly string[];

  /**
   * The tunable parameters this kernel exposes. The renderer builds its
   * controls panel from this alone. Order is the display order.
   */
  readonly paramSchema: readonly ParamDescriptor[];

  /**
   * Release any resources held by the kernel (Workers, WASM memory, etc.).
   * The renderer calls this before discarding a kernel instance.
   */
  destroy(): void;
}
```

---

## Resolved design decisions (v1.0)

1. **`step()` is synchronous.** Workers/WASM/GPU are internal kernel details;
   async kernels double-buffer and expose the latest state non-blocking. A sync
   contract keeps the render loop and the model boundary clean and avoids
   forcing async ceremony on every simple sim.
2. **Parameters are self-describing via `paramSchema`.** The renderer
   auto-generates controls from `ParamDescriptor[]`; no per-sim UI code. This
   resolves the Cursor controls-panel placeholder generically.
3. **`Float32Array` is the only state type.** It preserves field precision.
   Display conversion (colour maps, normalisation via `channelRanges`) is the
   renderer's responsibility. Kernels never emit ImageData.

---

## Notes for kernel authors

- Implement `SimKernel` exactly. Do not add methods the renderer cannot see.
- `readState()` returns a stable pre-allocated reference; never allocate per call.
- Deterministic: same `params` + same `step(dt)` sequence => identical `readState()`.
- Provide `paramSchema` and `channelRanges`; the renderer depends on both.
- Export a `selfTest(): boolean` alongside the class (not on the interface).
- Do not import from `src/app/**`. The kernel has no knowledge of the renderer.

## Notes for renderer authors

- Import `SimKernel`, `SimParams`, `ParamDescriptor` from this file (or a `.d.ts`).
- Build the controls panel from `paramSchema` only; no per-sim branching.
- Normalise with `channelRanges`; treat `readState()` as read-only.
- Call `init()` before the first `step()` and after any resize or param change.
- Call `destroy()` when swapping kernels or unmounting.
- Do not import from `src/sims/**` directly. Kernels load dynamically.

## Changing this contract

Bump the version, record the change under "Resolved design decisions", and
commit. Update `HANDOFF.md` if the change affects the active work plan, then
re-prompt code agents.
