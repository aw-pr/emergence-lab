import { loadKernel } from "./loader.ts";
import { findEntry } from "./registry.ts";
import { Renderer, type DisplayOptions } from "./renderer.ts";
import { ControlsPanel, defaultParamsFromSchema } from "./controls.ts";
import type { SimKernel, SimParams } from "./types.ts";
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

  const layout = buildLayout(container, entry.name);

  let kernel: SimKernel;
  try {
    kernel = await loadKernel(slug);
  } catch (error) {
    renderLoadError(layout.body, slug, error);
    return { dispose() {} };
  }

  const params: SimParams = defaultParamsFromSchema(kernel.paramSchema);
  let colourOptions: ColourMapOptions = defaultColourOptionsFor(slug, kernel.channelCount);
  let displayOptions: DisplayOptions = defaultDisplayOptionsFor(slug);
  let stepsPerFrame = defaultStepsPerFrameFor(slug);

  const renderer = new Renderer({
    canvas: layout.canvas,
    kernel,
    params,
    stepsPerFrame,
    colourOptions,
    displayOptions,
  });

  const fractal = isFractalSlug(slug);

  const controls = new ControlsPanel({
    container: layout.sidebar,
    simName: kernel.name,
    paramSchema: kernel.paramSchema,
    paramPresets: presetsFor(slug),
    initialParams: params,
    initialStepsPerFrame: stepsPerFrame,
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

function buildLayout(container: HTMLElement, simName: string): SimLayout {
  const page = document.createElement("section");
  page.className = "sim-view";

  const top = document.createElement("header");
  top.className = "sim-view__header";

  const back = document.createElement("a");
  back.className = "sim-view__back";
  back.href = "#/";
  back.textContent = "← Gallery";
  top.appendChild(back);

  const title = document.createElement("h1");
  title.className = "sim-view__title";
  title.textContent = simName;
  top.appendChild(title);

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

function defaultStepsPerFrameFor(slug: string): number {
  switch (slug) {
    case "gray-scott":
      return 2;
    case "belousov-zhabotinsky":
    case "lorenz-attractor":
      return 1;
    case "game-of-life":
    case "elementary-cellular-automata":
      return 4;
    case "diffusion-limited-aggregation":
    case "brians-brain":
      return 3;
    default:
      return 1;
  }
}

function defaultDisplayOptionsFor(slug: string): DisplayOptions {
  if (slug === "boids") {
    return { dotSize: 6 };
  }
  if (slug === "lorenz-attractor") {
    return { dotSize: 4 };
  }
  return { dotSize: 1 };
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
