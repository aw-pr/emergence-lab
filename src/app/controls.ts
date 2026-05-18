import type { ParamDescriptor, SimParams } from "./types.ts";
import {
  COLOUR_PRESETS,
  type ColourMapOptions,
  type ColourPreset,
} from "./colormap.ts";
import type { ParamPreset } from "./presets.ts";
import type { DisplayOptions } from "./renderer.ts";

export interface ControlsCallbacks {
  onPlayPause: () => void;
  onReset: () => void;
  onToggleFullscreen: () => void;
  onStepsPerFrameChange: (value: number) => void;
  onColourChange: (next: ColourMapOptions) => void;
  onDisplayChange: (next: DisplayOptions) => void;
  onParamChange: (next: SimParams) => void;
}

export interface ControlsOptions {
  container: HTMLElement;
  simName: string;
  paramSchema: readonly ParamDescriptor[];
  paramPresets: readonly ParamPreset[];
  initialParams: SimParams;
  initialStepsPerFrame: number;
  initialColourOptions: ColourMapOptions;
  initialDisplayOptions: DisplayOptions;
  callbacks: ControlsCallbacks;
  /** Mandelbrot / Julia / Burning Ship: palette cycle direction + key hint (does not duplicate cycle speed slider). */
  fractalPaletteCycleUi?: boolean;
}

/**
 * Renders a control panel auto-generated from a kernel's paramSchema.
 *
 * No per-sim branching. number → labelled slider, boolean → checkbox,
 * enum → dropdown. Any change pushes a fresh SimParams object via
 * callbacks.onParamChange (the renderer will re-init the kernel).
 */
export class ControlsPanel {
  private readonly container: HTMLElement;
  private readonly callbacks: ControlsCallbacks;
  private readonly paramSchema: readonly ParamDescriptor[];
  private params: SimParams;
  private colourOptions: ColourMapOptions;
  private displayOptions: DisplayOptions;
  private readonly paramInputs = new Map<
    string,
    HTMLInputElement | HTMLSelectElement
  >();
  private readonly paramValueLabels = new Map<string, HTMLSpanElement>();
  private playPauseBtn!: HTMLButtonElement;
  private fpsLabel!: HTMLSpanElement;

  constructor(options: ControlsOptions) {
    this.container = options.container;
    this.callbacks = options.callbacks;
    this.paramSchema = options.paramSchema;
    this.params = { ...options.initialParams };
    this.colourOptions = { ...options.initialColourOptions };
    this.displayOptions = { ...options.initialDisplayOptions };
    this.render(options);
  }

  setPlayState(isRunning: boolean): void {
    this.playPauseBtn.textContent = isRunning ? "Pause" : "Play";
    this.playPauseBtn.setAttribute("aria-pressed", String(isRunning));
  }

  setFps(fps: number): void {
    this.fpsLabel.textContent = `${fps.toFixed(0)} fps`;
  }

  getParams(): SimParams {
    return { ...this.params };
  }

  /**
   * Merge external param updates (e.g. canvas drag/zoom) and refresh widgets without firing onParamChange.
   */
  syncParamsFromExternal(next: SimParams): void {
    const touched = new Set(Object.keys(next));
    this.params = { ...this.params, ...next };
    for (const descriptor of this.paramSchema) {
      if (!touched.has(descriptor.key)) continue;
      const value = this.params[descriptor.key];
      if (value === undefined) continue;
      this.syncParamControl(descriptor, value);
    }
  }

  private render(options: ControlsOptions): void {
    this.container.innerHTML = "";
    this.container.classList.add("controls");
    this.paramInputs.clear();
    this.paramValueLabels.clear();

    const header = document.createElement("header");
    header.className = "controls__header";

    const title = document.createElement("h2");
    title.className = "controls__title";
    title.textContent = options.simName;
    header.appendChild(title);

    this.fpsLabel = document.createElement("span");
    this.fpsLabel.className = "controls__fps";
    this.fpsLabel.textContent = "— fps";
    header.appendChild(this.fpsLabel);

    this.container.appendChild(header);

    const transport = document.createElement("div");
    transport.className = "controls__transport";

    this.playPauseBtn = button("Pause", () => this.callbacks.onPlayPause());
    this.playPauseBtn.setAttribute("aria-pressed", "true");
    transport.appendChild(this.playPauseBtn);

    transport.appendChild(button("Reset", () => this.callbacks.onReset()));
    transport.appendChild(
      button("Maximise", () => this.callbacks.onToggleFullscreen()),
    );

    transport.appendChild(
      this.buildStepsControl(options.initialStepsPerFrame, (value) =>
        this.callbacks.onStepsPerFrameChange(value),
      ),
    );

    this.container.appendChild(transport);
    this.container.appendChild(this.buildPresetSection(options));
    this.container.appendChild(
      this.buildColourDashboard(options.fractalPaletteCycleUi ?? false),
    );

    if (options.paramSchema.length > 0) {
      const paramSection = document.createElement("section");
      paramSection.className = "controls__params";

      const paramHeading = document.createElement("h3");
      paramHeading.textContent = "Parameters";
      paramSection.appendChild(paramHeading);

      for (const descriptor of options.paramSchema) {
        const current = this.params[descriptor.key] ?? descriptor.default;
        paramSection.appendChild(this.buildParamControl(descriptor, current));
      }

      this.container.appendChild(paramSection);
    }
  }

  private buildStepsControl(
    initial: number,
    onChange: (value: number) => void,
  ): HTMLLabelElement {
    const wrap = document.createElement("label");
    wrap.className = "control control--number";

    const label = document.createElement("span");
    label.className = "control__label";
    label.textContent = "Render steps / frame";
    wrap.appendChild(label);

    const input = document.createElement("input");
    input.type = "range";
    input.min = "1";
    input.max = "10";
    input.step = "1";
    input.value = String(initial);
    wrap.appendChild(input);

    const value = document.createElement("span");
    value.className = "control__value";
    value.textContent = input.value;
    wrap.appendChild(value);

    input.addEventListener("input", () => {
      const next = Number(input.value);
      value.textContent = input.value;
      onChange(next);
    });

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

    const label = document.createElement("span");
    label.className = "control__label";
    label.textContent = descriptor.label;
    wrap.appendChild(label);

    const input = document.createElement("input");
    input.type = "range";
    if (descriptor.min !== undefined) input.min = String(descriptor.min);
    if (descriptor.max !== undefined) input.max = String(descriptor.max);
    if (descriptor.step !== undefined) input.step = String(descriptor.step);
    input.value = String(initial);
    this.paramInputs.set(descriptor.key, input);
    wrap.appendChild(input);

    const value = document.createElement("span");
    value.className = "control__value";
    value.textContent = formatNumber(initial, descriptor.step);
    this.paramValueLabels.set(descriptor.key, value);
    wrap.appendChild(value);

    input.addEventListener("input", () => {
      const next = Number(input.value);
      value.textContent = formatNumber(next, descriptor.step);
      this.params = { ...this.params, [descriptor.key]: next };
      this.callbacks.onParamChange(this.params);
    });

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
    input.checked = initial;
    this.paramInputs.set(descriptor.key, input);
    wrap.appendChild(input);

    const label = document.createElement("span");
    label.className = "control__label";
    label.textContent = descriptor.label;
    wrap.appendChild(label);

    input.addEventListener("change", () => {
      this.params = { ...this.params, [descriptor.key]: input.checked };
      this.callbacks.onParamChange(this.params);
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
      this.params = { ...this.params, [descriptor.key]: select.value };
      this.callbacks.onParamChange(this.params);
    });

    return wrap;
  }

  private buildPresetSection(options: ControlsOptions): HTMLElement {
    const section = document.createElement("section");
    section.className = "controls__presets";

    const heading = document.createElement("h3");
    heading.textContent = "Model presets";
    section.appendChild(heading);

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
    section.appendChild(wrap);

    return section;
  }

  private buildColourDashboard(fractalPaletteCycleUi: boolean): HTMLElement {
    const section = document.createElement("section");
    section.className = "controls__colour";

    const heading = document.createElement("h3");
    heading.textContent = "Colour";
    section.appendChild(heading);

    if (fractalPaletteCycleUi) {
      section.appendChild(this.buildFractalPaletteCycleExtras());
    }

    section.appendChild(
      this.buildPresetControl(this.colourOptions.preset, (preset) => {
        this.setColourOptions({ ...this.colourOptions, preset });
      }),
    );
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
      this.buildColourBooleanControl("Invert colours", this.colourOptions.invert, (invert) => {
        this.setColourOptions({ ...this.colourOptions, invert });
      }),
    );
    section.appendChild(
      this.buildColourRangeControl(
        "Dot size",
        this.displayOptions.dotSize,
        1,
        12,
        1,
        (dotSize) => {
          this.setDisplayOptions({ ...this.displayOptions, dotSize });
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

    return wrap;
  }

  private setColourOptions(next: ColourMapOptions): void {
    this.colourOptions = { ...next };
    this.callbacks.onColourChange(this.colourOptions);
  }

  private setDisplayOptions(next: DisplayOptions): void {
    this.displayOptions = {
      dotSize: Math.max(1, Math.min(12, Math.floor(next.dotSize))),
    };
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
    this.params = nextParams;
    this.callbacks.onParamChange(this.params);
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
