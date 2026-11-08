import { COLOUR_PRESETS, type ColourMapOptions } from "./colormap.js";
import { RESOLUTION_TARGETS, type ResolutionPreset } from "./resolutionPreset.js";
import type { ParamDescriptor, SimParams } from "./types.js";

export interface PresetSnapshot {
  slug: string;
  variant?: string;
  params: SimParams;
  colourOptions: ColourMapOptions;
  displayOptions: { dotSize: number; trailFade: number; bloom: number };
  resolution: ResolutionPreset;
  stepsPerFrame: number;
  autoCycle: boolean;
  customObstacles?: string;
}

export interface SavedPreset {
  id: string;
  name: string;
  snapshot: PresetSnapshot;
}

export interface PresetModel {
  slug: string;
  variants?: readonly { variant: string }[];
  load(): Promise<{ paramSchema: readonly ParamDescriptor[]; destroy(): void }>;
}

export const SAVED_PRESETS_KEY = "el:saved-presets:v1";
export const MAX_PRESETS = 200;
export const MAX_IMPORT_BYTES = 1024 * 1024;
const FORMAT = "emergence-presets";
const VERSION = 1;
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const clone = <T>(value: T): T => structuredClone(value);
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function safeKeys(value: unknown, depth = 0): void {
  if (depth > 24) throw new Error("Preset data is nested too deeply.");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) throw new Error(`Unsafe key: ${key}.`);
    safeKeys(child, depth + 1);
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`Unknown ${label} field: ${key}.`);
  }
}

function number(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a finite number from ${min} to ${max}.`);
  }
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be true or false.`);
  return value;
}

export function presetName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 64) {
    throw new Error("Enter a preset name from 1 to 64 characters.");
  }
  return value.trim();
}

export function copyName(name: string, entries: readonly SavedPreset[]): string {
  const used = new Set(entries.map((entry) => entry.name.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? " (copy)" : ` (copy ${index})`;
    const candidate = name.slice(0, 64 - suffix.length) + suffix;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

export function backupJSON(entries: readonly SavedPreset[]): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, presets: entries }, null, 2);
}

export class PresetValidator {
  private schemas = new Map<string, Promise<readonly ParamDescriptor[]>>();
  constructor(private readonly models: readonly PresetModel[]) {}

  private schema(model: PresetModel): Promise<readonly ParamDescriptor[]> {
    let pending = this.schemas.get(model.slug);
    if (!pending) {
      pending = model.load().then((kernel) => {
        const schema = kernel.paramSchema;
        kernel.destroy();
        return schema;
      });
      this.schemas.set(model.slug, pending);
      pending.catch(() => this.schemas.delete(model.slug));
    }
    return pending;
  }

  async snapshot(value: unknown): Promise<PresetSnapshot> {
    safeKeys(value);
    const s = record(value, "Snapshot");
    exactKeys(s, ["slug", "variant", "params", "colourOptions", "displayOptions", "resolution", "stepsPerFrame", "autoCycle", "customObstacles"], "snapshot");
    const model = this.models.find((entry) => entry.slug === s.slug);
    if (!model) throw new Error(`Unknown simulation: ${String(s.slug)}.`);
    if (s.variant !== undefined && !model.variants?.some((v) => v.variant === s.variant)) {
      throw new Error(`Unknown variant for ${model.slug}.`);
    }
    const schema = await this.schema(model);
    const params = record(s.params, "Parameters");
    if (params.modelSource !== undefined && params.modelSource !== "live") {
      throw new Error("Local prebaked models cannot be saved or imported. Return to the live model first.");
    }
    const seedSupported = model.slug === "physarum" || model.slug === "particle-life";
    const keys = schema.map((descriptor) => descriptor.key);
    exactKeys(params, seedSupported ? [...keys, "seed"] : keys, "parameter");
    for (const descriptor of schema) {
      const value = params[descriptor.key];
      if (descriptor.type === "number") {
        number(value, descriptor.min ?? -Number.MAX_VALUE, descriptor.max ?? Number.MAX_VALUE, descriptor.label);
      } else if (descriptor.type === "boolean") {
        boolean(value, descriptor.label);
      } else if (typeof value !== "string" || !descriptor.options?.includes(value)) {
        throw new Error(`Invalid option for ${descriptor.label}.`);
      }
    }
    if (params.seed !== undefined) {
      number(params.seed, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, "Seed");
      if (!Number.isInteger(params.seed)) throw new Error("Seed must be an integer.");
    }
    const colour = record(s.colourOptions, "Colour options");
    exactKeys(colour, ["preset", "invert", "gamma", "contrast", "steps", "paletteCycleReverse"], "colour option");
    if (!COLOUR_PRESETS.some((option) => option.value === colour.preset)) throw new Error("Unknown colour palette.");
    boolean(colour.invert, "Invert colours");
    boolean(colour.paletteCycleReverse, "Cycle direction");
    number(colour.gamma, 0.2, 2.5, "Gamma");
    number(colour.contrast, 0.4, 2.4, "Contrast");
    number(colour.steps, 0, 64, "Palette steps");
    if (!Number.isInteger(colour.steps)) throw new Error("Palette steps must be an integer.");
    const display = record(s.displayOptions, "Display options");
    exactKeys(display, ["dotSize", "trailFade", "bloom"], "display option");
    number(display.dotSize, 1, 6, "Point size");
    if (!Number.isInteger(display.dotSize)) throw new Error("Point size must be an integer.");
    number(display.trailFade, 0, 0.985, "Trail fade");
    number(display.bloom, 0, 1, "Bloom");
    if (typeof s.resolution !== "string" || !Object.hasOwn(RESOLUTION_TARGETS, s.resolution)) throw new Error("Unknown resolution.");
    const speed = speedProfileFor(model.slug).control;
    number(s.stepsPerFrame, speed.min, speed.max, "Playback step rate");
    boolean(s.autoCycle, "Auto-cycle");
    if (s.customObstacles !== undefined) {
      if (model.slug !== "boids" || typeof s.customObstacles !== "string") throw new Error("Custom obstacles belong to Boids and must be a layout string.");
      let layout: unknown;
      try { layout = JSON.parse(s.customObstacles); } catch { throw new Error("Custom obstacles are not valid JSON."); }
      safeKeys(layout);
      const { decodeObstacleLayout } = await import("../sims/boids/kernel.js");
      const decoded = decodeObstacleLayout(s.customObstacles, 1000, 1000);
      if (!decoded.ok) throw new Error(`Custom obstacles: ${decoded.error}`);
    } else if (model.slug === "boids" && params.obstacleLayout === "custom") {
      throw new Error("A custom Boids preset must include its obstacle field.");
    }
    return clone(s) as unknown as PresetSnapshot;
  }

  async backup(raw: string, importing = false): Promise<SavedPreset[]> {
    if (importing && new TextEncoder().encode(raw).length > MAX_IMPORT_BYTES) throw new Error("Import files must be at most 1 MiB.");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error("That file is not valid preset JSON."); }
    safeKeys(parsed);
    const envelope = record(parsed, "Preset backup");
    if (envelope.format !== FORMAT || envelope.version !== VERSION) throw new Error("Unsupported preset format or version. Expected emergence-presets version 1.");
    if (!Array.isArray(envelope.presets) || envelope.presets.length > MAX_PRESETS) throw new Error("A library can contain at most 200 personal presets.");
    const entries: SavedPreset[] = [];
    for (const item of envelope.presets) {
      const entry = record(item, "Preset");
      if (typeof entry.id !== "string" || !entry.id || entry.id.length > 160) throw new Error("Each preset needs a valid ID.");
      const name = presetName(entry.name);
      if (!importing && entries.some((p) => p.id === entry.id || p.name.toLowerCase() === name.toLowerCase())) throw new Error("Stored presets contain duplicate names or IDs.");
      entries.push({ id: entry.id, name, snapshot: await this.snapshot(entry.snapshot) });
    }
    return entries;
  }
}

export interface PresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** An overlay preserves failed writes across route changes without claiming durability. */
export class SavedPresetStore {
  readonly validator: PresetValidator;
  error = "";
  warning = "";
  raw: string | null = null;
  private entries: SavedPreset[] = [];
  private overlay = new Map<string, SavedPreset | null>();
  private corrupt = false;
  private serial: Promise<unknown> = Promise.resolve();

  constructor(models: readonly PresetModel[], private readonly storage: () => PresetStorage = () => window.localStorage) {
    this.validator = new PresetValidator(models);
  }

  private async refresh(): Promise<void> {
    this.error = "";
    this.corrupt = false;
    try {
      this.raw = this.storage().getItem(SAVED_PRESETS_KEY);
      const durable = this.raw === null ? [] : await this.validator.backup(this.raw);
      const merged = new Map(durable.map((entry) => [entry.id, entry]));
      for (const [id, entry] of this.overlay) if (!entry) merged.delete(id);
      for (const [id, entry] of this.overlay) {
        if (!entry) continue;
        const name = copyName(entry.name, [...merged.values()].filter((other) => other.id !== id));
        const reconciled = { ...entry, name };
        merged.set(id, reconciled);
        this.overlay.set(id, reconciled);
      }
      this.entries = [...merged.values()];
    } catch (error) {
      this.corrupt = true;
      this.error = `Saved presets could not be read: ${message(error)} The stored data has been left untouched. Download it for recovery or explicitly reset the library.`;
    }
  }

  async list(): Promise<SavedPreset[]> {
    return this.mutation(async () => clone(this.entries));
  }

  async get(id: string): Promise<SavedPreset | undefined> {
    return (await this.list()).find((entry) => entry.id === id);
  }

  private mutation<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.serial.then(async () => { await this.refresh(); return operation(); });
    this.serial = pending.catch(() => {});
    return pending;
  }

  private unique(name: unknown, except?: string): string {
    const trimmed = presetName(name);
    if (this.entries.some((entry) => entry.id !== except && entry.name.toLowerCase() === trimmed.toLowerCase())) throw new Error("A personal preset with that name already exists. Choose another name.");
    return trimmed;
  }

  private write(next: SavedPreset[]): void {
    let changed = false;
    try { changed = !this.corrupt && this.storage().getItem(SAVED_PRESETS_KEY) !== this.raw; } catch { /* The in-memory overlay still accepts failed storage writes. */ }
    if (changed) throw new Error("The library changed in another tab. Try the operation again.");
    if (next.length > MAX_PRESETS) throw new Error("A library can contain at most 200 personal presets.");
    const old = new Map(this.entries.map((entry) => [entry.id, entry]));
    for (const entry of next) {
      if (JSON.stringify(old.get(entry.id)) !== JSON.stringify(entry)) this.overlay.set(entry.id, clone(entry));
      old.delete(entry.id);
    }
    for (const id of old.keys()) this.overlay.set(id, null);
    this.entries = clone(next);
    try {
      if (this.corrupt) throw new Error("Stored data needs recovery");
      this.storage().setItem(SAVED_PRESETS_KEY, backupJSON(next));
      this.overlay.clear();
      this.warning = "";
    } catch {
      this.warning = "Changes are available only until reload. Browser storage is unavailable or needs recovery. Export presets to keep a backup.";
    }
  }

  create(name: string, snapshot: PresetSnapshot): Promise<SavedPreset> {
    const captured = clone(snapshot);
    return this.mutation(async () => {
      const valid = await this.validator.snapshot(captured);
      await this.refresh();
      const entry = { id: crypto.randomUUID(), name: this.unique(name), snapshot: valid };
      this.write([...this.entries, entry]);
      return clone(entry);
    });
  }

  rename(id: string, name: string): Promise<void> {
    return this.mutation(async () => {
      this.require(id);
      const trimmed = this.unique(name, id);
      this.write(this.entries.map((entry) => entry.id === id ? { ...entry, name: trimmed } : entry));
    });
  }

  duplicate(id: string, name: string): Promise<SavedPreset> {
    return this.mutation(async () => {
      const original = this.require(id);
      const entry = { id: crypto.randomUUID(), name: this.unique(name), snapshot: clone(original.snapshot) };
      this.write([...this.entries, entry]);
      return clone(entry);
    });
  }

  update(id: string, snapshot: PresetSnapshot): Promise<void> {
    const captured = clone(snapshot);
    return this.mutation(async () => {
      const valid = await this.validator.snapshot(captured);
      await this.refresh();
      this.require(id);
      this.write(this.entries.map((entry) => entry.id === id ? { ...entry, snapshot: valid } : entry));
    });
  }

  delete(id: string): Promise<SavedPreset> {
    return this.mutation(async () => {
      const entry = clone(this.require(id));
      this.write(this.entries.filter((item) => item.id !== id));
      return entry;
    });
  }

  restore(entry: SavedPreset): Promise<void> {
    const captured = clone(entry);
    return this.mutation(async () => {
      captured.snapshot = await this.validator.snapshot(captured.snapshot);
      await this.refresh();
      if (this.entries.some((item) => item.id === captured.id)) throw new Error("That preset ID is already in use.");
      captured.name = this.unique(captured.name);
      this.write([...this.entries, captured]);
    });
  }

  import(raw: string): Promise<number> {
    return this.mutation(async () => {
      const imported = await this.validator.backup(raw, true);
      await this.refresh();
      if (this.entries.length + imported.length > MAX_PRESETS) throw new Error("Import would exceed the limit of 200 personal presets.");
      const next = clone(this.entries);
      for (const entry of imported) next.push({ ...entry, id: crypto.randomUUID(), name: copyName(entry.name, next) });
      this.write(next);
      return imported.length;
    });
  }

  reset(): Promise<void> {
    return this.mutation(async () => {
      try { this.storage().setItem(SAVED_PRESETS_KEY, backupJSON([])); }
      catch { throw new Error("Browser storage refused the reset. Download the raw data or try again when storage is available."); }
      this.entries = [];
      this.overlay.clear();
      this.corrupt = false;
      this.raw = null;
      this.error = "";
      this.warning = "";
    });
  }

  private require(id: string): SavedPreset {
    const entry = this.entries.find((entry) => entry.id === id);
    if (!entry) throw new Error("This preset no longer exists. Save the current configuration as a new preset.");
    return entry;
  }
}

interface SpeedProfile {
  initial: number;
  control: { label: string; min: number; max: number; step: number };
}

export function speedProfileFor(slug: string): SpeedProfile {
  const careful: SpeedProfile["control"] = {
    label: "Simulation speed",
    min: 0.1,
    max: 4,
    step: 0.05,
  };
  const balanced: SpeedProfile["control"] = {
    label: "Simulation speed",
    min: 0.25,
    max: 8,
    step: 0.25,
  };
  const growth: SpeedProfile["control"] = {
    label: "Simulation speed",
    min: 0.5,
    max: 16,
    step: 0.5,
  };
  const fractal: SpeedProfile["control"] = {
    label: "Colour cycle multiplier",
    min: 0.5,
    max: 2,
    step: 0.05,
  };
  const swarm: SpeedProfile["control"] = {
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
    case "clifford-dejong":
      // The felt speed is pointsPerFrame; the slider multiplies whole step()
      // calls (fade sweeps included), so it stays at 1x like the attractors.
      return { initial: 1, control: careful };
    case "boids":
      // 1x, not faster: the renderer samples positions once per rendered
      // frame, so at Nx the trail accumulator sees every Nth position and the
      // streaks bead into dotted chains. At 1x they draw as the continuous
      // comet-tails the native viewer shows.
      return { initial: 1, control: swarm };
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


export function defaultDisplayOptionsFor(slug: string): PresetSnapshot["displayOptions"] {
  if (slug === "boids") {
    // Trails on by default: flocks read as flowing ribbons.
    return { dotSize: 2, trailFade: 0.93, bloom: 0.3 };
  }
  if (slug === "particle-life") {
    // Matched to the native viewer's starfield look: crisp grains on black,
    // no trail smear, just enough bloom to let dense clusters glow.
    // dotSize does not reach the glyph: the kernel's own pointSize param wins.
    return { dotSize: 2, trailFade: 0, bloom: 0.15 };
  }
  if (slug === "lorenz-attractor") {
    return { dotSize: 1, trailFade: 0, bloom: 0.4 };
  }
  if (slug === "clifford-dejong") {
    // Fading is kernel-side (its fade param); renderer trails would smear the
    // histogram. A touch of bloom lifts the saturated filament cores.
    return { dotSize: 1, trailFade: 0, bloom: 0.35 };
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

