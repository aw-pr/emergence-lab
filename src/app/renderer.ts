import { CanvasRendererBackend } from "./canvasRenderer.ts";
import { DEFAULT_COLOUR_OPTIONS, type ColourMapOptions } from "./colormap.ts";
import {
  containRect,
  type DisplayOptions,
  type Orbit3DMarkerSnapshot,
  type RenderMode,
  type RendererBackend,
} from "./rendererBackend.ts";
import { createWebGLRendererBackend } from "./webglRenderer.ts";
import type { SimKernel, SimParams } from "./types.ts";
import type { QualityProfile } from "./qualityProfiles.ts";

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
  /**
   * Auto-cycle: when the kernel reports isComplete(), hold the finished frame
   * briefly then re-seed into a fresh run. Ignored for kernels without
   * isComplete(). Defaults to false.
   */
  autoCycle?: boolean;
  qualityProfile?: QualityProfile;
}

/** Seconds a completed run stays on screen before auto-cycling to a new one. */
const CYCLE_HOLD_SECONDS = 1.5;
// Re(c)=+1 is minimum X under the reversed-X view and the XY plane's edge.
const ORBIT_SWEEP_START = 1;
const ORBIT_SWEEP_END = -2;
const ORBIT_SWEEP_HOLD_SECONDS = 0.9;
const ORBIT_AUTO_ROTATE_RADIANS_PER_SECOND = 0.05;
const ORBIT_AUTO_ROTATE_CATCHUP_RADIANS_PER_SECOND = 0.7;
const ORBIT_AUTO_ROTATE_RESUME_SECONDS = 4;

export type { DisplayOptions } from "./rendererBackend.ts";

export interface Orbit3DMarkerClientSnapshot {
  re: number;
  im: number;
  period: number;
  clientX: number;
  clientY: number;
}

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
  private readonly qualityProfile?: QualityProfile;

  private running = false;
  private rafHandle = 0;
  private lastTimestamp = 0;
  private elapsedTime = 0;
  private stepsPerFrame: number;
  private stepAccumulator = 0;
  /** Fresh per load/reset; passed to kernel.init so sims that read `seed` vary
   * between runs while param tweaks (which keep it) preserve the layout. */
  private seed = 1;
  private autoCycle = false;
  /** Seconds left holding a completed run before re-seeding; -1 when not holding. */
  private cycleHold = -1;

  private fpsSamples: number[] = [];
  private onFpsChange: ((fps: number) => void) | null = null;
  private iterationCount = 0;
  private onIterationChange: ((iterations: number) => void) | null = null;
  private onParamsChange: ((params: SimParams) => void) | null = null;
  private onOrbitMarkerChange:
    | ((marker: Orbit3DMarkerClientSnapshot) => void)
    | null = null;
  private cascadePosition = 1;
  private sweepRe = ORBIT_SWEEP_START;
  private sweepHold = 0;
  private orbitAutoRotateHold = 0;
  private readonly orbitAutoRotateEnabled: boolean;

  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame = 0;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.kernel = options.kernel;
    this.params = { ...options.params };
    this.stepsPerFrame = Math.max(0, options.stepsPerFrame ?? 1);
    this.colourOptions = options.colourOptions ?? DEFAULT_COLOUR_OPTIONS;
    this.displayOptions = options.displayOptions ?? {
      dotSize: 1,
      trailFade: 0,
      bloom: 0,
    };
    this.renderMode = options.renderMode ?? "grid";
    this.resolution = options.resolution ?? DEFAULT_RESOLUTION;
    this.autoCycle = options.autoCycle ?? false;
    this.qualityProfile = options.qualityProfile;
    this.orbitAutoRotateEnabled =
      this.renderMode === "orbit3d" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    this.prepareOrbit3dAnimations();
    this.observeResize();
    this.resizeDisplay();
    this.reinitGrid();
    this.resetOrbit3dSweepMarker();
    this.applyOrbit3dCameraPose();
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

  setParamsListener(listener: ((params: SimParams) => void) | null): void {
    this.onParamsChange = listener;
  }

  setOrbit3dMarkerListener(
    listener: ((marker: Orbit3DMarkerClientSnapshot) => void) | null,
  ): void {
    this.onOrbitMarkerChange = listener;
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
      trailFade: Math.max(0, Math.min(0.985, options.trailFade)),
      bloom: Math.max(0, Math.min(1, options.bloom)),
    };
    this.draw();
  }

  isRunning(): boolean {
    return this.running;
  }

  currentParams(): SimParams {
    return { ...this.params };
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
    this.prepareOrbit3dAnimations();
    this.reinitGrid();
    this.resetOrbit3dSweepMarker();
    this.applyOrbit3dCameraPose();
    this.notifyParamsChange();
  }

  /** Update params in-place and re-init (the kernel only consumes params on init). */
  updateParams(nextParams: SimParams): void {
    const previous = this.params;
    this.params = { ...nextParams };
    if (this.renderMode === "orbit3d") {
      const cascadeStarted =
        booleanParam(this.params, "cascadeReveal", false) &&
        !booleanParam(previous, "cascadeReveal", false);
      if (cascadeStarted) {
        this.cascadePosition = 1;
        this.params.plottedIterations = 1;
      } else if (!booleanParam(this.params, "cascadeReveal", false)) {
        this.cascadePosition = numericParam(this.params, "plottedIterations", 1);
      }

      const sweepStarted =
        booleanParam(this.params, "realAxisSweep", false) &&
        !booleanParam(previous, "realAxisSweep", false);
      if (sweepStarted) {
        this.sweepRe = ORBIT_SWEEP_START;
        this.sweepHold = 0;
        this.setOrbit3dMarker(this.sweepRe, 0);
      }

      // Toggling the real-slice curtain snaps the camera to the matching pose
      // (side-on for the bifurcation diagram, the default orbit otherwise);
      // free orbiting stays available after the snap.
      const realSliceOnly = booleanParam(this.params, "realSliceOnly", false);
      if (realSliceOnly !== booleanParam(previous, "realSliceOnly", false)) {
        this.backend.setOrbit3dCameraPose?.(realSliceOnly ? "side" : "default");
      }

      if (this.backend.updateOrbit3dParams?.(this.params)) {
        if (cascadeStarted) this.notifyParamsChange();
        this.draw();
        return;
      }
    }
    this.reinitGrid();
  }

  /** Reduced-cost fractal render used while a wheel or pinch gesture is active. */
  previewParams(nextParams: SimParams, scale = 0.35): void {
    this.params = { ...nextParams };
    if (this.renderMode !== "fractal") {
      this.reinitGrid();
      return;
    }
    this.reinitGrid(Math.max(0.2, Math.min(0.6, scale)), "preview");
  }

  /** Restore the full display-pixel fractal grid after interaction settles. */
  commitParams(nextParams: SimParams): void {
    this.params = { ...nextParams };
    this.reinitGrid(1, "full");
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

  /** Whether the current kernel reports run completion (SimKernel.isComplete). */
  supportsAutoCycle(): boolean {
    return typeof (this.kernel as { isComplete?: unknown }).isComplete === "function";
  }

  /** Enable/disable auto-cycling of completed runs. Clears any pending hold when disabled. */
  setAutoCycle(enabled: boolean): void {
    this.autoCycle = enabled;
    if (!enabled) {
      this.cycleHold = -1;
    }
  }

  /** Whether the current kernel accepts pointer impulses (SimKernel.applyImpulse). */
  supportsImpulse(): boolean {
    return typeof (this.kernel as { applyImpulse?: unknown }).applyImpulse === "function";
  }

  /**
   * Map a CSS-pixel pointer position to a grid cell and perturb the kernel under
   * it. Reuses the same containRect letterbox maths as the backends, so the
   * impulse lands under the visible cursor regardless of window size. Applied
   * immediately (pointer events never overlap a step() on the main thread); a
   * paused sim is redrawn so the perturbation shows at once. No-op when the
   * kernel has no applyImpulse or the pointer is outside the letterboxed image.
   */
  applyPointerImpulse(clientX: number, clientY: number, strength = 1): boolean {
    const cell = this.pointerToCell(clientX, clientY);
    if (!cell) return false;

    const radius = this.impulseRadiusCells();
    const s = Math.max(0, Math.min(1, strength));
    if (
      this.usesDirectRendering() &&
      this.backend.applyDirectImpulse?.(cell.x, cell.y, radius, s)
    ) {
      if (!this.running) this.draw();
      return true;
    }

    const apply = (this.kernel as {
      applyImpulse?: (x: number, y: number, radius: number, strength: number) => void;
    }).applyImpulse;
    if (typeof apply !== "function") return false;
    apply.call(this.kernel, cell.x, cell.y, radius, s);
    if (!this.running) this.draw();
    return true;
  }

  orbit3dMarker(): Orbit3DMarkerClientSnapshot | null {
    return this.markerSnapshotToClient(this.backend.orbit3dMarker?.() ?? null);
  }

  moveOrbit3dMarker(
    clientX: number,
    clientY: number,
  ): Orbit3DMarkerClientSnapshot | null {
    this.pauseOrbit3dAutoRotate();
    if (booleanParam(this.params, "realAxisSweep", false)) {
      this.params = { ...this.params, realAxisSweep: false };
      this.notifyParamsChange();
    }
    const viewport = this.pointerToViewport(clientX, clientY);
    if (!viewport) return null;
    const marker = this.backend.moveOrbit3dMarker?.(viewport.x, viewport.y) ?? null;
    if (marker) this.draw();
    return this.markerSnapshotToClient(marker);
  }

  orbitOrbit3d(deltaCssX: number, deltaCssY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pauseOrbit3dAutoRotate();
    this.backend.orbit3dOrbit?.(
      -deltaCssX / rect.width * Math.PI * 2,
      deltaCssY / rect.height * Math.PI,
    );
    this.draw();
  }

  dollyOrbit3d(factor: number): void {
    this.pauseOrbit3dAutoRotate();
    this.backend.orbit3dDolly?.(factor);
    this.draw();
  }

  resetOrbit3dCamera(): void {
    this.pauseOrbit3dAutoRotate();
    this.backend.resetOrbit3dCamera?.();
    this.draw();
  }

  /**
   * CSS pixel -> grid cell through the letterbox contain-rect. The WebGL backend
   * samples the state texture with row 0 at the bottom, so its vertical axis is
   * flipped relative to the canvas2d backend; mirror Y for it so the poke tracks
   * the visible cursor. Returns null when the pointer is off the drawn image.
   */
  private pointerToCell(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null {
    if (this.gridWidth <= 0 || this.gridHeight <= 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const deviceX = (clientX - rect.left) * (this.displayWidth / rect.width);
    const deviceY = (clientY - rect.top) * (this.displayHeight / rect.height);
    const contain = containRect(
      this.displayWidth,
      this.displayHeight,
      this.gridWidth,
      this.gridHeight,
    );
    const u = (deviceX - contain.x) / contain.width;
    const v = (deviceY - contain.y) / contain.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;

    const x = u * this.gridWidth;
    const yTop = v * this.gridHeight;
    const y = this.backend.kind === "webgl2" ? this.gridHeight - yTop : yTop;
    return { x, y };
  }

  private pointerToViewport(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  private markerSnapshotToClient(
    marker: Orbit3DMarkerSnapshot | null,
  ): Orbit3DMarkerClientSnapshot | null {
    if (!marker) return null;
    const rect = this.canvas.getBoundingClientRect();
    return {
      re: marker.re,
      im: marker.im,
      period: marker.period,
      clientX: rect.left + marker.viewportX * rect.width,
      clientY: rect.top + marker.viewportY * rect.height,
    };
  }

  /** Pointer brush radius: ~3% of the shorter grid axis, clamped to [4, 64] cells. */
  private impulseRadiusCells(): number {
    const shorter = Math.min(this.gridWidth, this.gridHeight);
    return Math.max(4, Math.min(64, Math.round(shorter * 0.03)));
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
    this.advanceOrbit3dAnimations(dt);

    this.stepAccumulator += this.stepsPerFrame;
    const stepCount = Math.floor(this.stepAccumulator);
    this.stepAccumulator -= stepCount;

    const directStepHandled =
      stepCount > 0 &&
      this.usesDirectRendering() &&
      (this.backend.advanceDirect?.(stepCount, this.params) ?? false);

    if (directStepHandled) {
      // State remains GPU-resident; draw() presents the backend's active texture.
    } else if (this.renderMode === "particle") {
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
    this.advanceAutoCycle(dt);
    this.draw();
    this.recordFps(dt);

    this.rafHandle = requestAnimationFrame(this.tick);
  };

  /**
   * Auto-cycle: when the kernel reports a finished run, hold it on screen for
   * CYCLE_HOLD_SECONDS so it can be seen, then re-seed into a fresh run. The
   * reset bumps the seed, so each cycle grows a different randomised pattern.
   */
  private advanceAutoCycle(dt: number): void {
    if (!this.autoCycle || !this.supportsAutoCycle()) return;

    if (this.cycleHold >= 0) {
      this.cycleHold -= dt;
      if (this.cycleHold <= 0) {
        this.cycleHold = -1;
        this.reset();
      }
      return;
    }

    if (this.kernel.isComplete?.()) {
      this.cycleHold = CYCLE_HOLD_SECONDS;
    }
  }

  private prepareOrbit3dAnimations(): void {
    if (this.renderMode !== "orbit3d") return;
    if (booleanParam(this.params, "cascadeReveal", false)) {
      this.cascadePosition = 1;
      this.params.plottedIterations = 1;
    } else {
      this.cascadePosition = numericParam(this.params, "plottedIterations", 1);
    }
    this.sweepRe = ORBIT_SWEEP_START;
    this.sweepHold = 0;
  }

  private applyOrbit3dCameraPose(): void {
    if (this.renderMode !== "orbit3d") return;
    this.backend.setOrbit3dCameraPose?.(
      booleanParam(this.params, "realSliceOnly", false) ? "side" : "default",
    );
  }

  private resetOrbit3dSweepMarker(): void {
    if (
      this.renderMode === "orbit3d" &&
      booleanParam(this.params, "realAxisSweep", false)
    ) {
      this.setOrbit3dMarker(ORBIT_SWEEP_START, 0);
    }
  }

  private advanceOrbit3dAnimations(dt: number): void {
    if (this.renderMode !== "orbit3d" || dt <= 0) return;
    let paramsChanged = false;

    if (
      booleanParam(this.params, "cascadeReveal", false) &&
      this.backend.orbit3dReady?.()
    ) {
      const sampleCount = Math.max(
        1,
        Math.min(96, Math.round(numericParam(this.params, "sampleCount", 1))),
      );
      const duration = Math.max(0.1, numericParam(this.params, "cascadeDuration", 12));
      this.cascadePosition = Math.min(
        sampleCount,
        this.cascadePosition + dt * Math.max(0, sampleCount - 1) / duration,
      );
      const plottedIterations = Math.max(1, Math.floor(this.cascadePosition));
      if (this.params.plottedIterations !== plottedIterations) {
        this.params = { ...this.params, plottedIterations };
        this.backend.updateOrbit3dParams?.(this.params);
        paramsChanged = true;
      }
      if (this.cascadePosition >= sampleCount) {
        this.params = { ...this.params, cascadeReveal: false };
        paramsChanged = true;
      }
    }

    if (
      booleanParam(this.params, "realAxisSweep", false) &&
      this.backend.orbit3dReady?.() !== false
    ) {
      if (this.sweepHold > 0) {
        this.sweepHold = Math.max(0, this.sweepHold - dt);
        if (this.sweepHold === 0) {
          this.sweepRe = ORBIT_SWEEP_START;
          this.setOrbit3dMarker(this.sweepRe, 0);
        }
      } else {
        const speed = Math.max(
          0.001,
          numericParam(this.params, "sweepSpeed", 0.15),
        );
        this.sweepRe = Math.max(ORBIT_SWEEP_END, this.sweepRe - dt * speed);
        this.setOrbit3dMarker(this.sweepRe, 0);
        if (this.sweepRe <= ORBIT_SWEEP_END) {
          this.sweepHold = ORBIT_SWEEP_HOLD_SECONDS;
        }
      }
    }

    this.advanceOrbit3dCamera(dt);

    if (paramsChanged) this.notifyParamsChange();
  }

  private advanceOrbit3dCamera(dt: number): void {
    if (this.orbitAutoRotateHold > 0) {
      this.orbitAutoRotateHold = Math.max(0, this.orbitAutoRotateHold - dt);
      return;
    }
    if (!this.orbitAutoRotateEnabled) return;

    if (booleanParam(this.params, "realAxisSweep", false)) {
      const sweepSpeed = Math.max(
        0.001,
        numericParam(this.params, "sweepSpeed", 0.15),
      );
      const progress = Math.min(
        1,
        Math.max(
          0,
          (ORBIT_SWEEP_START - this.sweepRe) /
            (ORBIT_SWEEP_START - ORBIT_SWEEP_END),
        ),
      );
      this.backend.orbit3dSyncCameraToSweep?.(
        progress,
        Math.max(
          ORBIT_AUTO_ROTATE_CATCHUP_RADIANS_PER_SECOND,
          sweepSpeed * 4,
        ) * dt,
      );
      return;
    }

    this.backend.orbit3dOrbit?.(ORBIT_AUTO_ROTATE_RADIANS_PER_SECOND * dt, 0);
  }

  private pauseOrbit3dAutoRotate(): void {
    if (this.renderMode === "orbit3d") {
      this.orbitAutoRotateHold = ORBIT_AUTO_ROTATE_RESUME_SECONDS;
    }
  }

  private setOrbit3dMarker(re: number, im: number): void {
    const marker = this.backend.setOrbit3dMarker?.(re, im) ?? null;
    const clientMarker = this.markerSnapshotToClient(marker);
    if (clientMarker) this.onOrbitMarkerChange?.(clientMarker);
  }

  private notifyParamsChange(): void {
    this.onParamsChange?.({ ...this.params });
  }

  private draw(): void {
    const state = this.kernel.readState();
    const channelCount = this.kernel.channelCount;
    const width = this.gridWidth;
    const height = this.gridHeight;
    if (width === 0 || height === 0) return;

    const expectedLength = width * height * channelCount;
    if (!this.usesDirectRendering() && state.length !== expectedLength) {
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
  private reinitGrid(fractalScale = 1, quality: "preview" | "full" = "full"): void {
    const { width, height } = this.computeGridSize(fractalScale);
    if (width === 0 || height === 0) return;

    this.gridWidth = width;
    this.gridHeight = height;
    this.canvas.dataset.renderSize = `${width}x${height}`;
    this.canvas.dataset.renderQuality = quality;

    this.backend.setGrid(
      width,
      height,
      this.kernel,
      this.renderMode,
      { ...this.params, seed: this.seed },
    );
    const direct = this.usesDirectRendering();
    this.kernel.init(direct ? 1 : width, direct ? 1 : height, {
      ...this.params,
      seed: this.seed,
    });
    this.cycleHold = -1;
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

  private computeGridSize(fractalScale = 1): { width: number; height: number } {
    // Fractal-style sims compute per-pixel detail, so the grid follows the
    // display for crispness. Resolution presets don't apply to them.
    if (!this.usesFixedGrid()) {
      return {
        width: Math.max(1, Math.round(this.displayWidth * fractalScale)),
        height: Math.max(1, Math.round(this.displayHeight * fractalScale)),
      };
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

    const computeScale = this.qualityProfile?.computeScale ?? 1;
    let w = Math.max(1, cssW * computeScale);
    let h = Math.max(1, cssH * computeScale);

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
    const fallback = this.renderMode === "grid" || this.renderMode === "particle" ? 2 : 3;
    return Math.min(this.qualityProfile?.displayDprCap ?? fallback, Math.max(1, dpr));
  }

  private maxRenderDim(): number {
    if (this.backend.kind === "webgl2") {
      const gpuLimit = this.backend.maxTextureSize ?? 4096;
      const fallback =
        this.renderMode === "grid" || this.renderMode === "particle" ? 2048 : 4096;
      const target = this.qualityProfile?.maxDisplayDimension ?? fallback;
      return Math.max(1024, Math.min(gpuLimit, target));
    }
    return 1024;
  }

  private maxRenderPixels(): number {
    if (this.backend.kind === "webgl2") {
      return (
        this.qualityProfile?.maxDisplayPixels ??
        (this.renderMode === "grid" || this.renderMode === "particle"
          ? 3_145_728
          : 8_388_608)
      );
    }
    return 786_432;
  }

  private usesDirectRendering(): boolean {
    return (
      this.backend.supportsDirectRendering?.(
        this.renderMode,
        this.kernel,
        this.params,
      ) ?? false
    );
  }
}

function numericParam(params: SimParams, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanParam(params: SimParams, key: string, fallback: boolean): boolean {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}
