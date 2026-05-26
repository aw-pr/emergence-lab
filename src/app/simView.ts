import katex from "katex";
import { loadKernel } from "./loader.ts";
import { findEntry } from "./registry.ts";
import { Renderer, type DisplayOptions } from "./renderer.ts";
import {
  ControlsPanel,
  defaultParamsFromSchema,
  restorePersistedParams,
  type StepsControlOptions,
} from "./controls.ts";
import type { ParamDescriptor, SimKernel, SimParams } from "./types.ts";
import { presetsFor } from "./presets.ts";
import {
  defaultColourOptionsFor,
  sampleColour,
  type ColourMapOptions,
} from "./colormap.ts";
import {
  attachFractalCanvasInteractions,
  attachFractalPaletteCycleKeyboard,
  isFractalSlug,
} from "./fractalCanvas.ts";
import {
  getRenderMode,
  shouldUseSmoothCanvasPresentation,
} from "./renderModes.ts";

const FORMULAS_BY_SLUG: Readonly<Record<string, readonly string[]>> = {
  "gray-scott": [
    "\\frac{\\partial U}{\\partial t} = D_u\\nabla^2U - UV^2 + F(1-U)",
    "\\frac{\\partial V}{\\partial t} = D_v\\nabla^2V + UV^2 - (F+k)V",
  ],
  mandelbrot: [
    "z_{n+1} = z_n^2 + c,\\quad z_0 = 0,\\quad |z_n| > 2",
  ],
  "julia-set": [
    "z_{n+1} = z_n^2 + c,\\quad c = cRe + i\\,cIm,\\quad |z_n| > 2",
  ],
  "burning-ship": [
    "z_{n+1} = (|\\operatorname{Re}(z_n)| + i|\\operatorname{Im}(z_n)|)^2 + c,\\quad |z_n| > 2",
  ],
  "lorenz-attractor": [
    "\\dot{x} = \\sigma(y-x)",
    "\\dot{y} = x(\\rho-z)-y",
    "\\dot{z} = xy-\\beta z",
  ],
};

/**
 * A disposable handle returned by renderSimView. Call dispose() before
 * navigating away to release the kernel and stop the render loop.
 */
export interface SimViewHandle {
  dispose(): void;
}

export async function renderSimView(
  container: HTMLElement,
  slug: string,
): Promise<SimViewHandle> {
  container.innerHTML = "";

  const entry = findEntry(slug);
  if (!entry) {
    renderUnknownSim(container, slug);
    return { dispose() {} };
  }

  const layout = buildLayout(container, entry.name, slug);
  const renderMode = getRenderMode(slug);
  if (shouldUseSmoothCanvasPresentation(renderMode)) {
    layout.canvas.classList.add("sim-view__canvas--smooth");
  }

  let kernel: SimKernel;
  try {
    kernel = await loadKernel(slug);
  } catch (error) {
    renderLoadError(layout.body, slug, error);
    return { dispose() {} };
  }

  const params: SimParams = restorePersistedParams(slug, kernel.paramSchema, {
    ...defaultParamsFromSchema(kernel.paramSchema),
    ...defaultParamOverridesFor(slug),
  });
  let colourOptions: ColourMapOptions = defaultColourOptionsFor(slug, kernel.channelCount);
  let displayOptions: DisplayOptions = defaultDisplayOptionsFor(slug);
  const speedProfile = speedProfileFor(slug);
  let stepsPerFrame = speedProfile.initial;

  const renderer = new Renderer({
    canvas: layout.canvas,
    kernel,
    params,
    stepsPerFrame,
    colourOptions,
    displayOptions,
    renderMode,
  });

  const fractal = isFractalSlug(slug);

  const controls = new ControlsPanel({
    slug,
    container: layout.sidebar,
    simName: kernel.name,
    paramSchema: paramSchemaForControls(slug, kernel.paramSchema),
    paramPresets: presetsFor(slug),
    initialParams: params,
    initialStepsPerFrame: stepsPerFrame,
    stepsControl: speedProfile.control,
    initialColourOptions: colourOptions,
    initialDisplayOptions: displayOptions,
    fractalPaletteCycleUi: fractal,
    callbacks: {
      onPlayPause: () => {
        if (renderer.isRunning()) {
          renderer.pause();
        } else {
          renderer.play();
        }
        controls.setPlayState(renderer.isRunning());
      },
      onReset: () => {
        renderer.reset(controls.getParams());
      },
      onToggleFullscreen: () => {
        toggleFullscreen(layout.stage);
      },
      onStepsPerFrameChange: (value) => {
        stepsPerFrame = value;
        renderer.setStepsPerFrame(value);
      },
      onColourChange: (next) => {
        colourOptions = next;
        renderer.setColourOptions(next);
        renderLegend(layout.legend, kernel, colourOptions);
      },
      onDisplayChange: (next) => {
        displayOptions = next;
        renderer.setDisplayOptions(displayOptions);
      },
      onParamChange: (next) => {
        renderer.updateParams(next);
      },
    },
  });

  renderer.setFpsListener((fps) => controls.setFps(fps));
  renderer.setIterationListener((iterations) => controls.setIterations(iterations));

  renderer.play();
  controls.setPlayState(true);

  renderLegend(layout.legend, kernel, colourOptions);

  let detachFractalInteractions: (() => void) | undefined;
  let detachFractalPaletteKeys: (() => void) | undefined;
  if (fractal) {
    layout.canvas.classList.add("sim-view__canvas--fractal");
    const pushFractalParams = (next: SimParams): void => {
      renderer.updateParams(next);
      controls.syncParamsFromExternal(next);
    };
    detachFractalInteractions = attachFractalCanvasInteractions({
      slug,
      canvas: layout.canvas,
      paramSchema: kernel.paramSchema,
      getParams: () => controls.getParams(),
      setParams: pushFractalParams,
    });
    detachFractalPaletteKeys = attachFractalPaletteCycleKeyboard({
      slug,
      paramSchema: kernel.paramSchema,
      getParams: () => controls.getParams(),
      setParams: pushFractalParams,
    });
  }

  return {
    dispose() {
      detachFractalInteractions?.();
      detachFractalPaletteKeys?.();
      renderer.destroy();
    },
  };
}

interface SimLayout {
  body: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  sidebar: HTMLElement;
  legend: HTMLElement;
}

function buildLayout(container: HTMLElement, simName: string, slug: string): SimLayout {
  const page = document.createElement("section");
  page.className = "sim-view";

  const top = document.createElement("header");
  top.className = "sim-view__header";

  const back = document.createElement("a");
  back.className = "sim-view__back";
  back.href = "#/";
  back.textContent = "← Gallery";
  top.appendChild(back);

  const titleBlock = document.createElement("div");
  titleBlock.className = "sim-view__title-block";

  const title = document.createElement("h1");
  title.className = "sim-view__title";
  title.textContent = simName;
  titleBlock.appendChild(title);

  const formula = document.createElement("div");
  formula.className = "sim-view__formula";
  renderFormula(formula, slug);
  titleBlock.appendChild(formula);

  top.appendChild(titleBlock);

  page.appendChild(top);

  const body = document.createElement("div");
  body.className = "sim-view__body";

  const stage = document.createElement("div");
  stage.className = "sim-view__stage";

  const canvas = document.createElement("canvas");
  canvas.className = "sim-view__canvas";
  stage.appendChild(canvas);

  const legend = document.createElement("div");
  legend.className = "sim-view__legend";
  stage.appendChild(legend);

  body.appendChild(stage);

  const sidebar = document.createElement("aside");
  sidebar.className = "sim-view__sidebar";
  body.appendChild(sidebar);

  page.appendChild(body);
  container.appendChild(page);

  return { body, stage, canvas, sidebar, legend };
}

function renderFormula(container: HTMLElement, slug: string): void {
  container.innerHTML = "";
  const formulas = FORMULAS_BY_SLUG[slug];
  if (!formulas) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  for (const formula of formulas) {
    const line = document.createElement("div");
    line.className = "sim-view__formula-line";
    katex.render(formula, line, {
      displayMode: false,
      throwOnError: false,
    });
    container.appendChild(line);
  }
}

interface SpeedProfile {
  initial: number;
  control: StepsControlOptions;
}

function speedProfileFor(slug: string): SpeedProfile {
  const careful: StepsControlOptions = {
    label: "Simulation speed",
    min: 0.1,
    max: 4,
    step: 0.05,
  };
  const balanced: StepsControlOptions = {
    label: "Simulation speed",
    min: 0.25,
    max: 8,
    step: 0.25,
  };
  const growth: StepsControlOptions = {
    label: "Simulation speed",
    min: 0.5,
    max: 16,
    step: 0.5,
  };
  const fractal: StepsControlOptions = {
    label: "Colour cycle multiplier",
    min: 0.05,
    max: 2,
    step: 0.05,
  };

  switch (slug) {
    case "gray-scott":
      return { initial: 2, control: balanced };
    case "belousov-zhabotinsky":
      return { initial: 1.5, control: balanced };
    case "abelian-sandpile":
      return { initial: 4, control: growth };
    case "diffusion-limited-aggregation":
      return { initial: 6, control: growth };
    case "game-of-life":
      return { initial: 1, control: careful };
    case "elementary-cellular-automata":
      return { initial: 0.35, control: careful };
    case "brians-brain":
      return { initial: 1, control: careful };
    case "lorenz-attractor":
      return { initial: 0.35, control: careful };
    case "boids":
      return { initial: 1, control: careful };
    case "mandelbrot":
    case "julia-set":
    case "burning-ship":
      return { initial: 0.5, control: fractal };
    default:
      return { initial: 1, control: balanced };
  }
}

function defaultParamOverridesFor(slug: string): SimParams {
  switch (slug) {
    case "belousov-zhabotinsky":
      return { stepsPerFrame: 2 };
    case "lorenz-attractor":
      return { stepsPerFrame: 6, fade: 0.992 };
    case "diffusion-limited-aggregation":
      return { walkersPerStep: 96, maxWalkSteps: 256 };
    case "elementary-cellular-automata":
      return { stepsPerFrame: 1 };
    case "mandelbrot":
    case "julia-set":
    case "burning-ship":
      return { cycleSpeed: 0.0008 };
    default:
      return {};
  }
}

function defaultDisplayOptionsFor(slug: string): DisplayOptions {
  if (slug === "boids") {
    return { dotSize: 2 };
  }
  return { dotSize: 1 };
}

function paramSchemaForControls(
  slug: string,
  schema: readonly ParamDescriptor[],
): readonly ParamDescriptor[] {
  const fractal = isFractalSlug(slug);
  if (slug !== "lorenz-attractor" && !fractal) return schema;

  return schema.map((descriptor) => {
    if (fractal && descriptor.key === "cycleSpeed" && descriptor.type === "number") {
      return {
        ...descriptor,
        label: "Base cycle speed",
        min: 0,
        max: 0.02,
        step: 0.0001,
      };
    }
    if (descriptor.key === "fade" && descriptor.type === "number") {
      return {
        ...descriptor,
        label: "Trail history",
        min: 0.94,
        max: 0.999,
        step: 0.001,
      };
    }
    if (descriptor.key === "stepsPerFrame" && descriptor.type === "number") {
      return {
        ...descriptor,
        label: "Trace detail",
        min: 1,
        max: 32,
        step: 1,
      };
    }
    return descriptor;
  });
}

function toggleFullscreen(element: HTMLElement): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  void element.requestFullscreen();
}

function renderLegend(
  container: HTMLElement,
  kernel: SimKernel,
  colourOptions: ColourMapOptions,
): void {
  container.innerHTML = "";
  for (let i = 0; i < kernel.channelCount; i += 1) {
    const swatch = document.createElement("span");
    swatch.className = "legend__item";

    const dot = document.createElement("span");
    dot.className = "legend__dot";
    dot.style.background = sampleColour(i, kernel.channelCount, colourOptions);
    swatch.appendChild(dot);

    const label = document.createElement("span");
    label.className = "legend__label";
    label.textContent = kernel.channelLabels[i] ?? `ch${i}`;
    swatch.appendChild(label);

    container.appendChild(swatch);
  }
}

function renderUnknownSim(container: HTMLElement, slug: string): void {
  const wrap = document.createElement("section");
  wrap.className = "sim-view sim-view--error";
  wrap.innerHTML = `
    <a class="sim-view__back" href="#/">← Gallery</a>
    <h1>Unknown simulation</h1>
    <p>No simulation is registered with the slug <code>${escape(slug)}</code>.</p>
  `;
  container.appendChild(wrap);
}

function renderLoadError(container: HTMLElement, slug: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const wrap = document.createElement("section");
  wrap.className = "sim-view sim-view--error";
  wrap.innerHTML = `
    <a class="sim-view__back" href="#/">← Gallery</a>
    <h1>Failed to load <code>${escape(slug)}</code></h1>
    <p>${escape(message)}</p>
    <p class="sim-view__hint">
      Make sure <code>src/sims/${escape(slug)}/kernel.ts</code> exists and exports a class
      implementing <code>SimKernel</code>.
    </p>
  `;
  container.appendChild(wrap);
}

function escape(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
