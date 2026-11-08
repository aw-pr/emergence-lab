import { presetButton, presetHref, presetNameDialog, resolveSavedPreset, savedPresetStore } from "./presetLibrary.ts";
import type { PresetSnapshot, SavedPreset } from "./savedPresets.ts";
import { trialPresets } from "./trialPresets.ts";
import { defaultDisplayOptionsFor, speedProfileFor } from "./savedPresets.ts";
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
} from "./controls.ts";
import {
  deleteCustomObstacleLayout,
  loadCustomObstacleField,
  loadCustomObstacleLayouts,
  loadRenderOptions,
  loadResolution,
  saveCustomObstacleLayout,
  saveCustomObstacleField,
  type CustomObstacleLayoutSlot,
} from "./persistence.ts";

/** The "build it in the browser" option of the logistic-Mandelbrot `modelSource`. */
const LIVE_MODEL_SOURCE = "live";
const dismissedCustomObstacleHints = new Set<string>();

interface BoidsObstacleEditor {
  placeCustomRock(x: number, y: number): boolean;
  placeCustomCapsule(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): boolean;
  customWallSegmentSpacing(): number;
  removeCustomObstacleAt(x: number, y: number): boolean;
  clearCustomObstacles(): boolean;
  getCustomObstacles(): readonly unknown[];
  restoreCustomObstacles(snapshot: readonly unknown[]): boolean;
  exportCustomObstacleLayout(): string;
  importCustomObstacleLayout(serialised: string):
    | { ok: true; obstacles: readonly unknown[] }
    | { ok: false; error: string };
}

interface PointerCellMapper {
  pointerToCell(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null;
}

/**
 * Kernel params hoisted into the View section, per sim: everything about how
 * the object is drawn rather than what is simulated. Sims not listed keep
 * their whole schema below the View section.
 */
const VIEW_PARAM_KEYS: Readonly<Record<string, readonly string[]>> = {
  "logistic-mandelbrot": [
    "geometryMode",
    "surfaceOpacity",
    "colourMode",
    "exposure",
    "edgeGlow",
    "tailRefinement",
    "boundaryDetail",
    "pointDensity",
    "zoomGrowth",
    "autoRotate",
    "continuousSpin",
    "cycleSpeed",
    "cycleBands",
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
  "clifford-dejong": ["exposure", "fade", "colourMode", "cycleSpeed"],
  mandelbrot: ["palettePhase", "cycleSpeed"],
  "julia-set": ["palettePhase", "cycleSpeed"],
  "burning-ship": ["palettePhase", "cycleSpeed"],
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
import {
  attachPointerImpulse,
  type PointerImpulseTarget,
} from "./pointerImpulse.ts";
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
  "clifford-dejong": [
    "x_{n+1} = \\sin(a y_n) + c\\cos(a x_n)",
    "y_{n+1} = \\sin(b x_n) + d\\cos(b y_n)",
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
   * Toggle immersive mode (the top-layer overlay that hides the lab bar and
   * parameter sidebar). Optional because the early-error paths (unknown sim,
   * kernel load failure) return before the toggle exists.
   */
  toggleImmersive?(): void;
  /**
   * Open or close the About panel (the sim's narrative, over the running
   * stage). Optional for the same reason as toggleImmersive, and a no-op for
   * a sim with no narrative.
   */
  toggleAbout?(): void;
}

export async function renderSimView(
  container: HTMLElement,
  slug: string,
  variant?: string,
  options: { presetId?: string; presetsEnabled?: boolean; signal?: AbortSignal } = {},
): Promise<SimViewHandle> {
  container.innerHTML = "";

  const entry = findEntry(slug);
  if (!entry) {
    setSimDocumentTitle(null);
    renderUnknownSim(container, slug);
    return { dispose() {} };
  }

  let loadedPreset: Awaited<ReturnType<typeof resolveSavedPreset>>;
  if (options.presetId !== undefined) {
    try {
      loadedPreset = await resolveSavedPreset(options.presetId);
      if (!loadedPreset || loadedPreset.snapshot.slug !== slug || loadedPreset.snapshot.variant !== variant) {
        throw new Error("This preset is missing or does not match this route. Choose another preset or save a new configuration.");
      }
    } catch (error) {
      if (!options.signal?.aborted) {
        setSimDocumentTitle("Preset unavailable");
        container.innerHTML = "";
        const errorView = document.createElement("section");
        errorView.className = "preset-library";
        const title = document.createElement("h1");
        title.textContent = "Preset unavailable";
        const message = document.createElement("p");
        message.setAttribute("role", "alert");
        message.textContent = error instanceof Error ? error.message : String(error);
        const back = document.createElement("a");
        back.href = "#/presets";
        back.textContent = "Presets";
        errorView.append(title, message, back);
        container.append(errorView);
      }
      return { dispose() {} };
    }
  }
  if (options.signal?.aborted) return { dispose() {} };
  const snapshot = loadedPreset?.snapshot;

  // A variant selects a named configuration within the same kernel (e.g. which
  // strange attractor). Falls back to the base entry when absent or unknown.
  const variantDef = variant
    ? entry.variants?.find((v) => v.variant === variant)
    : undefined;

  const name = variantDef?.name ?? entry.name;
  setSimDocumentTitle(name);

  const about = aboutFor(slug, variantDef?.variant);
  // Lives as long as the view: aborted by dispose() and by every early return
  // below, so window listeners never outlive the layout they serve.
  const immersiveAbort = new AbortController();
  const layout = buildLayout(
    container,
    {
      name,
      family: entry.family,
      subtitle: variantDef?.subtitle ?? entry.subtitle,
      about,
    },
    slug,
    immersiveAbort.signal,
  );
  const renderMode = getRenderMode(slug);
  if (shouldUseSmoothCanvasPresentation(renderMode)) {
    layout.canvas.classList.add("sim-view__canvas--smooth");
  }

  // Immersive mode (lab bar gone, settings as an auto-hiding edge drawer) is a
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
  const updateImmersive = () => {
    const native = document.fullscreenElement === layout.body;
    const windowFullscreen =
      !siteOwnsChrome() &&
      window.innerWidth === window.screen.width &&
      window.innerHeight === window.screen.height;
    const immersive = immersiveForced || native || windowFullscreen;
    layout.page.classList.toggle("sim-view--immersive", immersive);
    // The pills and bar that own About are gone in immersive, and the body's
    // own top-layer promotion would bury an open panel out of reach.
    if (immersive) layout.aboutPanel?.close();
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
      // An open About panel takes this Esc for itself (the popover's own
      // close request), so the overlay stays.
      if (
        event.key === "Escape" &&
        immersiveForced &&
        !document.fullscreenElement &&
        !layout.aboutPanel?.isOpen()
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
    immersiveAbort.abort();
    if (!options.signal?.aborted) renderLoadError(layout.body, slug, error);
    return { dispose() {} };
  }

  if (options.signal?.aborted) { immersiveAbort.abort(); kernel.destroy(); return { dispose() {} }; }

  const factoryParams: SimParams = {
    ...defaultParamsFromSchema(kernel.paramSchema),
    ...defaultParamOverridesFor(slug),
    ...(variantDef?.params ?? {}),
  };
  const restored: SimParams = snapshot ? { ...snapshot.params } : restorePersistedParams(
    slug,
    kernel.paramSchema,
    factoryParams,
  );
  // Variants share one persistence key (the slug), so the variant's selector
  // param must win over any restored value—otherwise picking Rössler could
  // reopen as a previously-saved Lorenz.
  const params: SimParams = variantDef && !snapshot
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
  if (options.signal?.aborted) { immersiveAbort.abort(); kernel.destroy(); return { dispose() {} }; }
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
  let colourOptions: ColourMapOptions = snapshot ? { ...snapshot.colourOptions } : restoreRenderOptions(
    slug,
    factoryColourOptions,
  );
  const factoryDisplayOptions: DisplayOptions = defaultDisplayOptionsFor(slug);
  let displayOptions: DisplayOptions = snapshot ? { ...snapshot.displayOptions } : restoreDisplayOptions(
    slug,
    factoryDisplayOptions,
  );
  const speedProfile = speedProfileFor(slug);
  let stepsPerFrame = snapshot?.stepsPerFrame ?? speedProfile.initial;
  const fractal = isFractalSlug(slug);
  const qualityProfile = qualityProfileFor(slug, renderMode);
  const defaultResolution = qualityProfile.defaultPreset;
  const resolution = snapshot?.resolution ?? resolveResolution(slug, defaultResolution);

  // Sims whose kernel reports run completion (currently DLA) can auto-cycle
  // into a fresh randomised run when they finish. On by default when supported.
  const autoCycleSupported =
    typeof (kernel as { isComplete?: unknown }).isComplete === "function";
  const defaultAutoCycle = true;
  const initialAutoCycle = snapshot ? snapshot.autoCycle : autoCycleSupported
    ? resolveAutoCycle(slug, defaultAutoCycle)
    : false;

  // Renderer supplies a fresh random seed on init; an explicit portable seed
  // belongs to this configuration and must reach the real kernel unchanged.
  let explicitSeed = params.seed;
  if (slug === "physarum" || slug === "particle-life") {
    const init = kernel.init.bind(kernel);
    kernel.init = (width, height, next) => init(width, height,
      explicitSeed === undefined ? next : { ...next, seed: explicitSeed });
  }

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

  const obstacleEditor = slug === "boids"
    ? kernel as SimKernel & BoidsObstacleEditor
    : undefined;
  let initialObstacleMessage = "";
  if (obstacleEditor) {
    const persisted = snapshot ? snapshot.customObstacles ?? null : loadCustomObstacleField(slug);
    if (typeof persisted === "string") {
      const restoredField = obstacleEditor.importCustomObstacleLayout(persisted);
      if (!restoredField.ok) {
        initialObstacleMessage = `Saved field was ignored: ${restoredField.error}`;
      }
    } else if (persisted) {
      if (obstacleEditor.restoreCustomObstacles(persisted)) {
        saveCustomObstacleField(slug, obstacleEditor.exportCustomObstacleLayout());
      } else {
        initialObstacleMessage = "The older saved field could not be restored.";
      }
    }
  }

  let obstacleTools: BoidsObstacleTools | undefined;
  const persistObstacleField = (): void => {
    if (!obstacleEditor || snapshot) return;
    saveCustomObstacleField(slug, obstacleEditor.exportCustomObstacleLayout());
  };
  const finishObstacleEdit = (edited: boolean): boolean => {
    if (!edited) return false;
    persistObstacleField();
    dismissedCustomObstacleHints.add(slug);
    obstacleTools?.hideHint();
    return true;
  };
  if (obstacleEditor) {
    const applyObstacleLayout = (serialised: string): LayoutActionResult => {
      const imported = obstacleEditor.importCustomObstacleLayout(serialised);
      if (!imported.ok) {
        return { ok: false, message: imported.error };
      }
      persistObstacleField();
      dismissedCustomObstacleHints.add(slug);
      obstacleTools?.hideHint();
      return { ok: true, message: "Layout loaded." };
    };
    obstacleTools = buildBoidsObstacleTools({
      initialMessage: initialObstacleMessage,
      hintDismissed: () => dismissedCustomObstacleHints.has(slug),
      onDismissHint: () => {
        dismissedCustomObstacleHints.add(slug);
        obstacleTools?.hideHint();
      },
      onClear: () => {
        const hadObstacles = obstacleEditor.getCustomObstacles().length > 0;
        if (obstacleEditor.clearCustomObstacles()) {
          persistObstacleField();
          if (hadObstacles) {
            dismissedCustomObstacleHints.add(slug);
            obstacleTools?.hideHint();
          }
        }
      },
      loadSlots: () => loadCustomObstacleLayouts(slug),
      onSaveSlot: (name) => {
        const saved = saveCustomObstacleLayout(
          slug,
          name,
          obstacleEditor.exportCustomObstacleLayout(),
        );
        return saved
          ? { ok: true, message: `Saved “${name.trim().slice(0, 64)}”.` }
          : { ok: false, message: "Enter a name and check local storage is available." };
      },
      onLoadSlot: (serialised) => applyObstacleLayout(serialised),
      onDeleteSlot: (name) =>
        deleteCustomObstacleLayout(slug, name)
          ? { ok: true, message: `Deleted “${name}”.` }
          : { ok: false, message: "That saved layout could not be deleted." },
      onImport: (serialised) => applyObstacleLayout(serialised),
    });
    layout.stage.insertBefore(obstacleTools.root, layout.legend);
  }

  const controls = new ControlsPanel({
    slug,
    presetSession: !!snapshot,
    container: layout.sidebar,
    simName: kernel.name,
    paramSchema: snapshot ? controlsSchema.map((descriptor) => {
      const portable = kernel.paramSchema.find((p) => p.key === descriptor.key);
      return descriptor.type === "number" && portable
        ? { ...descriptor, min: portable.min, max: portable.max }
        : descriptor;
    }) : controlsSchema,
    paramPresets: presetsFor(slug),
    initialParams: params,
    defaultParams: factoryParams,
    initialStepsPerFrame: stepsPerFrame,
    defaultStepsPerFrame: speedProfile.initial,
    stepsControl: speedProfile.control,
    initialColourOptions: colourOptions,
    defaultColourOptions: factoryColourOptions,
    initialDisplayOptions: displayOptions,
    defaultDisplayOptions: factoryDisplayOptions,
    initialResolution: resolution,
    defaultResolution,
    showResolutionControl: !fractal,
    showExtremeResolution: slug === "logistic-mandelbrot" || resolution === "extreme",
    showTrailControl: renderMode === "particle",
    showDotSizeControl: !kernel.paramSchema.some((p) => p.key === "pointSize"),
    showAutoCycleControl: autoCycleSupported,
    initialAutoCycle,
    defaultAutoCycle,
    // The orbit renderer's Cycle and Inside-out modes share the fractal
    // palette phase, so they get the same direction control; the arrow-key
    // speed binding stays fractal-only, so its hint does too.
    fractalPaletteCycleUi: fractal || slug === "logistic-mandelbrot",
    paletteCycleKeyboardHint: fractal,
    viewParamKeys: VIEW_PARAM_KEYS[slug] ?? [],
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
        explicitSeed = next.seed;
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

  let dismissPresetDialog: (() => void) | undefined;
  if (options.presetsEnabled !== false) {
    const section = collapsibleSection(slug, "Presets", "controls__presets");
    const tools = document.createElement("div");
    tools.className = "preset-tools";
    const library = document.createElement("a");
    library.href = "#/presets";
    library.textContent = "Presets";
    library.className = "preset-tools__link";
    const status = document.createElement("p");
    status.className = "preset-tools__status";
    status.setAttribute("role", "status");
    const error = document.createElement("p");
    error.className = "preset-error";
    error.setAttribute("role", "alert");
    error.hidden = true;
    const live = presetButton("Return to live model", () => {
      controls.syncParamsFromExternal({ modelSource: LIVE_MODEL_SOURCE });
      renderer.updateParams(controls.getParams());
      error.hidden = true;
      live.hidden = true;
      status.textContent = "Live model selected. You can now save its configuration.";
    });
    live.hidden = true;
    const capture = (): PresetSnapshot => ({
      slug,
      ...(variant ? { variant } : {}),
      ...controls.getConfiguration(),
      params: renderer.currentParams(),
      ...(obstacleEditor ? { customObstacles: obstacleEditor.exportCustomObstacleLayout() } : {}),
    });
    let undo: SavedPreset | undefined;
    const showStatus = (text: string) => {
      undo = undefined;
      status.textContent = text + (savedPresetStore.warning ? ` ${savedPresetStore.warning}` : "");
    };
    const showError = (reason: unknown) => {
      error.textContent = reason instanceof Error ? reason.message : String(reason);
      error.hidden = false;
    };

    // This sim's presets, loaded by name and deleted by the cross with the
    // library page's Undo; trials load but are not the visitor's to delete.
    const list = document.createElement("ul");
    list.className = "preset-tools__list";
    list.setAttribute("aria-label", "Presets for this simulation");
    const forThisSim = (preset: SavedPreset) =>
      preset.snapshot.slug === slug && (preset.snapshot.variant ?? "") === (variant ?? "");
    const undoButton = presetButton("Undo", () => {
      const removed = undo;
      if (!removed) return;
      error.hidden = true;
      void savedPresetStore.restore(removed).then(async () => {
        showStatus(`Restored “${removed.name}”.`);
        await refreshList();
      }, showError);
    });
    const deletePreset = (preset: SavedPreset) => {
      error.hidden = true;
      void savedPresetStore.delete(preset.id).then(async (removed) => {
        await refreshList();
        showStatus(`Deleted “${preset.name}”.`);
        undo = removed;
        status.append(" ", undoButton);
        undoButton.focus();
      }, showError);
    };
    const presetRow = (preset: SavedPreset, source: "personal" | "trial") => {
      const row = document.createElement("li");
      row.className = "preset-row";
      row.dataset.presetId = preset.id;
      row.dataset.presetSource = source;
      row.dataset.presetSlug = preset.snapshot.slug;
      const open = document.createElement("a");
      open.className = "preset-row__open";
      open.href = presetHref(preset);
      open.textContent = preset.name;
      if (loadedPreset?.id === preset.id) open.setAttribute("aria-current", "true");
      row.append(open);
      if (source === "trial") {
        const tag = document.createElement("span");
        tag.className = "preset-row__tag";
        tag.textContent = "Trial";
        row.append(tag);
      } else {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "preset-row__delete";
        remove.setAttribute("aria-label", `Delete ${preset.name}`);
        remove.textContent = "✕";
        remove.addEventListener("click", () => deletePreset(preset));
        row.append(remove);
      }
      return row;
    };
    const refreshList = async () => {
      const [personal, trials] = await Promise.all([savedPresetStore.list(), trialPresets()]);
      const rows = [
        ...personal.filter(forThisSim).map((preset) => presetRow(preset, "personal")),
        ...trials.filter(forThisSim).map((preset) => presetRow(preset, "trial")),
      ];
      if (!rows.length) {
        const empty = document.createElement("li");
        empty.className = "preset-row preset-row--empty";
        empty.textContent = "No presets for this simulation yet.";
        rows.push(empty);
      }
      list.replaceChildren(...rows);
    };
    void refreshList().catch(showError);

    if (loadedPreset) showStatus(`${loadedPreset.source === "trial" ? "Trial" : "Personal preset"}: ${loadedPreset.name}. Changes stay in this session until you save${loadedPreset.source === "personal" ? " or update" : " a copy"}.`);
    const save = presetButton("Save preset", () => {
      const current = capture();
      error.hidden = true;
      if (current.params.modelSource !== undefined && current.params.modelSource !== LIVE_MODEL_SOURCE) {
        error.textContent = "Local prebaked models cannot be saved. Return to the live model to save a portable configuration.";
        error.hidden = false;
        live.hidden = false;
        return;
      }
      dismissPresetDialog = presetNameDialog({
        parent: layout.body,
        trigger: save,
        title: "Save preset",
        save: async (name) => {
          const entry = await savedPresetStore.create(name, current);
          showStatus(`Saved “${entry.name}”.`);
          await refreshList();
        },
      });
    }, true);
    tools.append(library, save);
    if (loadedPreset?.source === "personal") {
      const id = loadedPreset.id;
      tools.append(presetButton("Update preset", () => {
        error.hidden = true;
        void savedPresetStore.update(id, capture()).then(() => showStatus("Preset updated from the current configuration."), (reason) => {
          showError(reason);
          live.hidden = controls.getParams().modelSource === undefined || controls.getParams().modelSource === LIVE_MODEL_SOURCE;
        });
      }));
    }
    tools.append(list, status, error, live);
    section.appendChild(tools);
    controls.insertAfterTransport(section);
  }
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
  if (!fractal && (obstacleEditor || renderer.supportsImpulse())) {
    // Non-fractal sims either edit boids obstacles or poke kernels that expose
    // applyImpulse. Fractals reserve pointer gestures for pan and zoom.
    layout.canvas.classList.add("sim-view__canvas--interactive");
    let pointerTarget: PointerImpulseTarget = renderer;
    if (obstacleEditor) {
      // Renderer owns the canvas-to-grid contract, including letterboxing and
      // the WebGL Y flip. Delegate to it so dropped obstacles land at the
      // pointer in every layout.
      const pointerMapper = renderer as unknown as PointerCellMapper;
      const obstaclePoint = (
        clientX: number,
        clientY: number,
      ): readonly [number, number] | undefined => {
        const point = pointerMapper.pointerToCell(clientX, clientY);
        return point ? [point.x, point.y] : undefined;
      };
      let lastTrailPoint: readonly [number, number] | undefined;
      pointerTarget = {
        editsObstacles: () => true,
        placeCustomRock: (clientX, clientY) => {
          const point = obstaclePoint(clientX, clientY);
          return finishObstacleEdit(
            point
              ? obstacleEditor.placeCustomRock(point[0], point[1])
              : false,
          );
        },
        beginCustomTrail: () => {
          lastTrailPoint = undefined;
        },
        placeCustomTrailPoint: (clientX, clientY) => {
          const point = obstaclePoint(clientX, clientY);
          if (!point) return false;
          if (!lastTrailPoint) {
            lastTrailPoint = point;
            return false;
          }
          const spacing = obstacleEditor.customWallSegmentSpacing();
          const travelled = Math.hypot(
            point[0] - lastTrailPoint[0],
            point[1] - lastTrailPoint[1],
          );
          if (travelled < spacing) return false;
          const placed = obstacleEditor.placeCustomCapsule(
            lastTrailPoint[0],
            lastTrailPoint[1],
            point[0],
            point[1],
          );
          if (placed) lastTrailPoint = point;
          return finishObstacleEdit(placed);
        },
        endCustomTrail: (clientX, clientY) => {
          const point = obstaclePoint(clientX, clientY);
          const from = lastTrailPoint;
          lastTrailPoint = undefined;
          if (!point || !from) return false;
          // Below a third of the sampling length the capsule would collapse
          // to its rock fallback and leave a bulb on the wall end.
          const travelled = Math.hypot(point[0] - from[0], point[1] - from[1]);
          if (travelled < obstacleEditor.customWallSegmentSpacing() / 3) {
            return false;
          }
          return finishObstacleEdit(
            obstacleEditor.placeCustomCapsule(
              from[0],
              from[1],
              point[0],
              point[1],
            ),
          );
        },
        removeCustomObstacleAt: (clientX, clientY) => {
          const point = obstaclePoint(clientX, clientY);
          return finishObstacleEdit(
            point
              ? obstacleEditor.removeCustomObstacleAt(point[0], point[1])
              : false,
          );
        },
      };
    }
    detachPointerImpulse = attachPointerImpulse(layout.canvas, pointerTarget);
    // The note lives on the same condition as the handler, so it can never
    // advertise a poke the sim would ignore. It reads between the model's
    // origin and its equations, so insert it rather than append.
    if (about?.interaction && layout.about) {
      layout.about.insertBefore(
        buildAboutSection("Try it", about.interaction),
        layout.about.querySelector(`.${MATHS_SECTION_CLASS}`),
      );
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
    }
    detachOrbit3dInteractions = attachLogisticMandelbrotCanvasInteractions({
      slug,
      canvas: layout.canvas,
      getMarker: () => renderer.orbit3dMarker(),
      moveMarker: (clientX, clientY) =>
        renderer.moveOrbit3dMarker(clientX, clientY),
      orbit: (deltaCssX, deltaCssY) =>
        renderer.orbitOrbit3d(deltaCssX, deltaCssY),
      dolly: (factor, clientX, clientY) =>
        renderer.dollyOrbit3d(factor, clientX, clientY),
      pan: (deltaCssX, deltaCssY) => renderer.panOrbit3d(deltaCssX, deltaCssY),
      resetCamera: () => renderer.resetOrbit3dCamera(),
      onMarkerChange: (marker) => orbitMarkerReadout?.set(marker),
    });
  }

  // The narrative greets each view beside the running sim at desktop widths;
  // on a phone it would cover the stage, so it waits for the button there.
  if (
    !layout.page.classList.contains("sim-view--immersive") &&
    window.matchMedia("(min-width: 721px)").matches
  ) {
    layout.aboutPanel?.open();
  }

  return {
    dispose() {
      immersiveAbort.abort();
      dismissPresetDialog?.();
      layout.aboutPanel?.close();
      exitTopLayer(layout.body);
      detachFractalInteractions?.();
      detachFractalPaletteKeys?.();
      detachFractalViewKeys?.();
      detachOrbit3dInteractions?.();
      detachPointerImpulse?.();
      renderer.destroy();
      controls.dispose();
    },
    toggleImmersive,
    toggleAbout: () => layout.aboutPanel?.toggle(),
  };
}

interface BoidsObstacleTools {
  root: HTMLElement;
  hideHint(): void;
}

interface LayoutActionResult {
  ok: boolean;
  message: string;
}

function buildBoidsObstacleTools(options: {
  initialMessage: string;
  hintDismissed(): boolean;
  onDismissHint(): void;
  onClear(): void;
  loadSlots(): CustomObstacleLayoutSlot[];
  onSaveSlot(name: string): LayoutActionResult;
  onLoadSlot(serialised: string): LayoutActionResult;
  onDeleteSlot(name: string): LayoutActionResult;
  onImport(serialised: string): LayoutActionResult;
}): BoidsObstacleTools {
  const root = document.createElement("div");
  root.className = "fractal-hud boids-obstacle-tools";
  root.setAttribute("aria-label", "Dropped boulder tools");

  const hintRow = document.createElement("div");
  hintRow.className = "boids-obstacle-tools__hint-row";
  const hint = document.createElement("output");
  hint.className = "fractal-hud__zoom boids-obstacle-tools__hint";
  hint.value = "Click to drop a boulder · Hold and drag to lay a breakwater · Click a dropped obstacle to remove";
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "boids-obstacle-tools__dismiss";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss obstacle drawing hint");
  dismiss.addEventListener("click", options.onDismissHint);
  hintRow.append(hint, dismiss);
  root.appendChild(hintRow);

  const controls = document.createElement("div");
  controls.className = "fractal-hud__controls boids-obstacle-tools__bar";

  const makeButton = (label: string, className = ""): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `boids-obstacle-tools__button ${className}`.trim();
    button.textContent = label;
    return button;
  };
  const makeField = (
    label: string,
    input: HTMLElement,
  ): HTMLLabelElement => {
    const field = document.createElement("label");
    field.className = "boids-obstacle-layouts__field";
    const caption = document.createElement("span");
    caption.className = "boids-obstacle-layouts__label";
    caption.textContent = label;
    field.append(caption, input);
    return field;
  };

  const layouts = document.createElement("details");
  layouts.className = "boids-obstacle-layouts";
  const layoutsToggle = document.createElement("summary");
  layoutsToggle.className =
    "boids-obstacle-tools__button boids-obstacle-layouts__toggle";
  layoutsToggle.textContent = "Layouts";
  layouts.appendChild(layoutsToggle);

  const popup = document.createElement("div");
  popup.className = "boids-obstacle-layouts__popup";
  popup.setAttribute("aria-label", "Saved obstacle layouts");

  const nameInput = document.createElement("input");
  nameInput.className = "boids-obstacle-layouts__input";
  nameInput.type = "text";
  nameInput.maxLength = 64;
  nameInput.placeholder = "My layout";
  const save = makeButton("Save current", "boids-obstacle-tools__button--primary");
  const saveRow = document.createElement("div");
  saveRow.className = "boids-obstacle-layouts__actions";
  saveRow.appendChild(save);
  popup.append(makeField("Layout name", nameInput), saveRow);

  const slotSelect = document.createElement("select");
  slotSelect.className = "boids-obstacle-layouts__input";
  const slotActions = document.createElement("div");
  slotActions.className = "boids-obstacle-layouts__actions";
  const load = makeButton("Load");
  const remove = makeButton("Delete");
  const exportLayout = makeButton("Export");
  slotActions.append(load, remove, exportLayout);
  popup.append(makeField("Saved layouts", slotSelect), slotActions);

  const transfer = document.createElement("textarea");
  transfer.className = "boids-obstacle-layouts__input";
  transfer.rows = 3;
  transfer.spellcheck = false;
  transfer.placeholder = "Paste an exported layout";
  const importLayout = makeButton("Import and load");
  const importRow = document.createElement("div");
  importRow.className = "boids-obstacle-layouts__actions";
  importRow.appendChild(importLayout);
  popup.append(makeField("Layout JSON", transfer), importRow);

  const status = document.createElement("output");
  status.className = "boids-obstacle-layouts__status";
  status.setAttribute("aria-live", "polite");
  popup.appendChild(status);
  layouts.appendChild(popup);
  controls.appendChild(layouts);

  let slots: CustomObstacleLayoutSlot[] = [];
  const setStatus = (result: LayoutActionResult): void => {
    status.value = result.message;
    status.dataset.state = result.ok ? "ok" : "error";
  };
  const refreshSlots = (selectedName?: string): void => {
    slots = options.loadSlots();
    slotSelect.replaceChildren();
    if (slots.length === 0) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "No saved layouts";
      slotSelect.appendChild(empty);
      slotSelect.disabled = true;
      return;
    }
    slotSelect.disabled = false;
    for (const slot of slots) {
      const option = document.createElement("option");
      option.value = slot.name;
      option.textContent = slot.name;
      slotSelect.appendChild(option);
    }
    if (selectedName && slots.some((slot) => slot.name === selectedName)) {
      slotSelect.value = selectedName;
    }
  };
  const selectedSlot = (): CustomObstacleLayoutSlot | undefined =>
    slots.find((slot) => slot.name === slotSelect.value);

  save.addEventListener("click", () => {
    const result = options.onSaveSlot(nameInput.value);
    setStatus(result);
    if (result.ok) refreshSlots(nameInput.value.trim().slice(0, 64));
  });
  load.addEventListener("click", () => {
    const slot = selectedSlot();
    setStatus(
      slot
        ? options.onLoadSlot(slot.layout)
        : { ok: false, message: "Choose a saved layout first." },
    );
  });
  remove.addEventListener("click", () => {
    const slot = selectedSlot();
    if (!slot) {
      setStatus({ ok: false, message: "Choose a saved layout first." });
      return;
    }
    const result = options.onDeleteSlot(slot.name);
    setStatus(result);
    if (result.ok) refreshSlots();
  });
  exportLayout.addEventListener("click", () => {
    const slot = selectedSlot();
    if (!slot) {
      setStatus({ ok: false, message: "Choose a saved layout first." });
      return;
    }
    transfer.value = slot.layout;
    transfer.select();
    setStatus({ ok: true, message: "Export ready to copy." });
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(slot.layout).then(
        () => setStatus({ ok: true, message: "Export copied." }),
        () => {},
      );
    }
  });
  importLayout.addEventListener("click", () => {
    const serialised = transfer.value.trim();
    setStatus(
      serialised
        ? options.onImport(serialised)
        : { ok: false, message: "Paste a layout string first." },
    );
  });
  refreshSlots();
  if (options.initialMessage) {
    setStatus({ ok: false, message: options.initialMessage });
    layouts.open = true;
  }

  const clear = makeButton("Clear boulders", "boids-obstacle-tools__clear");
  clear.setAttribute("aria-label", "Clear dropped boulders");
  clear.addEventListener("click", options.onClear);
  controls.appendChild(clear);
  root.appendChild(controls);

  const hideHint = (): void => {
    hintRow.hidden = true;
  };
  if (options.hintDismissed()) {
    hideHint();
  }

  return {
    root,
    hideHint,
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
  /** The narrative's sections, so the pointer wiring can add its own note. */
  about?: HTMLElement;
  /** The About popover that holds those sections. */
  aboutPanel?: AboutPanel;
  fractalHud?: FractalHud;
}

const ABOUT_PANEL_WIDTH = 360;

interface AboutPanel {
  isOpen(): boolean;
  open(): void;
  toggle(): void;
  close(): void;
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
  signal: AbortSignal,
): SimLayout {
  const page = document.createElement("section");
  page.className = "sim-view";

  const siteChrome = siteOwnsChrome();

  const back = document.createElement("a");
  back.className = "sim-view__back";
  // Hosted by the site (framed or embedded inline), the app's internal gallery
  // is a redundant copy of the site's /labs page, so send visitors there
  // instead. Standalone (and direct /labs/app/ visits) keep the in-app gallery.
  if (siteChrome) {
    back.href = getChrome().siteGalleryHref;
    // Only the iframe shell needs to break out of its frame.
    if (isFramedBySite()) back.target = "_top";
  } else {
    back.href = "#/";
  }
  back.textContent = "← Gallery";

  let aboutButton: HTMLButtonElement | undefined;
  if (header.about) {
    aboutButton = document.createElement("button");
    aboutButton.type = "button";
    aboutButton.className = "sim-view__about-button";
    aboutButton.setAttribute("aria-expanded", "false");
    aboutButton.textContent = "About";
  }

  // Standalone, one slim bar names the sim and carries the way out and the
  // narrative. Hosted by the site, the host's bar already names the sim, so
  // the same two controls float as pills over the stage instead of costing
  // the stage a row.
  if (!siteChrome) {
    const bar = document.createElement("header");
    bar.className = "sim-view__bar";

    const title = document.createElement("h1");
    title.className = "sim-view__title";
    title.textContent = header.name;
    bar.append(back, title);

    if (header.family) {
      const tag = document.createElement("span");
      tag.className = "sim-view__family";
      tag.textContent = header.family;
      bar.appendChild(tag);
    }
    if (aboutButton) bar.appendChild(aboutButton);
    if (header.subtitle) {
      const subtitle = document.createElement("p");
      subtitle.className = "sim-view__subtitle";
      subtitle.textContent = header.subtitle;
      // The bar truncates it to one line; the full line stays a hover away.
      subtitle.title = header.subtitle;
      bar.appendChild(subtitle);
    }
    page.appendChild(bar);
  }

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

  // Top-right, clear of the parameters panel, the corner the immersive exit
  // pill uses; immersive hides these, so the two never share it.
  if (siteChrome) {
    const pills = document.createElement("div");
    pills.className = "sim-view__pills";
    pills.appendChild(back);
    if (aboutButton) pills.appendChild(aboutButton);
    stage.appendChild(pills);
  }

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

  // Normal layout only (hidden in immersive and on phones, which have their
  // own reveals). Every view opens with the controls shown.
  const sidebarTab = document.createElement("button");
  sidebarTab.type = "button";
  sidebarTab.className = "sim-view__sidebar-tab";
  const showControls = (shown: boolean) => {
    page.classList.toggle("sim-view--controls-hidden", !shown);
    sidebarTab.setAttribute("aria-expanded", String(shown));
    sidebarTab.setAttribute("aria-label", shown ? "Hide controls" : "Show controls");
  };
  showControls(true);
  sidebarTab.addEventListener("click", () => {
    showControls(page.classList.contains("sim-view--controls-hidden"));
  });
  body.appendChild(sidebarTab);

  page.appendChild(body);

  let about: HTMLElement | undefined;
  let aboutPanel: AboutPanel | undefined;
  if (header.about && aboutButton) {
    about = buildAbout(header.about, slug);
    aboutPanel = attachAboutPanel({
      page,
      button: aboutButton,
      sections: about,
      stage,
      name: header.name,
      signal,
    });
  }

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
    aboutPanel,
    fractalHud,
  };
}

/**
 * The narrative in a top-layer popover over the running stage. Top layer
 * because the embedded lab sits inside a host page whose ancestors can clip
 * or out-stack anything positioned normally. An `auto` popover brings Escape
 * and click-away dismissal; the About button is its invoker, so clicking it
 * while open closes the panel rather than light-dismissing and reopening it.
 */
function attachAboutPanel(options: {
  page: HTMLElement;
  button: HTMLButtonElement;
  sections: HTMLElement;
  stage: HTMLElement;
  name: string;
  signal: AbortSignal;
}): AboutPanel {
  const { button, stage, signal } = options;
  const panel = document.createElement("section");
  panel.className = "sim-view__about-panel";
  panel.setAttribute("aria-label", `About ${options.name}`);

  const head = document.createElement("div");
  head.className = "sim-view__about-head";
  const kicker = document.createElement("p");
  kicker.className = "sim-view__about-kicker";
  kicker.textContent = options.name;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "sim-view__about-close";
  close.setAttribute("aria-label", "Close About");
  close.textContent = "✕";
  head.append(kicker, close);
  panel.append(head, options.sections);
  options.page.appendChild(panel);

  const popover = typeof panel.showPopover === "function";
  if (popover) {
    panel.popover = "auto";
    button.popoverTargetElement = panel;
    close.popoverTargetElement = panel;
    close.popoverTargetAction = "hide";
  } else {
    panel.hidden = true;
  }

  const isOpen = () =>
    popover ? panel.matches(":popover-open") : !panel.hidden;

  // Down the stage's right side, below the pills when the site owns the
  // chrome, as tall as the stage allows and scrolling inside itself. Phones
  // override this with a full-width sheet (styles.css).
  const place = () => {
    const anchor = button.getBoundingClientRect();
    const box = stage.getBoundingClientRect();
    const anchored = anchor.width > 0 && anchor.height > 0;
    const top = Math.max(8, box.top + 12, anchored ? anchor.bottom + 8 : 0);
    const right = Math.max(8, document.documentElement.clientWidth - box.right + 12);
    const bottom = Math.min(window.innerHeight, box.bottom) - 12;
    panel.style.setProperty("--about-top", `${Math.round(top)}px`);
    panel.style.setProperty("--about-right", `${Math.round(right)}px`);
    panel.style.setProperty(
      "--about-width",
      `${Math.round(Math.max(240, Math.min(ABOUT_PANEL_WIDTH, box.width - 24)))}px`,
    );
    panel.style.setProperty("--about-max-height", `${Math.round(Math.max(160, bottom - top))}px`);
  };

  let openAbort: AbortController | undefined;
  const opened = () => {
    button.setAttribute("aria-expanded", "true");
    openAbort?.abort();
    openAbort = new AbortController();
    window.addEventListener("resize", place, { signal: openAbort.signal });
    // A host page that scrolls carries the anchor away from a fixed panel.
    window.addEventListener("scroll", place, {
      signal: openAbort.signal,
      capture: true,
      passive: true,
    });
  };
  const closed = () => {
    openAbort?.abort();
    button.setAttribute("aria-expanded", "false");
    if (focusWasLostFrom(panel)) button.focus({ preventScroll: true });
  };

  // A host page's own About button calls toggleAbout() from a click that
  // lands after the pointerup which already light-dismissed the panel; seen
  // naively, that click would only ever reopen it.
  let pointerDown = false;
  let lastPointerUp = -Infinity;
  let pointerClosedAt = -Infinity;
  window.addEventListener("pointerdown", () => { pointerDown = true; }, { capture: true, signal });
  window.addEventListener(
    "pointerup",
    () => {
      pointerDown = false;
      lastPointerUp = performance.now();
    },
    { capture: true, signal },
  );

  if (popover) {
    panel.addEventListener(
      "beforetoggle",
      (event) => {
        if ((event as ToggleEvent).newState === "open") {
          place();
        } else if (pointerDown || performance.now() - lastPointerUp < 100) {
          pointerClosedAt = performance.now();
        }
      },
      { signal },
    );
    panel.addEventListener(
      "toggle",
      (event) => {
        if ((event as ToggleEvent).newState === "open") opened();
        else closed();
      },
      { signal },
    );
  }

  const show = () => {
    if (isOpen()) return;
    if (popover) {
      panel.showPopover();
      return;
    }
    panel.hidden = false;
    place();
    opened();
  };
  const hide = () => {
    if (!isOpen()) return;
    if (popover) {
      panel.hidePopover();
      return;
    }
    panel.hidden = true;
    closed();
  };

  if (!popover) {
    button.addEventListener("click", () => (isOpen() ? hide() : show()), { signal });
    close.addEventListener("click", hide, { signal });
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") hide();
      },
      { signal },
    );
  }

  return {
    isOpen,
    open: show,
    toggle() {
      if (isOpen()) {
        hide();
      } else if (performance.now() - pointerClosedAt < 400) {
        pointerClosedAt = -Infinity;
      } else {
        show();
      }
    },
    close: hide,
  };
}

/** True when closing the panel left focus nowhere useful: inside the panel
 * itself, or on the bare document. Focus the host page holds stays put. */
function focusWasLostFrom(panel: HTMLElement): boolean {
  const root = panel.getRootNode() as Document | ShadowRoot;
  const active = root.activeElement;
  if (active && active !== document.body) return panel.contains(active);
  return document.activeElement === null || document.activeElement === document.body;
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

/** The narrative the About panel shows: where the model came from, and what
 * its equations say. */
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

  return root;
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
