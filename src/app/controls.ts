import type { ParamDescriptor, SimParams } from "./types.ts";
import {
  COLOUR_PRESETS,
  type ColourMapOptions,
  type ColourPreset,
} from "./colormap.ts";
import {
  clearBounds,
  clearRenderOptions,
  clearResolution,
  clearValues,
  loadBounds,
  loadSectionCollapsed,
  loadValues,
  saveBounds,
  saveRenderOptions,
  saveResolution,
  saveSectionCollapsed,
  saveValues,
  type SliderBounds,
} from "./persistence.ts";
import type { ParamPreset } from "./presets.ts";
import type { DisplayOptions, ResolutionPreset } from "./renderer.ts";

/**
 * A collapsible, headed control section. Open by default; a user's toggle is
 * remembered per sim and section label.
 */
export function collapsibleSection(
  slug: string,
  label: string,
  className: string,
): HTMLDetailsElement {
  const section = document.createElement("details");
  section.className = className;
  section.open = loadSectionCollapsed(slug, label) !== true;
  const summary = document.createElement("summary");
  summary.textContent = label;
  section.appendChild(summary);
  section.addEventListener("toggle", () => {
    saveSectionCollapsed(slug, label, !section.open);
  });
  return section;
}

export interface ControlsCallbacks {
  onPlayPause: () => void;
  onReset: () => void;
  onToggleFullscreen: () => void;
  onStepsPerFrameChange: (value: number) => void;
  onColourChange: (next: ColourMapOptions) => void;
  onDisplayChange: (next: DisplayOptions) => void;
  onParamChange: (next: SimParams) => void;
  onResolutionChange: (preset: ResolutionPreset) => void;
  onAutoCycleChange: (enabled: boolean) => void;
}

const RESOLUTION_OPTIONS: ReadonlyArray<{
  value: ResolutionPreset;
  label: string;
}> = [
  { value: "performance", label: "Performance (fastest)" },
  { value: "balanced", label: "Balanced" },
  { value: "high", label: "High" },
  { value: "ultra", label: "Ultra (slowest)" },
];

// Opt-in tier: only worth its cost on sims whose builder consumes the extra
// cells (orbit3d point clouds); hidden from the dropdown everywhere else.
const EXTREME_RESOLUTION_OPTION = {
  value: "extreme",
  label: "Extreme (huge point cloud)",
} as const satisfies { value: ResolutionPreset; label: string };

export interface StepsControlOptions {
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface ControlsOptions {
  slug: string;
  container: HTMLElement;
  simName: string;
  paramSchema: readonly ParamDescriptor[];
  paramPresets: readonly ParamPreset[];
  initialParams: SimParams;
  /** Factory-default params (schema defaults + per-sim overrides), ignoring persistence. Used by "Reset to defaults". */
  defaultParams: SimParams;
  initialStepsPerFrame: number;
  stepsControl: StepsControlOptions;
  initialColourOptions: ColourMapOptions;
  /** Factory-default colour options, ignoring persistence. Used by "Reset to defaults". */
  defaultColourOptions: ColourMapOptions;
  initialDisplayOptions: DisplayOptions;
  /** Factory-default display options, ignoring persistence. Used by "Reset to defaults". */
  defaultDisplayOptions: DisplayOptions;
  initialResolution: ResolutionPreset;
  /** Factory-default resolution, ignoring persistence. Used by "Reset to defaults". */
  defaultResolution: ResolutionPreset;
  /** Show the simulation-resolution preset selector (omit for fractals). */
  showResolutionControl?: boolean;
  /** Offer the "Extreme" grid-quality tier (orbit3d point-cloud sims only). */
  showExtremeResolution?: boolean;
  /** Show the particle-trail fade slider (particle-mode sims only). */
  showTrailControl?: boolean;
  /**
   * Show the display "Point size (px)" slider. Off for sims whose kernel
   * declares its own pointSize param: that one wins in the renderer, so
   * showing both puts two identically-labelled sliders in the panel, only one
   * of which does anything.
   */
  showDotSizeControl?: boolean;
  /** Show the "Auto-cycle runs" toggle (sims whose kernel reports isComplete()). */
  showAutoCycleControl?: boolean;
  /** Initial auto-cycle state (persisted or per-sim default). */
  initialAutoCycle?: boolean;
  /** Factory-default auto-cycle state, ignoring persistence. Used by "Reset to defaults". */
  defaultAutoCycle?: boolean;
  callbacks: ControlsCallbacks;
  /** Mandelbrot / Julia / Burning Ship: palette cycle direction + key hint (does not duplicate cycle speed slider). */
  fractalPaletteCycleUi?: boolean;
  /**
   * Kernel param keys hoisted into the top "View" group alongside grid
   * quality, kernel preset, and palette. Remaining schema params stay in the
   * Parameters section.
   */
  viewParamKeys?: readonly string[];
  /**
   * Named clusters rendered as their own headed sections between the View
   * group and the trailing "Parameters" section, in the order given. Keys
   * already hoisted into View are skipped; schema params in no cluster land
   * in "Parameters" as before.
   */
  paramGroups?: readonly { label: string; keys: readonly string[] }[];
}

/**
 * Renders a control panel auto-generated from a kernel's paramSchema.
 *
 * No per-sim branching. number → labelled slider, boolean → checkbox,
 * enum → dropdown. Any change pushes a fresh SimParams object via
 * callbacks.onParamChange (the renderer will re-init the kernel).
 */
export class ControlsPanel {
  private readonly slug: string;
  private readonly container: HTMLElement;
  private readonly callbacks: ControlsCallbacks;
  private readonly paramSchema: readonly ParamDescriptor[];
  private readonly initialStepsPerFrame: number;
  private readonly stepsControl: StepsControlOptions;
  private readonly defaultColourOptions: ColourMapOptions;
  private readonly defaultDisplayOptions: DisplayOptions;
  private readonly defaultParams: SimParams;
  private readonly defaultResolution: ResolutionPreset;
  private readonly showResolutionControl: boolean;
  private readonly showExtremeResolution: boolean;
  private readonly showTrailControl: boolean;
  private readonly showDotSizeControl: boolean;
  private readonly showAutoCycleControl: boolean;
  private readonly defaultAutoCycle: boolean;
  private autoCycle: boolean;
  private autoCycleInput?: HTMLInputElement;
  private params: SimParams;
  private colourOptions: ColourMapOptions;
  private displayOptions: DisplayOptions;
  private resolution: ResolutionPreset;
  private resolutionSelect?: HTMLSelectElement;
  private readonly paramInputs = new Map<
    string,
    HTMLInputElement | HTMLSelectElement
  >();
  private readonly paramValueLabels = new Map<string, HTMLSpanElement>();
  private readonly numberBoundEditors = new Map<
    string,
    {
      descriptor: ParamDescriptor;
      input: HTMLInputElement;
      valueLabel: HTMLSpanElement;
      minInput: HTMLInputElement;
      maxInput: HTMLInputElement;
    }
  >();
  private playPauseBtn!: HTMLButtonElement;
  private fpsLabel!: HTMLSpanElement;
  private iterationLabel!: HTMLSpanElement;
  private stepsInput?: HTMLInputElement;
  private stepsValueLabel?: HTMLSpanElement;
  private colourPresetSelect?: HTMLSelectElement;
  private cycleDirectionSelect?: HTMLSelectElement;
  private invertInput?: HTMLInputElement;
  private readonly colourRangeControls = new Map<
    string,
    {
      input: HTMLInputElement;
      valueLabel: HTMLSpanElement;
      step: number;
    }
  >();

  constructor(options: ControlsOptions) {
    this.slug = options.slug;
    this.container = options.container;
    this.callbacks = options.callbacks;
    this.paramSchema = options.paramSchema;
    this.initialStepsPerFrame = options.initialStepsPerFrame;
    this.stepsControl = options.stepsControl;
    this.defaultColourOptions = { ...options.defaultColourOptions };
    this.defaultDisplayOptions = { ...options.defaultDisplayOptions };
    this.defaultParams = { ...options.defaultParams };
    this.defaultResolution = options.defaultResolution;
    this.showResolutionControl = options.showResolutionControl ?? true;
    this.showExtremeResolution = options.showExtremeResolution ?? false;
    this.showTrailControl = options.showTrailControl ?? false;
    this.showDotSizeControl = options.showDotSizeControl ?? true;
    this.showAutoCycleControl = options.showAutoCycleControl ?? false;
    this.defaultAutoCycle = options.defaultAutoCycle ?? false;
    this.autoCycle = options.initialAutoCycle ?? this.defaultAutoCycle;
    this.params = restorePersistedParams(
      options.slug,
      options.paramSchema,
      options.initialParams,
    );
    this.colourOptions = { ...options.initialColourOptions };
    this.displayOptions = { ...options.initialDisplayOptions };
    this.resolution = options.initialResolution;
    this.render(options);
  }

  setPlayState(isRunning: boolean): void {
    this.playPauseBtn.textContent = isRunning ? "Pause" : "Play";
    this.playPauseBtn.setAttribute("aria-pressed", String(isRunning));
  }

  setFps(fps: number): void {
    this.fpsLabel.textContent = `${fps.toFixed(0)} fps`;
  }

  setIterations(iterations: number): void {
    this.iterationLabel.textContent = `iter ${iterations.toLocaleString("en-US")}`;
  }

  getParams(): SimParams {
    return { ...this.params };
  }

  /**
   * Merge external param updates (e.g. canvas drag/zoom) and refresh widgets without firing onParamChange.
   */
  syncParamsFromExternal(next: SimParams, persist = true): void {
    const touched = new Set(Object.keys(next));
    this.params = { ...this.params, ...next };
    for (const descriptor of this.paramSchema) {
      if (!touched.has(descriptor.key)) continue;
      const value = this.params[descriptor.key];
      if (value === undefined) continue;
      this.syncParamControl(descriptor, value);
    }
    if (persist) saveValues(this.slug, this.params);
  }

  private render(options: ControlsOptions): void {
    this.container.innerHTML = "";
    this.container.classList.add("controls");
    this.paramInputs.clear();
    this.paramValueLabels.clear();
    this.numberBoundEditors.clear();
    this.colourRangeControls.clear();

    const header = document.createElement("header");
    header.className = "controls__header";

    const title = document.createElement("h2");
    title.className = "controls__title";
    title.textContent = options.simName;
    header.appendChild(title);

    const metrics = document.createElement("div");
    metrics.className = "controls__metrics";

    this.iterationLabel = document.createElement("span");
    this.iterationLabel.className = "controls__iteration";
    this.iterationLabel.textContent = "iter 0";
    metrics.appendChild(this.iterationLabel);

    this.fpsLabel = document.createElement("span");
    this.fpsLabel.className = "controls__fps";
    this.fpsLabel.textContent = "— fps";
    metrics.appendChild(this.fpsLabel);

    header.appendChild(metrics);

    this.container.appendChild(header);

    const transport = document.createElement("div");
    transport.className = "controls__transport";

    this.playPauseBtn = button("Pause", () => this.callbacks.onPlayPause());
    this.playPauseBtn.setAttribute("aria-pressed", "true");
    transport.appendChild(this.playPauseBtn);

    transport.appendChild(button("Reset", () => this.callbacks.onReset()));
    transport.appendChild(
      button("Reset to defaults", () => this.resetToDefaults()),
    );
    transport.appendChild(
      button("Maximise", () => this.callbacks.onToggleFullscreen()),
    );

    transport.appendChild(
      this.buildStepsControl(options.initialStepsPerFrame, options.stepsControl, (value) =>
        this.callbacks.onStepsPerFrameChange(value),
      ),
    );

    if (this.showAutoCycleControl) {
      transport.appendChild(this.buildAutoCycleControl());
    }

    this.container.appendChild(transport);

    const viewParamKeys = new Set(options.viewParamKeys ?? []);
    const viewSection = collapsibleSection(this.slug, "View", "controls__view");
    if (this.showResolutionControl) {
      for (const element of this.buildQualityControls()) {
        viewSection.appendChild(element);
      }
    }
    viewSection.appendChild(this.buildKernelPresetRow(options));
    viewSection.appendChild(
      this.buildPresetControl(this.colourOptions.preset, (preset) => {
        this.setColourOptions({ ...this.colourOptions, preset });
      }),
    );
    for (const descriptor of options.paramSchema) {
      if (!viewParamKeys.has(descriptor.key)) continue;
      const current = this.params[descriptor.key] ?? descriptor.default;
      viewSection.appendChild(this.buildParamControl(descriptor, current));
    }
    this.container.appendChild(viewSection);

    this.container.appendChild(
      this.buildColourDashboard(options.fractalPaletteCycleUi ?? false),
    );

    const grouped = new Set(viewParamKeys);
    for (const group of options.paramGroups ?? []) {
      const members = options.paramSchema.filter(
        (descriptor) =>
          group.keys.includes(descriptor.key) && !grouped.has(descriptor.key),
      );
      if (members.length === 0) continue;
      const groupSection = collapsibleSection(
        this.slug,
        group.label,
        "controls__params",
      );
      for (const descriptor of members) {
        const current = this.params[descriptor.key] ?? descriptor.default;
        groupSection.appendChild(this.buildParamControl(descriptor, current));
        grouped.add(descriptor.key);
      }
      this.container.appendChild(groupSection);
    }

    const remainingSchema = options.paramSchema.filter(
      (descriptor) => !grouped.has(descriptor.key),
    );
    if (remainingSchema.length > 0) {
      const paramSection = collapsibleSection(
        this.slug,
        "Parameters",
        "controls__params",
      );

      for (const descriptor of remainingSchema) {
        const current = this.params[descriptor.key] ?? descriptor.default;
        paramSection.appendChild(this.buildParamControl(descriptor, current));
      }

      this.container.appendChild(paramSection);
    }
  }

  private buildStepsControl(
    initial: number,
    control: StepsControlOptions,
    onChange: (value: number) => void,
  ): HTMLLabelElement {
    const wrap = document.createElement("label");
    wrap.className = "control control--number";

    const label = document.createElement("span");
    label.className = "control__label";
    label.textContent = control.label;
    wrap.appendChild(label);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(control.min);
    input.max = String(control.max);
    input.step = String(control.step);
    input.value = String(initial);
    wrap.appendChild(input);

    const value = document.createElement("span");
    value.className = "control__value";
    value.textContent = formatSpeed(initial, control.step);
    wrap.appendChild(value);

    input.addEventListener("input", () => {
      const next = Number(input.value);
      value.textContent = formatSpeed(next, control.step);
      onChange(next);
    });

    this.stepsInput = input;
    this.stepsValueLabel = value;

    return wrap;
  }

  private buildParamControl(
    descriptor: ParamDescriptor,
    current: number | boolean | string,
  ): HTMLElement {
    switch (descriptor.type) {
      case "number":
        return this.buildNumberControl(descriptor, Number(current));
      case "boolean":
        return this.buildBooleanControl(descriptor, Boolean(current));
      case "enum":
        return this.buildEnumControl(descriptor, String(current));
    }
  }

  private buildNumberControl(
    descriptor: ParamDescriptor,
    initial: number,
  ): HTMLLabelElement {
    const wrap = document.createElement("label");
    wrap.className = "control control--number";

    const bounds = boundsForDescriptor(this.slug, descriptor, initial);
    const clampedInitial = clampToBounds(initial, bounds);

    const label = document.createElement("span");
    label.className = "control__label control__label--with-action";
    label.textContent = descriptor.label;

    const tuneButton = document.createElement("button");
    tuneButton.type = "button";
    tuneButton.className = "control__tune-button";
    tuneButton.textContent = "⋯";
    tuneButton.setAttribute(
      "aria-label",
      `Adjust ${descriptor.label.toLowerCase()} range`,
    );

    const popover = document.createElement("div");
    popover.className = "control__tune-popover";
    popover.hidden = true;

    const minInput = document.createElement("input");
    minInput.type = "number";
    minInput.value = String(bounds.min);
    minInput.step = descriptor.step !== undefined ? String(descriptor.step) : "any";

    const maxInput = document.createElement("input");
    maxInput.type = "number";
    maxInput.value = String(bounds.max);
    maxInput.step = descriptor.step !== undefined ? String(descriptor.step) : "any";

    popover.appendChild(buildBoundInput("Min", minInput));
    popover.appendChild(buildBoundInput("Max", maxInput));

    const applyButton = button("Apply", () => {});
    applyButton.classList.add("control__tune-apply");
    popover.appendChild(applyButton);

    tuneButton.addEventListener("click", () => {
      popover.hidden = !popover.hidden;
    });
    label.appendChild(tuneButton);
    wrap.appendChild(label);

    const input = document.createElement("input");
    input.type = "range";
    input.dataset.paramKey = descriptor.key;
    input.min = String(bounds.min);
    input.max = String(bounds.max);
    if (descriptor.step !== undefined) input.step = String(descriptor.step);
    input.value = String(clampedInitial);
    this.paramInputs.set(descriptor.key, input);
    wrap.appendChild(input);

    const value = document.createElement("span");
    value.className = "control__value";
    value.textContent = formatNumber(clampedInitial, descriptor.step);
    this.paramValueLabels.set(descriptor.key, value);
    wrap.appendChild(value);
    wrap.appendChild(popover);
    this.numberBoundEditors.set(descriptor.key, {
      descriptor,
      input,
      valueLabel: value,
      minInput,
      maxInput,
    });

    input.addEventListener("input", () => {
      const next = Number(input.value);
      value.textContent = formatNumber(next, descriptor.step);
      this.updateParams({ ...this.params, [descriptor.key]: next });
    });

    applyButton.addEventListener("click", () => {
      const nextMin = Number(minInput.value);
      const nextMax = Number(maxInput.value);
      if (!Number.isFinite(nextMin) || !Number.isFinite(nextMax) || nextMax <= nextMin) {
        return;
      }

      saveBounds(this.slug, descriptor.key, { min: nextMin, max: nextMax });
      this.applyNumberBounds(descriptor, input, value, nextMin, nextMax);
      popover.hidden = true;
    });

    this.params = { ...this.params, [descriptor.key]: clampedInitial };
    return wrap;
  }

  private buildBooleanControl(
    descriptor: ParamDescriptor,
    initial: boolean,
  ): HTMLLabelElement {
    const wrap = document.createElement("label");
    wrap.className = "control control--boolean";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.paramKey = descriptor.key;
    input.checked = initial;
    this.paramInputs.set(descriptor.key, input);
    wrap.appendChild(input);

    const label = document.createElement("span");
    label.className = "control__label";
    label.textContent = descriptor.label;
    wrap.appendChild(label);

    input.addEventListener("change", () => {
      this.updateParams({ ...this.params, [descriptor.key]: input.checked });
    });

    return wrap;
  }

  private buildEnumControl(
    descriptor: ParamDescriptor,
    initial: string,
  ): HTMLLabelElement {
    const wrap = document.createElement("label");
    wrap.className = "control control--enum";

    const label = document.createElement("span");
    label.className = "control__label";
    label.textContent = descriptor.label;
    wrap.appendChild(label);

    const select = document.createElement("select");
    select.dataset.paramKey = descriptor.key;
    for (const option of descriptor.options ?? []) {
      const optEl = document.createElement("option");
      optEl.value = option;
      optEl.textContent = option;
      if (option === initial) optEl.selected = true;
      select.appendChild(optEl);
    }
    this.paramInputs.set(descriptor.key, select);
    wrap.appendChild(select);

    select.addEventListener("change", () => {
      this.updateParams({ ...this.params, [descriptor.key]: select.value });
    });

    return wrap;
  }

  /** Grid-quality row plus its restart hint, for the View group. */
  private buildQualityControls(): HTMLElement[] {
    const wrap = document.createElement("label");
    wrap.className = "control control--enum";

    const label = document.createElement("span");
    label.className = "control__label";
    label.textContent = "Grid quality";
    wrap.appendChild(label);

    const select = document.createElement("select");
    const options = this.showExtremeResolution
      ? [...RESOLUTION_OPTIONS, EXTREME_RESOLUTION_OPTION]
      : RESOLUTION_OPTIONS;
    for (const option of options) {
      const optEl = document.createElement("option");
      optEl.value = option.value;
      optEl.textContent = option.label;
      if (option.value === this.resolution) optEl.selected = true;
      select.appendChild(optEl);
    }
    select.addEventListener("change", () => {
      const preset = select.value as ResolutionPreset;
      this.resolution = preset;
      saveResolution(this.slug, preset);
      this.callbacks.onResolutionChange(preset);
    });
    this.resolutionSelect = select;
    wrap.appendChild(select);

    const hint = document.createElement("p");
    hint.className = "controls__hint";
    hint.textContent =
      "Detail ceiling. The sim fits your window up to this cap — higher is " +
      "sharper on big screens but steps slower. Changing it restarts the sim.";

    return [wrap, hint];
  }

  /** Kernel-preset row, for the View group. */
  private buildKernelPresetRow(options: ControlsOptions): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "control control--enum";

    const label = document.createElement("span");
    label.className = "control__label";
    label.textContent = "Kernel preset";
    wrap.appendChild(label);

    const select = document.createElement("select");
    const kernelDefault = document.createElement("option");
    kernelDefault.value = "__default__";
    kernelDefault.textContent = "Kernel default";
    select.appendChild(kernelDefault);

    for (const preset of options.paramPresets) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      select.appendChild(option);
    }

    select.addEventListener("change", () => {
      const preset =
        select.value === "__default__"
          ? { params: options.initialParams }
          : options.paramPresets.find((candidate) => candidate.id === select.value);
      if (!preset) return;
      this.applyParams(preset.params, options.paramSchema);
    });

    wrap.appendChild(select);

    return wrap;
  }

  private buildColourDashboard(fractalPaletteCycleUi: boolean): HTMLElement {
    const section = collapsibleSection(this.slug, "Colour", "controls__colour");

    if (fractalPaletteCycleUi) {
      section.appendChild(this.buildFractalPaletteCycleExtras());
    }

    section.appendChild(
      this.buildColourRangeControl("Gamma", this.colourOptions.gamma, 0.2, 2.5, 0.05, (gamma) => {
        this.setColourOptions({ ...this.colourOptions, gamma });
      }),
    );
    section.appendChild(
      this.buildColourRangeControl(
        "Contrast",
        this.colourOptions.contrast,
        0.4,
        2.4,
        0.05,
        (contrast) => {
          this.setColourOptions({ ...this.colourOptions, contrast });
        },
      ),
    );
    section.appendChild(
      this.buildColourRangeControl(
        "Palette steps",
        this.colourOptions.steps,
        0,
        16,
        1,
        (steps) => {
          this.setColourOptions({ ...this.colourOptions, steps });
        },
      ),
    );
    section.appendChild(
      this.buildColourBooleanControl("Invert colours", this.colourOptions.invert, (invert) => {
        this.setColourOptions({ ...this.colourOptions, invert });
      }),
    );
    if (this.showDotSizeControl) {
      section.appendChild(
        this.buildColourRangeControl(
          "Point size (px)",
          this.displayOptions.dotSize,
          1,
          6,
          1,
          (dotSize) => {
            this.setDisplayOptions({ ...this.displayOptions, dotSize });
          },
        ),
      );
    }
    if (this.showTrailControl) {
      section.appendChild(
        this.buildColourRangeControl(
          "Trail fade",
          this.displayOptions.trailFade,
          0,
          0.98,
          0.01,
          (trailFade) => {
            this.setDisplayOptions({ ...this.displayOptions, trailFade });
          },
        ),
      );
    }
    section.appendChild(
      this.buildColourRangeControl(
        "Bloom",
        this.displayOptions.bloom,
        0,
        1,
        0.05,
        (bloom) => {
          this.setDisplayOptions({ ...this.displayOptions, bloom });
        },
      ),
    );

    return section;
  }

  /**
   * Kernels keep cycleSpeed ≥ 0; “reverse” is implemented in the colour mapper
   * (see ColourMapOptions.paletteCycleReverse), not by passing negative params.
   */
  private buildFractalPaletteCycleExtras(): HTMLElement {
    const block = document.createElement("div");
    block.className = "controls__fractal-palette-cycle";

    const row = document.createElement("label");
    row.className = "control control--enum";

    const rowLabel = document.createElement("span");
    rowLabel.className = "control__label";
    rowLabel.textContent = "Cycle direction";
    row.appendChild(rowLabel);

    const select = document.createElement("select");
    const forward = document.createElement("option");
    forward.value = "forward";
    forward.textContent = "Forward";
    const reverse = document.createElement("option");
    reverse.value = "reverse";
    reverse.textContent = "Reverse";
    select.appendChild(forward);
    select.appendChild(reverse);
    select.value = this.colourOptions.paletteCycleReverse ? "reverse" : "forward";

    select.addEventListener("change", () => {
      const paletteCycleReverse = select.value === "reverse";
      this.setColourOptions({ ...this.colourOptions, paletteCycleReverse });
    });
    this.cycleDirectionSelect = select;

    row.appendChild(select);
    block.appendChild(row);

    const hint = document.createElement("p");
    hint.className = "controls__hint";
    hint.textContent =
      "Arrow Up / Down adjusts Cycle speed (same as the parameter slider).";
    block.appendChild(hint);

    return block;
  }

  private buildPresetControl(
    initial: ColourPreset,
    onChange: (preset: ColourPreset) => void,
  ): HTMLLabelElement {
    const wrap = document.createElement("label");
    wrap.className = "control control--enum";

    const label = document.createElement("span");
    label.className = "control__label";
    label.textContent = "Palette";
    wrap.appendChild(label);

    const select = document.createElement("select");
    for (const option of COLOUR_PRESETS) {
      const optEl = document.createElement("option");
      optEl.value = option.value;
      optEl.textContent = option.label;
      if (option.value === initial) optEl.selected = true;
      select.appendChild(optEl);
    }
    wrap.appendChild(select);

    select.addEventListener("change", () => {
      onChange(select.value as ColourPreset);
    });
    this.colourPresetSelect = select;

    return wrap;
  }

  private buildColourRangeControl(
    labelText: string,
    initial: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
  ): HTMLLabelElement {
    const wrap = document.createElement("label");
    wrap.className = "control control--number";

    const label = document.createElement("span");
    label.className = "control__label";
    label.textContent = labelText;
    wrap.appendChild(label);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(initial);
    wrap.appendChild(input);

    const value = document.createElement("span");
    value.className = "control__value";
    value.textContent = formatNumber(initial, step);
    wrap.appendChild(value);

    input.addEventListener("input", () => {
      const next = Number(input.value);
      value.textContent = formatNumber(next, step);
      onChange(next);
    });
    this.colourRangeControls.set(labelText, { input, valueLabel: value, step });

    return wrap;
  }

  private buildColourBooleanControl(
    labelText: string,
    initial: boolean,
    onChange: (value: boolean) => void,
  ): HTMLLabelElement {
    const wrap = document.createElement("label");
    wrap.className = "control control--boolean";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = initial;
    wrap.appendChild(input);

    const label = document.createElement("span");
    label.className = "control__label";
    label.textContent = labelText;
    wrap.appendChild(label);

    input.addEventListener("change", () => {
      onChange(input.checked);
    });
    if (labelText === "Invert colours") {
      this.invertInput = input;
    }

    return wrap;
  }

  private buildAutoCycleControl(): HTMLLabelElement {
    const wrap = document.createElement("label");
    wrap.className = "control control--boolean";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.autoCycle;
    this.autoCycleInput = input;
    wrap.appendChild(input);

    const label = document.createElement("span");
    label.className = "control__label";
    label.textContent = "Auto-cycle runs";
    wrap.appendChild(label);

    input.addEventListener("change", () => {
      this.setAutoCycle(input.checked);
    });

    return wrap;
  }

  private setAutoCycle(enabled: boolean): void {
    this.autoCycle = enabled;
    if (this.autoCycleInput) {
      this.autoCycleInput.checked = enabled;
    }
    this.persistRenderOptions();
    this.callbacks.onAutoCycleChange(enabled);
  }

  private updateParams(next: SimParams): void {
    this.params = next;
    saveValues(this.slug, this.params);
    this.callbacks.onParamChange(this.params);
  }

  private applyNumberBounds(
    descriptor: ParamDescriptor,
    input: HTMLInputElement,
    valueLabel: HTMLSpanElement,
    min: number,
    max: number,
  ): void {
    input.min = String(min);
    input.max = String(max);

    const clamped = clampToBounds(Number(input.value), { min, max });
    input.value = String(clamped);
    valueLabel.textContent = formatNumber(clamped, descriptor.step);

    if (this.params[descriptor.key] !== clamped) {
      this.updateParams({ ...this.params, [descriptor.key]: clamped });
    }
  }

  private resetToDefaults(): void {
    clearValues(this.slug);
    clearBounds(this.slug);
    clearResolution(this.slug);
    clearRenderOptions(this.slug);

    this.syncStepsControl(this.initialStepsPerFrame);
    this.colourOptions = { ...this.defaultColourOptions };
    this.displayOptions = { ...this.defaultDisplayOptions };
    this.resolution = this.defaultResolution;
    if (this.resolutionSelect) {
      this.resolutionSelect.value = this.defaultResolution;
    }
    this.syncColourControls();
    if (this.showAutoCycleControl && this.autoCycle !== this.defaultAutoCycle) {
      this.setAutoCycle(this.defaultAutoCycle);
    }
    this.callbacks.onStepsPerFrameChange(this.initialStepsPerFrame);
    this.callbacks.onColourChange(this.colourOptions);
    this.callbacks.onDisplayChange(this.displayOptions);
    this.callbacks.onResolutionChange(this.defaultResolution);

    const nextParams = defaultParamsFromSchema(this.paramSchema);
    for (const descriptor of this.paramSchema) {
      const defaultValue = this.defaultParams[descriptor.key] ?? descriptor.default;
      this.syncParamControl(descriptor, defaultValue);
      nextParams[descriptor.key] = defaultValue;

      if (descriptor.type !== "number") {
        continue;
      }

      const controls = this.numberBoundEditors.get(descriptor.key);
      if (!controls) {
        continue;
      }

      const schemaBounds = schemaBoundsForDescriptor(
        descriptor,
        Number(defaultValue),
      );
      controls.minInput.value = String(schemaBounds.min);
      controls.maxInput.value = String(schemaBounds.max);
      controls.input.min = String(schemaBounds.min);
      controls.input.max = String(schemaBounds.max);

      const clamped = clampToBounds(Number(defaultValue), schemaBounds);
      controls.input.value = String(clamped);
      controls.valueLabel.textContent = formatNumber(clamped, descriptor.step);
      nextParams[descriptor.key] = clamped;
    }

    this.params = nextParams;
    this.callbacks.onParamChange(this.params);
    this.callbacks.onReset();
  }

  private syncStepsControl(value: number): void {
    if (!this.stepsInput || !this.stepsValueLabel) {
      return;
    }
    this.stepsInput.value = String(value);
    this.stepsValueLabel.textContent = formatSpeed(value, this.stepsControl.step);
  }

  private syncColourControls(): void {
    if (this.colourPresetSelect) {
      this.colourPresetSelect.value = this.colourOptions.preset;
    }
    if (this.cycleDirectionSelect) {
      this.cycleDirectionSelect.value = this.colourOptions.paletteCycleReverse
        ? "reverse"
        : "forward";
    }
    if (this.invertInput) {
      this.invertInput.checked = this.colourOptions.invert;
    }
    this.syncColourRangeControl("Gamma", this.colourOptions.gamma);
    this.syncColourRangeControl("Contrast", this.colourOptions.contrast);
    this.syncColourRangeControl("Palette steps", this.colourOptions.steps);
    this.syncColourRangeControl("Point size (px)", this.displayOptions.dotSize);
    this.syncColourRangeControl("Trail fade", this.displayOptions.trailFade);
    this.syncColourRangeControl("Bloom", this.displayOptions.bloom);
  }

  private syncColourRangeControl(label: string, value: number): void {
    const controls = this.colourRangeControls.get(label);
    if (!controls) {
      return;
    }
    controls.input.value = String(value);
    controls.valueLabel.textContent = formatNumber(value, controls.step);
  }

  private setColourOptions(next: ColourMapOptions): void {
    this.colourOptions = { ...next };
    this.persistRenderOptions();
    this.callbacks.onColourChange(this.colourOptions);
  }

  private persistRenderOptions(): void {
    saveRenderOptions(this.slug, {
      steps: this.colourOptions.steps,
      trailFade: this.displayOptions.trailFade,
      bloom: this.displayOptions.bloom,
      autoCycle: this.autoCycle,
    });
  }

  private setDisplayOptions(next: DisplayOptions): void {
    this.displayOptions = {
      dotSize: Math.max(1, Math.min(6, Math.floor(next.dotSize))),
      trailFade: Math.max(0, Math.min(0.985, next.trailFade)),
      bloom: Math.max(0, Math.min(1, next.bloom)),
    };
    this.persistRenderOptions();
    this.callbacks.onDisplayChange(this.displayOptions);
  }

  private applyParams(
    presetParams: SimParams,
    schema: readonly ParamDescriptor[],
  ): void {
    const nextParams = { ...this.params };
    for (const descriptor of schema) {
      const value = presetParams[descriptor.key] ?? descriptor.default;
      nextParams[descriptor.key] = value;
      this.syncParamControl(descriptor, value);
    }
    this.updateParams(nextParams);
  }

  private syncParamControl(
    descriptor: ParamDescriptor,
    value: number | boolean | string,
  ): void {
    const input = this.paramInputs.get(descriptor.key);
    if (!input) return;

    switch (descriptor.type) {
      case "number": {
        input.value = String(value);
        const valueLabel = this.paramValueLabels.get(descriptor.key);
        if (valueLabel) {
          valueLabel.textContent = formatNumber(Number(value), descriptor.step);
        }
        return;
      }
      case "boolean":
        if (input instanceof HTMLInputElement) {
          input.checked = Boolean(value);
        }
        return;
      case "enum":
        input.value = String(value);
        return;
    }
  }
}

function buildBoundInput(labelText: string, input: HTMLInputElement): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "control__tune-field";

  const label = document.createElement("span");
  label.textContent = labelText;
  wrap.appendChild(label);

  wrap.appendChild(input);
  return wrap;
}

function boundsForDescriptor(
  slug: string,
  descriptor: ParamDescriptor,
  initial: number,
): SliderBounds {
  const fallback = schemaBoundsForDescriptor(descriptor, initial);

  const stored = loadBounds(slug, descriptor.key);
  if (!stored || !Number.isFinite(stored.min) || !Number.isFinite(stored.max)) {
    return fallback;
  }
  if (stored.max <= stored.min) {
    return fallback;
  }
  return stored;
}

function schemaBoundsForDescriptor(
  descriptor: ParamDescriptor,
  initial: number,
): SliderBounds {
  const fallbackMin = typeof descriptor.min === "number" ? descriptor.min : initial - 1;
  const fallbackMax = typeof descriptor.max === "number" ? descriptor.max : initial + 1;
  return fallbackMax > fallbackMin
    ? { min: fallbackMin, max: fallbackMax }
    : { min: fallbackMin, max: fallbackMin + 1 };
}

function clampToBounds(value: number, bounds: SliderBounds): number {
  if (!Number.isFinite(value)) {
    return bounds.min;
  }
  if (value < bounds.min) {
    return bounds.min;
  }
  if (value > bounds.max) {
    return bounds.max;
  }
  return value;
}

export function restorePersistedParams(
  slug: string,
  schema: readonly ParamDescriptor[],
  initialParams: SimParams,
): SimParams {
  const loaded = loadValues(slug);
  if (!loaded) {
    return { ...initialParams };
  }

  const next = { ...initialParams };
  for (const descriptor of schema) {
    const value = loaded[descriptor.key];
    if (value === undefined) {
      continue;
    }

    switch (descriptor.type) {
      case "number":
        if (typeof value === "number" && Number.isFinite(value)) {
          next[descriptor.key] = value;
        }
        break;
      case "boolean":
        if (typeof value === "boolean") {
          next[descriptor.key] = value;
        }
        break;
      case "enum":
        if (typeof value === "string") {
          next[descriptor.key] = value;
        }
        break;
    }
  }

  return next;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control__button";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function formatNumber(value: number, step?: number): string {
  if (step === undefined) return String(value);
  const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(step || 1))));
  return value.toFixed(decimals);
}

function formatSpeed(value: number, step: number): string {
  return `${formatNumber(value, step)}x`;
}

/** Read the initial SimParams object from a kernel's paramSchema. */
export function defaultParamsFromSchema(
  schema: readonly ParamDescriptor[],
): SimParams {
  const out: SimParams = {};
  for (const descriptor of schema) {
    out[descriptor.key] = descriptor.default;
  }
  return out;
}
