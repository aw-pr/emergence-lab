import katex from "katex";
import { aboutFor, type SimAbout } from "./about.ts";
import { bakesFor, type BakedEntry } from "./bakedManifest.ts";
import { setSimDocumentTitle } from "./docTitle.ts";
import { getChrome, siteOwnsChrome } from "./chrome.ts";
import { isEditableKeyboardEvent } from "./keyboardTarget.ts";
import { isFramedBySite } from "./embed.ts";
import { loadKernel } from "./loader.ts";
import { findEntry } from "./registry.ts";
import {
  Renderer,
  RESOLUTION_TARGETS,
  type DisplayOptions,
  type ResolutionPreset,
} from "./renderer.ts";
import {
  collapsibleSection,
  ControlsPanel,
  defaultParamsFromSchema,
  restorePersistedParams,
  type StepsControlOptions,
} from "./controls.ts";
import { loadRenderOptions, loadResolution } from "./persistence.ts";

/** The "build it in the browser" option of the logistic-Mandelbrot `modelSource`. */
const LIVE_MODEL_SOURCE = "live";

/**
 * Kernel params hoisted into the View section, per sim: everything about how
 * the object is drawn rather than what is simulated. Sims not listed keep
 * their whole schema below the View section.
 */
const VIEW_PARAM_KEYS: Readonly<Record<string, readonly string[]>> = {
  "logistic-mandelbrot": [
    "colourMode",
    "exposure",
    "edgeGlow",
    "tailRefinement",
    "pointDensity",
    "autoRotate",
    "continuousSpin",
    "cycleSpeed",
    "cascadeReveal",
    "cascadeDuration",
    "realSliceOnly",
    "modelSource",
  ],
  boids: ["pointSize"],
  "particle-life": ["pointSize"],
  "diffusion-limited-aggregation": ["colourByAge"],
  "game-of-life": ["ageShading"],
  "lorenz-attractor": ["fade", "ribbonWidth", "colourByHeight", "cycleSpeed"],
  mandelbrot: ["palettePhase", "cycleSpeed"],
  "julia-set": ["palettePhase", "cycleSpeed"],
  "burning-ship": ["palettePhase", "cycleSpeed"],
};

/**
 * Named, collapsible sections for the remaining kernel params, per sim. Keys
 * left out of every group land in the trailing "Parameters" section; sims
 * with a handful of params skip grouping entirely rather than dressing three
 * sliders in three headings.
 */
const PARAM_GROUPS: Readonly<
  Record<string, readonly { label: string; keys: readonly string[] }[]>
> = {
  "logistic-mandelbrot": [
    { label: "Light beam", keys: ["realAxisSweep", "sweepSpeed"] },
    {
      label: "Sampling",
      keys: ["warmupIterations", "sampleCount", "plottedIterations"],
    },
  ],
  boids: [
    { label: "Flock", keys: ["boidCount", "maxSpeed"] },
    { label: "Perception", keys: ["visualRadius", "separationRadius"] },
    { label: "Steering", keys: ["alignment", "cohesion", "separation"] },
  ],
  "particle-life": [
    { label: "Population", keys: ["particleCount", "species"] },
    {
      label: "Forces",
      keys: ["rmax", "rmin", "forceScale", "matrixBias", "friction"],
    },
  ],
  physarum: [
    { label: "Agents", keys: ["agentCount", "moveSpeed", "turnSpeed"] },
    { label: "Sensing", keys: ["sensorAngle", "sensorDistance"] },
    { label: "Trail", keys: ["depositAmount", "evaporation"] },
  ],
  "gray-scott": [
    { label: "Diffusion", keys: ["Du", "Dv"] },
    { label: "Reaction", keys: ["F", "k"] },
  ],
  "belousov-zhabotinsky": [
    { label: "Diffusion", keys: ["diffusionA", "diffusionB", "diffusionC"] },
    { label: "Reaction", keys: ["feed", "kill"] },
  ],
  "game-of-life": [
    {
      label: "Rules",
      keys: ["birthMin", "birthMax", "surviveMin", "surviveMax"],
    },
    { label: "Seeding", keys: ["seedDensity", "sparkRate"] },
  ],
  "diffusion-limited-aggregation": [
    { label: "Growth", keys: ["walkersPerStep", "maxWalkSteps", "stickiness"] },
    { label: "Seeding", keys: ["spawnRadius", "seedCount"] },
  ],
  "kuramoto-oscillators": [
    { label: "Coupling", keys: ["coupling", "couplingMode"] },
    { label: "Oscillators", keys: ["frequencySpread", "noise"] },
    { label: "Simulation", keys: ["timestep", "initialPattern"] },
  ],
  lenia: [
    { label: "Growth", keys: ["mu", "sigma", "muDrift"] },
    { label: "Kernel & timing", keys: ["radius", "dt", "stepsPerFrame"] },
  ],
  "lorenz-attractor": [
    { label: "Attractor", keys: ["attractor", "sigma", "rho", "beta"] },
  ],
  "ising-model": [
    { label: "Physics", keys: ["temperature", "coupling", "externalField"] },
  ],
  mandelbrot: [
    { label: "Navigation", keys: ["centerX", "centerY", "zoom"] },
    { label: "Detail", keys: ["maxIterations", "autoIterations"] },
  ],
  "julia-set": [
    { label: "Seed", keys: ["cRe", "cIm"] },
    { label: "Navigation", keys: ["centerX", "centerY", "zoom"] },
    { label: "Detail", keys: ["maxIterations", "autoIterations"] },
  ],
  "burning-ship": [
    { label: "Navigation", keys: ["centerX", "centerY", "zoom"] },
    { label: "Detail", keys: ["maxIterations", "autoIterations"] },
  ],
};
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
  attachLogisticMandelbrotCanvasInteractions,
  isFractalSlug,
  type Orbit3DMarkerClientSnapshot,
} from "./fractalCanvas.ts";
import { attachPointerImpulse } from "./pointerImpulse.ts";
import {
  getRenderMode,
  shouldUseSmoothCanvasPresentation,
} from "./renderModes.ts";
import { isFractalViewSlug, zoomAroundPoint } from "./fractalView.ts";
import { qualityProfileFor } from "./qualityProfiles.ts";

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
  "belousov-zhabotinsky": [
    "\\dot{A} = D_a\\nabla^2A + f(1-A) + CA - AB",
    "\\dot{B} = D_b\\nabla^2B + AB - BC - kB",
    "\\dot{C} = D_c\\nabla^2C + BC - CA - \\tfrac{k}{2}(C-0.35)",
  ],
  "abelian-sandpile": [
    "z_i \\ge 4:\\quad z_i \\to z_i - 4,\\ \\ z_{\\partial i} \\to z_{\\partial i} + 1",
  ],
  "ising-model": [
    "H = -J\\sum_{\\langle i,j\\rangle}s_i s_j - h\\sum_i s_i,\\quad s_i\\in\\{-1,+1\\}",
  ],
  "kuramoto-oscillators": [
    "\\dot{\\theta_i} = \\omega_i + \\frac{K}{N}\\sum_j \\sin(\\theta_j-\\theta_i)",
  ],
  "elementary-cellular-automata": [
    "s_i^{\\,t+1} = R\\!\\left(s_{i-1}^{\\,t},\\, s_i^{\\,t},\\, s_{i+1}^{\\,t}\\right)",
  ],
  "game-of-life": [
    "\\text{Birth: } n = 3 \\qquad \\text{Survive: } n \\in \\{2,3\\}",
  ],
  "brians-brain": [
    "\\text{off} \\to \\text{on if } n_{\\text{on}} = 2,\\quad \\text{on} \\to \\text{dying} \\to \\text{off}",
  ],
  "boids": [
    "\\vec{v}\\,' = \\vec{v} + w_s\\,\\vec{s} + w_a\\,\\vec{a} + w_c\\,\\vec{c}",
  ],
  "diffusion-limited-aggregation": [
    "x_{t+1} = x_t + \\xi,\\quad \\text{stick when adjacent with } p = \\text{stickiness}",
  ],
};

/**
 * A disposable handle returned by renderSimView. Call dispose() before
 * navigating away to release the kernel and stop the render loop.
 */
export interface SimViewHandle {
  dispose(): void;
  /**
   * Toggle immersive mode (the top-layer overlay that hides the description
   * header and parameter sidebar). Optional because the early-error paths
   * (unknown sim, kernel load failure) return before the toggle exists.
   */
  toggleImmersive?(): void;
}

export async function renderSimView(
  container: HTMLElement,
  slug: string,
  variant?: string,
): Promise<SimViewHandle> {
  container.innerHTML = "";

  const entry = findEntry(slug);
  if (!entry) {
    setSimDocumentTitle(null);
    renderUnknownSim(container, slug);
    return { dispose() {} };
  }

  // A variant selects a named configuration within the same kernel (e.g. which
  // strange attractor). Falls back to the base entry when absent or unknown.
  const variantDef = variant
    ? entry.variants?.find((v) => v.variant === variant)
    : undefined;

  const name = variantDef?.name ?? entry.name;
  setSimDocumentTitle(name);

  const about = aboutFor(slug, variantDef?.variant);
  const layout = buildLayout(
    container,
    {
      name,
      family: entry.family,
      subtitle: variantDef?.subtitle ?? entry.subtitle,
      about,
    },
    slug,
  );
  const renderMode = getRenderMode(slug);
  if (shouldUseSmoothCanvasPresentation(renderMode)) {
    layout.canvas.classList.add("sim-view__canvas--smooth");
  }

  // Immersive mode (header gone, settings as an auto-hiding edge drawer) is a
  // CSS overlay first and native fullscreen second: requestFullscreen is
  // denied in some contexts (no transient activation, embedded pages, iOS has
  // no API at all), so the Maximise button never depends on it. The class
  // also engages for browser/OS-level fullscreen, detected by the viewport
  // matching the screen — standalone only, so an embedded lab can't hijack a
  // full-screened host page.
  // Promotes the immersive body into the UA's top layer, escaping every
  // containing block/z-index in the document — including a host page's own
  // transformed ancestor, which can trap a plain fixed+z-index overlay when
  // this app is embedded (see the fixed/z-index fallback in styles.css for
  // non-popover browsers). The `popover` attribute must only exist while
  // immersive is forced: the UA rule `[popover]:not(:popover-open){display:
  // none}` would otherwise hide the sim in normal layout.
  const enterTopLayer = (body: HTMLElement) => {
    if (!("showPopover" in body)) return;
    body.setAttribute("popover", "manual");
    try {
      body.showPopover();
    } catch {
      // Already open, or the UA refuses mid-transition — the fixed/z-index
      // fallback below still covers the viewport either way.
    }
  };
  const exitTopLayer = (body: HTMLElement) => {
    if (!("showPopover" in body)) return;
    try {
      body.hidePopover();
    } catch {
      // Already closed.
    }
    body.removeAttribute("popover");
  };
  let immersiveForced = false;
  const immersiveAbort = new AbortController();
  const updateImmersive = () => {
    const native = document.fullscreenElement === layout.body;
    const windowFullscreen =
      !siteOwnsChrome() &&
      window.innerWidth === window.screen.width &&
      window.innerHeight === window.screen.height;
    const immersive = immersiveForced || native || windowFullscreen;
    layout.page.classList.toggle("sim-view--immersive", immersive);
    if (!immersive) {
      // Reset the drawer so re-entering immersive always starts parked,
      // rather than reopening however it was left last time.
      layout.sidebar.classList.remove("sim-view__sidebar--open");
      const handle = layout.sidebar.querySelector<HTMLButtonElement>(
        ".sim-view__drawer-handle",
      );
      handle?.setAttribute("aria-expanded", "false");
      handle?.setAttribute("aria-label", "Show settings");
    }
  };
  const toggleImmersive = () => {
    if (immersiveForced || document.fullscreenElement) {
      immersiveForced = false;
      exitTopLayer(layout.body);
      if (document.fullscreenElement) void document.exitFullscreen();
      updateImmersive();
      return;
    }
    immersiveForced = true;
    updateImmersive();
    enterTopLayer(layout.body);
    // Opportunistic: hides the browser chrome too when the browser allows it.
    layout.body.requestFullscreen?.().catch(() => {});
    // The click leaves focus on the Maximise button inside the sidebar, whose
    // :focus-within would pin the drawer open; drop it so the panel parks.
    // Embedded inline, the app lives in a shadow root, so the focused button is
    // the SHADOW root's activeElement — document.activeElement is only the host
    // element. Blur the deepest active node so both mounts park the drawer.
    const root = layout.body.getRootNode() as Document | ShadowRoot;
    const focused = root.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
  };
  layout.immersiveExit.addEventListener("click", toggleImmersive, {
    signal: immersiveAbort.signal,
  });
  document.addEventListener(
    "fullscreenchange",
    () => {
      // The overlay is the source of truth; native fullscreen is only an
      // opportunistic bonus. Do NOT clear immersiveForced when fullscreen
      // exits: some browsers (seen on macOS Chrome) enter fullscreen on the
      // Maximise click and then bounce straight back out, firing an exit event
      // milliseconds later. Tearing down immersive on that spurious exit made
      // the header snap back the instant the user pressed Maximise. Leaving
      // immersiveForced set keeps the in-window overlay whether or not native
      // fullscreen ever sticks — exactly what "the button never depends on it"
      // was meant to guarantee. Explicit exits (Maximise again, Esc) still
      // clear it below.
      // Entering native fullscreen runs the UA's "hide all popovers" step, so
      // the top-layer popover is gone by the time fullscreen exits — re-promote
      // it here or the overlay would be left on the fixed/z-index fallback,
      // which a host page's transformed ancestor can trap.
      if (immersiveForced && !document.fullscreenElement) {
        enterTopLayer(layout.body);
      }
      updateImmersive();
    },
    { signal: immersiveAbort.signal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      // Esc exits immersive. When native fullscreen is active the browser
      // swallows the first Esc to leave fullscreen (immersiveForced stays set,
      // so the overlay persists); this handler then catches the next Esc, once
      // no fullscreen element remains, and drops the overlay too.
      if (
        event.key === "Escape" &&
        immersiveForced &&
        !document.fullscreenElement
      ) {
        immersiveForced = false;
        exitTopLayer(layout.body);
        updateImmersive();
      }
    },
    { signal: immersiveAbort.signal },
  );
  window.addEventListener("resize", updateImmersive, {
    signal: immersiveAbort.signal,
  });
  layout.body.addEventListener(
    "toggle",
    (event) => {
      // A popover `toggle` event with newState "closed" while immersiveForced
      // is still true means the UA closed it out from under us — in practice
      // native fullscreen entry, which runs "hide all popovers" (and a macOS
      // Chrome fullscreen bounce can enter AND exit again before this async
      // event even fires, so the fullscreen element may already be gone).
      // Explicit exits clear immersiveForced before hiding, so any close seen
      // here is UA-initiated: re-promote rather than tear down, or the overlay
      // would be left on the fixed/z-index fallback a host page can trap.
      // While a fullscreen element still exists, defer to the fullscreenchange
      // handler, which re-promotes on exit.
      if (
        immersiveForced &&
        (event as ToggleEvent).newState === "closed" &&
        !document.fullscreenElement
      ) {
        enterTopLayer(layout.body);
      }
    },
    { signal: immersiveAbort.signal },
  );
  updateImmersive();

  let kernel: SimKernel;
  try {
    kernel = await loadKernel(slug);
  } catch (error) {
    renderLoadError(layout.body, slug, error);
    return { dispose() {} };
  }

  const factoryParams: SimParams = {
    ...defaultParamsFromSchema(kernel.paramSchema),
    ...defaultParamOverridesFor(slug),
    ...(variantDef?.params ?? {}),
  };
  const restored: SimParams = restorePersistedParams(
    slug,
    kernel.paramSchema,
    factoryParams,
  );
  // Variants share one persistence key (the slug), so the variant's selector
  // param must win over any restored value—otherwise picking Rössler could
  // reopen as a previously-saved Lorenz.
  const params: SimParams = variantDef
    ? { ...restored, ...variantDef.params }
    : restored;
  // Prebaked clouds are machine-local, so the option list is only known once
  // the manifest resolves; a persisted selection naming a bake this machine
  // does not have falls back to the live build.
  const controlsSchema = paramSchemaForControls(
    slug,
    kernel.paramSchema,
    await bakesFor(slug),
  );
  const modelSource = controlsSchema.find((p) => p.key === "modelSource");
  if (
    typeof params.modelSource === "string" &&
    !(modelSource?.options ?? [LIVE_MODEL_SOURCE]).includes(params.modelSource)
  ) {
    params.modelSource = LIVE_MODEL_SOURCE;
  }
  const factoryColourOptions: ColourMapOptions = defaultColourOptionsFor(
    slug,
    kernel.channelCount,
  );
  let colourOptions: ColourMapOptions = restoreRenderOptions(
    slug,
    factoryColourOptions,
  );
  const factoryDisplayOptions: DisplayOptions = defaultDisplayOptionsFor(slug);
  let displayOptions: DisplayOptions = restoreDisplayOptions(
    slug,
    factoryDisplayOptions,
  );
  const speedProfile = speedProfileFor(slug);
  let stepsPerFrame = speedProfile.initial;
  const fractal = isFractalSlug(slug);
  const qualityProfile = qualityProfileFor(slug, renderMode);
  const defaultResolution = qualityProfile.defaultPreset;
  const resolution = resolveResolution(slug, defaultResolution);

  // Sims whose kernel reports run completion (currently DLA) can auto-cycle
  // into a fresh randomised run when they finish. On by default when supported.
  const autoCycleSupported =
    typeof (kernel as { isComplete?: unknown }).isComplete === "function";
  const defaultAutoCycle = true;
  const initialAutoCycle = autoCycleSupported
    ? resolveAutoCycle(slug, defaultAutoCycle)
    : false;

  const renderer = new Renderer({
    canvas: layout.canvas,
    kernel,
    params,
    stepsPerFrame,
    colourOptions,
    displayOptions,
    renderMode,
    resolution,
    autoCycle: initialAutoCycle,
    qualityProfile,
  });

  const controls = new ControlsPanel({
    slug,
    container: layout.sidebar,
    simName: kernel.name,
    paramSchema: controlsSchema,
    paramPresets: presetsFor(slug),
    initialParams: params,
    defaultParams: factoryParams,
    initialStepsPerFrame: stepsPerFrame,
    stepsControl: speedProfile.control,
    initialColourOptions: colourOptions,
    defaultColourOptions: factoryColourOptions,
    initialDisplayOptions: displayOptions,
    defaultDisplayOptions: factoryDisplayOptions,
    initialResolution: resolution,
    defaultResolution,
    showResolutionControl: !fractal,
    showExtremeResolution: slug === "logistic-mandelbrot",
    showTrailControl: renderMode === "particle",
    showDotSizeControl: !kernel.paramSchema.some((p) => p.key === "pointSize"),
    showAutoCycleControl: autoCycleSupported,
    initialAutoCycle,
    defaultAutoCycle,
    fractalPaletteCycleUi: fractal,
    viewParamKeys: VIEW_PARAM_KEYS[slug] ?? [],
    paramGroups: PARAM_GROUPS[slug] ?? [],
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
        if (slug === "logistic-mandelbrot") renderer.resetOrbit3dCamera();
        renderer.reset(controls.getParams());
      },
      onToggleFullscreen: toggleImmersive,
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
      onResolutionChange: (preset) => {
        renderer.setResolution(preset);
      },
      onAutoCycleChange: (enabled) => {
        renderer.setAutoCycle(enabled);
      },
    },
  });

  layout.sidebar.prepend(layout.drawerHandle);

  const orbitMarkerReadout =
    slug === "logistic-mandelbrot"
      ? buildOrbitMarkerReadout(slug, layout.sidebar)
      : undefined;

  renderer.setParamsListener((next) => {
    controls.syncParamsFromExternal(next, false);
  });
  renderer.setOrbit3dMarkerListener((marker) => orbitMarkerReadout?.set(marker));
  controls.syncParamsFromExternal(renderer.currentParams(), false);

  renderer.setFpsListener((fps) => controls.setFps(fps));
  renderer.setIterationListener((iterations) => controls.setIterations(iterations));

  renderer.play();
  controls.setPlayState(true);

  renderLegend(layout.legend, kernel, colourOptions);

  let detachFractalInteractions: (() => void) | undefined;
  let detachFractalPaletteKeys: (() => void) | undefined;
  let detachFractalViewKeys: (() => void) | undefined;
  let detachOrbit3dInteractions: (() => void) | undefined;
  let detachPointerImpulse: (() => void) | undefined;
  if (!fractal && renderer.supportsImpulse()) {
    // Non-fractal sims whose kernel exposes applyImpulse: click/drag pokes the
    // field under the pointer. Fractals reserve pointer gestures for pan/zoom.
    layout.canvas.classList.add("sim-view__canvas--interactive");
    detachPointerImpulse = attachPointerImpulse(layout.canvas, renderer);
    // The note lives on the same condition as the handler, so it can never
    // advertise a poke the sim would ignore. It reads between the model's
    // origin and its equations, so insert it rather than append.
    if (about?.interaction && layout.about) {
      layout.about.insertBefore(
        buildAboutSection("Try it", about.interaction),
        layout.about.querySelector(`.${MATHS_SECTION_CLASS}`),
      );
      syncAboutColumns(layout.about);
    }
  }
  if (fractal) {
    layout.canvas.classList.add("sim-view__canvas--fractal");
    const updateZoomHud = (next: SimParams): void => {
      if (!layout.fractalHud) return;
      const raw = next.zoom;
      const zoom = typeof raw === "number" && Number.isFinite(raw) ? raw : 1;
      layout.fractalHud.zoomLabel.value = formatZoom(zoom);
      layout.fractalHud.root.dataset.quality =
        layout.canvas.dataset.renderQuality ?? "full";
    };
    const previewFractalParams = (next: SimParams): void => {
      renderer.previewParams(next);
      controls.syncParamsFromExternal(next, false);
      updateZoomHud(next);
    };
    const commitFractalParams = (next: SimParams): void => {
      renderer.commitParams(next);
      controls.syncParamsFromExternal(next);
      updateZoomHud(next);
    };
    detachFractalInteractions = attachFractalCanvasInteractions({
      slug,
      canvas: layout.canvas,
      paramSchema: kernel.paramSchema,
      getParams: () => controls.getParams(),
      previewParams: previewFractalParams,
      commitParams: commitFractalParams,
    });
    detachFractalPaletteKeys = attachFractalPaletteCycleKeyboard({
      slug,
      paramSchema: kernel.paramSchema,
      getParams: () => controls.getParams(),
      setParams: commitFractalParams,
    });

    if (layout.fractalHud && isFractalViewSlug(slug)) {
      const zoomDescriptor = kernel.paramSchema.find((p) => p.key === "zoom");
      const minZoom = zoomDescriptor?.type === "number" ? zoomDescriptor.min ?? 0.25 : 0.25;
      const maxZoom = zoomDescriptor?.type === "number" ? zoomDescriptor.max ?? 1e8 : 1e8;
      const zoomBy = (factor: number): void => {
        const current = controls.getParams();
        const zoom = typeof current.zoom === "number" ? current.zoom : 1;
        const centerX = typeof current.centerX === "number" ? current.centerX : 0;
        const centerY = typeof current.centerY === "number" ? current.centerY : 0;
        const target = Math.min(maxZoom, Math.max(minZoom, zoom * factor));
        const next = zoomAroundPoint(
          slug,
          { centerX, centerY, zoom },
          layout.canvas.width,
          layout.canvas.height,
          {
            x: (layout.canvas.width - 1) / 2,
            y: (layout.canvas.height - 1) / 2,
          },
          target,
        );
        commitFractalParams({ ...current, ...next });
      };
      const home = (): void => {
        commitFractalParams({
          ...controls.getParams(),
          centerX: factoryParams.centerX,
          centerY: factoryParams.centerY,
          zoom: factoryParams.zoom,
        });
      };

      layout.fractalHud.zoomIn.addEventListener("click", () => zoomBy(2));
      layout.fractalHud.zoomOut.addEventListener("click", () => zoomBy(0.5));
      layout.fractalHud.home.addEventListener("click", home);

      const keyAbort = new AbortController();
      window.addEventListener(
        "keydown",
        (event) => {
          if (isEditableKeyboardEvent(event) || event.metaKey || event.ctrlKey || event.altKey) return;
          if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            zoomBy(2);
          } else if (event.key === "-") {
            event.preventDefault();
            zoomBy(0.5);
          } else if (event.key === "0") {
            event.preventDefault();
            home();
          }
        },
        { signal: keyAbort.signal, capture: true },
      );
      detachFractalViewKeys = () => keyAbort.abort();
      updateZoomHud(controls.getParams());
    }
  }
  if (slug === "logistic-mandelbrot") {
    layout.canvas.classList.add("sim-view__canvas--interactive");
    if (about?.interaction && layout.about) {
      layout.about.insertBefore(
        buildAboutSection("Try it", about.interaction),
        layout.about.querySelector(".sim-view__about-section--maths"),
      );
      syncAboutColumns(layout.about);
    }
    detachOrbit3dInteractions = attachLogisticMandelbrotCanvasInteractions({
      slug,
      canvas: layout.canvas,
      getMarker: () => renderer.orbit3dMarker(),
      moveMarker: (clientX, clientY) =>
        renderer.moveOrbit3dMarker(clientX, clientY),
      orbit: (deltaCssX, deltaCssY) =>
        renderer.orbitOrbit3d(deltaCssX, deltaCssY),
      dolly: (factor) => renderer.dollyOrbit3d(factor),
      pan: (deltaCssX, deltaCssY) => renderer.panOrbit3d(deltaCssX, deltaCssY),
      resetCamera: () => renderer.resetOrbit3dCamera(),
      onMarkerChange: (marker) => orbitMarkerReadout?.set(marker),
    });
  }

  return {
    dispose() {
      immersiveAbort.abort();
      exitTopLayer(layout.body);
      detachFractalInteractions?.();
      detachFractalPaletteKeys?.();
      detachFractalViewKeys?.();
      detachOrbit3dInteractions?.();
      detachPointerImpulse?.();
      renderer.destroy();
    },
    toggleImmersive,
  };
}

interface SimLayout {
  page: HTMLElement;
  body: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  sidebar: HTMLElement;
  /** Attached to the sidebar after ControlsPanel renders — its render wipes
   *  the sidebar's children, so mounting earlier would lose the handle. */
  drawerHandle: HTMLElement;
  /** Immersive-only exit control (an on-screen way back besides Esc/Maximise
   *  again — the only option on touch, which has no Esc). Click listener is
   *  attached in renderSimView, where toggleImmersive is in scope. */
  immersiveExit: HTMLButtonElement;
  legend: HTMLElement;
  /** The narrative panel, so the pointer wiring can add its own note to it. */
  about?: HTMLElement;
  fractalHud?: FractalHud;
}

interface FractalHud {
  root: HTMLElement;
  zoomLabel: HTMLOutputElement;
  zoomIn: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
  home: HTMLButtonElement;
}

interface OrbitMarkerReadout {
  set(marker: Orbit3DMarkerClientSnapshot): void;
}

function buildOrbitMarkerReadout(
  slug: string,
  container: HTMLElement,
): OrbitMarkerReadout {
  const section = collapsibleSection(slug, "Orbit marker", "controls__params");

  const cRow = document.createElement("div");
  cRow.className = "control control--enum";
  const cLabel = document.createElement("span");
  cLabel.className = "control__label";
  cLabel.textContent = "c";
  const cValue = document.createElement("output");
  cValue.className = "control__value";
  cValue.setAttribute("aria-live", "polite");
  cRow.append(cLabel, cValue);
  section.appendChild(cRow);

  const periodRow = document.createElement("div");
  periodRow.className = "control control--enum";
  const periodLabel = document.createElement("span");
  periodLabel.className = "control__label";
  periodLabel.textContent = "Detected period";
  const periodValue = document.createElement("output");
  periodValue.className = "control__value";
  periodValue.setAttribute("aria-live", "polite");
  periodRow.append(periodLabel, periodValue);
  section.appendChild(periodRow);
  container.appendChild(section);

  return {
    set(marker) {
      const sign = marker.im < 0 ? "−" : "+";
      cValue.value = `${marker.re.toFixed(4)} ${sign} ${Math.abs(marker.im).toFixed(4)}i`;
      periodValue.value = marker.period > 0 ? String(marker.period) : "none";
    },
  };
}

function formatZoom(zoom: number): string {
  const suffixes = ["", "K", "M", "B"] as const;
  let value = Math.max(0, zoom);
  let suffix = 0;
  while (value >= 1000 && suffix < suffixes.length - 1) {
    value /= 1000;
    suffix += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `×${value.toFixed(digits)}${suffixes[suffix]}`;
}

interface SimHeader {
  name: string;
  family?: string;
  subtitle?: string;
  about?: SimAbout;
}

function buildLayout(
  container: HTMLElement,
  header: SimHeader,
  slug: string,
): SimLayout {
  const page = document.createElement("section");
  page.className = "sim-view";

  const top = document.createElement("header");
  top.className = "sim-view__header";

  const back = document.createElement("a");
  back.className = "sim-view__back";
  // Hosted by the site (framed or embedded inline), the app's internal gallery
  // is a redundant copy of the site's /labs page, so send visitors there
  // instead. Standalone (and direct /labs/app/ visits) keep the in-app gallery.
  if (siteOwnsChrome()) {
    back.href = getChrome().siteGalleryHref;
    // Only the iframe shell needs to break out of its frame.
    if (isFramedBySite()) back.target = "_top";
  } else {
    back.href = "#/";
  }
  back.textContent = "← Gallery";
  top.appendChild(back);

  // Hosted by the site, the bar directly above already names the sim, so a
  // title block here is a second copy of it sitting in a column of its own
  // with the narrative's full height beside it. Drop it and let the narrative
  // have the width. Standalone there is no bar, so the title stays.
  const titleBlock = document.createElement("div");
  titleBlock.className = "sim-view__title-block";
  titleBlock.hidden = siteOwnsChrome();

  const title = document.createElement("h1");
  title.className = "sim-view__title";
  title.textContent = header.name;
  titleBlock.appendChild(title);

  if (header.family || header.subtitle) {
    const subtitle = document.createElement("p");
    subtitle.className = "sim-view__subtitle";
    if (header.family) {
      const tag = document.createElement("span");
      tag.className = "sim-view__family";
      tag.textContent = header.family;
      subtitle.appendChild(tag);
    }
    if (header.subtitle) {
      subtitle.appendChild(document.createTextNode(header.subtitle));
    }
    titleBlock.appendChild(subtitle);
  }

  top.appendChild(titleBlock);

  const about = header.about ? buildAbout(header.about, slug) : undefined;
  if (about) {
    // Phone widths collapse the narrative behind this disclosure (the stage
    // and controls need the room more than the prose); the button itself only
    // exists visually below the stacked-layout breakpoint.
    const aboutToggle = document.createElement("button");
    aboutToggle.type = "button";
    aboutToggle.className = "sim-view__about-toggle";
    aboutToggle.setAttribute("aria-expanded", "false");
    aboutToggle.textContent = "About this simulation";
    aboutToggle.addEventListener("click", () => {
      const open = about.classList.toggle("sim-view__about--open");
      aboutToggle.setAttribute("aria-expanded", String(open));
    });
    top.appendChild(aboutToggle);
    top.appendChild(about);
  }

  page.appendChild(top);

  const body = document.createElement("div");
  body.className = "sim-view__body";

  // Immersive-only exit control: a visible way back that doesn't depend on
  // Esc (touch has none) or remembering the Maximise button toggles too.
  // Hidden outside immersive mode; click listener attached in renderSimView.
  const immersiveExit = document.createElement("button");
  immersiveExit.type = "button";
  immersiveExit.className = "sim-view__immersive-exit";
  immersiveExit.setAttribute("aria-label", "Exit fullscreen");
  immersiveExit.textContent = "✕";
  body.appendChild(immersiveExit);

  const stage = document.createElement("div");
  stage.className = "sim-view__stage";

  const canvas = document.createElement("canvas");
  canvas.className = "sim-view__canvas";
  stage.appendChild(canvas);

  const fractalHud = isFractalSlug(slug) ? buildFractalHud() : undefined;
  if (fractalHud) stage.appendChild(fractalHud.root);

  const legend = document.createElement("div");
  legend.className = "sim-view__legend";
  stage.appendChild(legend);

  body.appendChild(stage);

  // Phone-only bottom-drawer toggle: the sidebar starts collapsed below the
  // 720px breakpoint (see styles.css) so the stage gets the room, and this
  // pill opens it on demand. Hidden outside that breakpoint and in immersive
  // mode, where the sidebar already has its own edge-handle reveal.
  const paramsToggle = document.createElement("button");
  paramsToggle.type = "button";
  paramsToggle.className = "sim-view__params-toggle";
  paramsToggle.setAttribute("aria-expanded", "false");
  paramsToggle.textContent = "Parameters";
  paramsToggle.addEventListener("click", () => {
    const open = page.classList.toggle("sim-view--params-open");
    paramsToggle.setAttribute("aria-expanded", String(open));
  });
  body.appendChild(paramsToggle);

  const sidebar = document.createElement("aside");
  sidebar.className = "sim-view__sidebar";

  // Immersive-only edge handle: the hover/focus-within reveal below has no
  // touch equivalent, so this button is the tap target that opens the drawer
  // on touch devices (hidden outside immersive mode, see styles.css).
  const drawerHandle = document.createElement("button");
  drawerHandle.type = "button";
  drawerHandle.className = "sim-view__drawer-handle";
  drawerHandle.setAttribute("aria-expanded", "false");
  drawerHandle.setAttribute("aria-label", "Show settings");
  drawerHandle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("sim-view__sidebar--open");
    drawerHandle.setAttribute("aria-expanded", String(open));
    drawerHandle.setAttribute(
      "aria-label",
      open ? "Hide settings" : "Show settings",
    );
  });

  body.appendChild(sidebar);

  page.appendChild(body);
  container.appendChild(page);

  return {
    page,
    body,
    stage,
    canvas,
    sidebar,
    drawerHandle,
    immersiveExit,
    legend,
    about,
    fractalHud,
  };
}

function buildFractalHud(): FractalHud {
  const root = document.createElement("div");
  root.className = "fractal-hud";

  const zoomLabel = document.createElement("output");
  zoomLabel.className = "fractal-hud__zoom";
  zoomLabel.setAttribute("aria-live", "polite");
  root.appendChild(zoomLabel);

  const controls = document.createElement("div");
  controls.className = "fractal-hud__controls";

  const makeButton = (text: string, label: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fractal-hud__button";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    controls.appendChild(button);
    return button;
  };

  const zoomOut = makeButton("−", "Zoom out");
  const home = makeButton("⌂", "Reset fractal view");
  const zoomIn = makeButton("+", "Zoom in");
  root.appendChild(controls);

  return { root, zoomLabel, zoomIn, zoomOut, home };
}

/** The narrative panel filling the header space beside the title: where the
 * model came from, and what its equations say. */
function buildAbout(about: SimAbout, slug: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "sim-view__about";

  root.appendChild(buildAboutSection("Origin", about.history));

  // The equations sit with the prose that explains them rather than under the
  // title. "Try it" is inserted between the two later, by the pointer wiring.
  const maths = buildAboutSection("The maths", about.maths, MATHS_SECTION_CLASS);
  const formula = document.createElement("div");
  formula.className = "sim-view__formula";
  renderFormula(formula, slug);
  maths.insertBefore(formula, maths.querySelector(".sim-view__about-text"));
  root.appendChild(maths);

  syncAboutColumns(root);
  return root;
}

/** The panel's width cap is per column, so it has to track the section count.
 *  Call after adding or removing a section. */
function syncAboutColumns(root: HTMLElement): void {
  const count = root.querySelectorAll(".sim-view__about-section").length;
  root.style.setProperty("--about-columns", String(count));
}

const MATHS_SECTION_CLASS = "sim-view__about-section--maths";

function buildAboutSection(
  label: string,
  body: string,
  modifier?: string,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "sim-view__about-section";
  if (modifier) section.classList.add(modifier);

  const heading = document.createElement("h2");
  heading.className = "sim-view__about-label";
  heading.textContent = label;
  section.appendChild(heading);

  const text = document.createElement("p");
  text.className = "sim-view__about-text";
  text.textContent = body;
  section.appendChild(text);

  return section;
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
    min: 0.5,
    max: 2,
    step: 0.05,
  };
  const swarm: StepsControlOptions = {
    label: "Simulation speed",
    min: 0.5,
    max: 8,
    step: 0.5,
  };

  switch (slug) {
    case "gray-scott":
      return { initial: 1, control: balanced };
    case "belousov-zhabotinsky":
      // Slower default so the spiral fronts read as they unfurl; the finer
      // (high-resolution) medium carries the detail.
      return { initial: 1, control: balanced };
    case "abelian-sandpile":
      return { initial: 1, control: growth };
    case "diffusion-limited-aggregation":
      return { initial: 6, control: growth };
    case "game-of-life":
      return { initial: 1, control: careful };
    case "elementary-cellular-automata":
      return { initial: 1.5, control: careful };
    case "brians-brain":
      return { initial: 1, control: careful };
    case "lorenz-attractor":
      // All five attractors share this slug, so they all open at 1x. The orbit
      // speed people actually feel is the kernel's stepsPerFrame (integration
      // substeps per frame); this slider multiplies on top of it, and starting
      // it anywhere but 1 makes "reset to defaults" look like a speed change.
      return { initial: 1, control: careful };
    case "boids":
      return { initial: 5, control: swarm };
    case "particle-life":
      return { initial: 1, control: swarm };
    case "mandelbrot":
    case "julia-set":
      return { initial: 1.8, control: fractal };
    case "burning-ship":
      return { initial: 0.5, control: fractal };
    default:
      return { initial: 1, control: balanced };
  }
}

function defaultParamOverridesFor(slug: string): SimParams {
  switch (slug) {
    case "belousov-zhabotinsky":
      // The medium's local period is ~42 internal steps; 1 step/frame keeps
      // the rolling fronts readable (2+ reads as flicker).
      return { stepsPerFrame: 1 };
    case "lorenz-attractor":
      // The speed slider scales how many times step() runs per frame, and
      // step() applies fade and advances the colour phase once per call, so the
      // slider stretches the trail and the colour cycle as well as the orbit.
      // Only stepsPerFrame (integration substeps) belongs to the orbit alone.
      // Values are therefore quoted at the 1x default: 9 substeps/frame, a
      // trail half-life of ln(0.5)/ln(fade) ~= 5s (long enough that the far
      // lobe survives until the orbit returns to it), and a ~13s colour lap.
      return { stepsPerFrame: 9, fade: 0.9978, cycleSpeed: 0.08 };
    case "diffusion-limited-aggregation":
      return { walkersPerStep: 96, maxWalkSteps: 256 };
    case "elementary-cellular-automata":
      return { stepsPerFrame: 1 };
    default:
      return {};
  }
}

/** Factory colour options overlaid with any persisted renderer visual options. */
function restoreRenderOptions(
  slug: string,
  factory: ColourMapOptions,
): ColourMapOptions {
  const stored = loadRenderOptions(slug);
  if (!stored) return { ...factory };

  const next = { ...factory };
  if (stored.steps !== undefined) {
    next.steps = Math.max(0, Math.min(64, Math.floor(stored.steps)));
  }
  return next;
}

function defaultDisplayOptionsFor(slug: string): DisplayOptions {
  if (slug === "boids") {
    // Trails on by default: flocks read as flowing ribbons.
    return { dotSize: 2, trailFade: 0.93, bloom: 0.3 };
  }
  if (slug === "particle-life") {
    // Bloom carries the species colour a little past each sphere's rim, so
    // clusters read as one glowing membrane while the bodies stay distinct.
    // dotSize does not reach the glyph: the kernel's own pointSize param wins.
    return { dotSize: 2, trailFade: 0, bloom: 0.35 };
  }
  if (slug === "lorenz-attractor") {
    return { dotSize: 1, trailFade: 0, bloom: 0.4 };
  }
  switch (slug) {
    // Modest glow on the bright-trace and fractal sims; off elsewhere.
    case "mandelbrot":
    case "julia-set":
    case "burning-ship":
      return { dotSize: 1, trailFade: 0, bloom: 0.3 };
    case "logistic-mandelbrot":
      return { dotSize: 1, trailFade: 0, bloom: 0.15 };
    default:
      return { dotSize: 1, trailFade: 0, bloom: 0 };
  }
}

/** Factory display options overlaid with any persisted renderer visual options. */
function restoreDisplayOptions(
  slug: string,
  factory: DisplayOptions,
): DisplayOptions {
  const stored = loadRenderOptions(slug);
  if (!stored) return { ...factory };

  const next = { ...factory };
  if (stored.trailFade !== undefined) {
    next.trailFade = Math.max(0, Math.min(0.985, stored.trailFade));
  }
  if (stored.bloom !== undefined) {
    next.bloom = Math.max(0, Math.min(1, stored.bloom));
  }
  return next;
}

/** Persisted resolution preset if valid, otherwise the per-sim default. */
function resolveResolution(
  slug: string,
  fallback: ResolutionPreset,
): ResolutionPreset {
  const stored = loadResolution(slug);
  if (stored && Object.prototype.hasOwnProperty.call(RESOLUTION_TARGETS, stored)) {
    return stored as ResolutionPreset;
  }
  return fallback;
}

/** Persisted auto-cycle preference if stored, otherwise the per-sim default. */
function resolveAutoCycle(slug: string, fallback: boolean): boolean {
  const stored = loadRenderOptions(slug);
  return typeof stored?.autoCycle === "boolean" ? stored.autoCycle : fallback;
}

function paramSchemaForControls(
  slug: string,
  schema: readonly ParamDescriptor[],
  bakes: readonly BakedEntry[],
): readonly ParamDescriptor[] {
  // No bake on this machine means no choice to offer: drop the control rather
  // than show one whose only option is the live build.
  const withBakes =
    bakes.length === 0
      ? schema.filter((descriptor) => descriptor.key !== "modelSource")
      : schema.map((descriptor) =>
          descriptor.key === "modelSource"
            ? {
                ...descriptor,
                options: [LIVE_MODEL_SOURCE, ...bakes.map((bake) => bake.id)],
              }
            : descriptor,
        );

  const fractal = isFractalSlug(slug);
  if (slug !== "lorenz-attractor" && !fractal) return withBakes;

  return withBakes.map((descriptor) => {
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
