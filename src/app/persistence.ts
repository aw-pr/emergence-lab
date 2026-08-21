import {
  removeObstacleLayoutSlot,
  upsertObstacleLayoutSlot,
  type CustomObstacleLayoutSlot,
} from "../sims/boids/layoutStore.ts";
export type { CustomObstacleLayoutSlot } from "../sims/boids/layoutStore.ts";

export type SliderBounds = { min: number; max: number };

const BOUNDS_PREFIX = "el:bounds";
const VALUES_PREFIX = "el:values";
const RESOLUTION_PREFIX = "el:resolution";
const SECTIONS_PREFIX = "el:sections";
const CUSTOM_OBSTACLES_PREFIX = "el:custom-obstacles";
const CUSTOM_OBSTACLE_LAYOUTS_PREFIX = "el:custom-obstacle-layouts";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Ignore storage failures (private mode, disabled storage, quota).
    return false;
  }
}

function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures (private mode, disabled storage, quota).
  }
}

function boundsKey(slug: string, paramKey: string): string {
  return `${BOUNDS_PREFIX}:${slug}:${paramKey}`;
}

function valuesKey(slug: string): string {
  return `${VALUES_PREFIX}:${slug}`;
}

export function loadBounds(slug: string, paramKey: string): SliderBounds | null {
  const raw = readStorage(boundsKey(slug, paramKey));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SliderBounds>;
    if (
      typeof parsed.min !== "number" ||
      !Number.isFinite(parsed.min) ||
      typeof parsed.max !== "number" ||
      !Number.isFinite(parsed.max)
    ) {
      return null;
    }
    return { min: parsed.min, max: parsed.max };
  } catch {
    return null;
  }
}

export function saveBounds(slug: string, paramKey: string, bounds: SliderBounds): void {
  writeStorage(boundsKey(slug, paramKey), JSON.stringify(bounds));
}

export function clearBounds(slug: string, paramKey?: string): void {
  if (paramKey) {
    removeStorage(boundsKey(slug, paramKey));
    return;
  }

  try {
    const prefix = `${BOUNDS_PREFIX}:${slug}:`;
    const keysToDelete: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures (private mode, disabled storage, quota).
  }
}

export function loadValues(
  slug: string,
): Record<string, number | boolean | string> | null {
  const raw = readStorage(valuesKey(slug));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const out: Record<string, number | boolean | string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "string"
      ) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return null;
  }
}

export function saveValues(
  slug: string,
  values: Record<string, number | boolean | string>,
): void {
  writeStorage(valuesKey(slug), JSON.stringify(values));
}

export function clearValues(slug: string): void {
  removeStorage(valuesKey(slug));
}

function customObstaclesKey(slug: string): string {
  return `${CUSTOM_OBSTACLES_PREFIX}:${slug}`;
}

export function loadCustomObstacleField(
  slug: string,
): string | readonly unknown[] | null {
  const raw = readStorage(customObstaclesKey(slug));
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return parsed && typeof parsed === "object" ? raw : null;
  } catch {
    return null;
  }
}

export function saveCustomObstacleField(
  slug: string,
  serialised: string,
): void {
  writeStorage(customObstaclesKey(slug), serialised);
}

function customObstacleLayoutsKey(slug: string): string {
  return `${CUSTOM_OBSTACLE_LAYOUTS_PREFIX}:${slug}`;
}

export function loadCustomObstacleLayouts(
  slug: string,
): CustomObstacleLayoutSlot[] {
  const raw = readStorage(customObstacleLayoutsKey(slug));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((candidate) => {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        !("name" in candidate) ||
        !("layout" in candidate) ||
        typeof candidate.name !== "string" ||
        typeof candidate.layout !== "string"
      ) {
        return [];
      }
      const name = candidate.name.trim();
      return name ? [{ name, layout: candidate.layout }] : [];
    });
  } catch {
    return [];
  }
}

export function saveCustomObstacleLayout(
  slug: string,
  name: string,
  layout: string,
): boolean {
  const trimmed = name.trim().slice(0, 64);
  if (!trimmed || !layout) return false;
  const slots = upsertObstacleLayoutSlot(
    loadCustomObstacleLayouts(slug),
    trimmed,
    layout,
  );
  return writeStorage(customObstacleLayoutsKey(slug), JSON.stringify(slots));
}

export function deleteCustomObstacleLayout(
  slug: string,
  name: string,
): boolean {
  const slots = loadCustomObstacleLayouts(slug);
  const remaining = removeObstacleLayoutSlot(slots, name);
  if (remaining.length === slots.length) return false;
  return writeStorage(
    customObstacleLayoutsKey(slug),
    JSON.stringify(remaining),
  );
}

/**
 * Renderer-side visual options that live outside the kernel's SimParams:
 * palette quantisation and (later) trail/bloom post-processing. Persisted
 * separately so the colour/effects panel survives reload without changing how
 * the core colour controls (gamma/contrast/preset) behave.
 */
export interface RenderOptionsStore {
  steps?: number;
  trailFade?: number;
  bloom?: number;
  autoCycle?: boolean;
}

const RENDER_PREFIX = "el:render";

function renderKey(slug: string): string {
  return `${RENDER_PREFIX}:${slug}`;
}

export function loadRenderOptions(slug: string): RenderOptionsStore | null {
  const raw = readStorage(renderKey(slug));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const out: RenderOptionsStore = {};
    if (typeof parsed.steps === "number" && Number.isFinite(parsed.steps)) {
      out.steps = parsed.steps;
    }
    if (typeof parsed.trailFade === "number" && Number.isFinite(parsed.trailFade)) {
      out.trailFade = parsed.trailFade;
    }
    if (typeof parsed.bloom === "number" && Number.isFinite(parsed.bloom)) {
      out.bloom = parsed.bloom;
    }
    if (typeof parsed.autoCycle === "boolean") {
      out.autoCycle = parsed.autoCycle;
    }
    return out;
  } catch {
    return null;
  }
}

export function saveRenderOptions(slug: string, options: RenderOptionsStore): void {
  writeStorage(renderKey(slug), JSON.stringify(options));
}

export function clearRenderOptions(slug: string): void {
  removeStorage(renderKey(slug));
}

function resolutionKey(slug: string): string {
  return `${RESOLUTION_PREFIX}:${slug}`;
}

/** The stored resolution-preset id for a sim, or null. Caller validates it. */
export function loadResolution(slug: string): string | null {
  return readStorage(resolutionKey(slug));
}

export function saveResolution(slug: string, preset: string): void {
  writeStorage(resolutionKey(slug), preset);
}

export function clearResolution(slug: string): void {
  removeStorage(resolutionKey(slug));
}

function sectionKey(slug: string, label: string): string {
  return `${SECTIONS_PREFIX}:${slug}:${label}`;
}

/** Stored collapsed flag for a controls section, or null when never toggled. */
export function loadSectionCollapsed(
  slug: string,
  label: string,
): boolean | null {
  const raw = readStorage(sectionKey(slug, label));
  return raw === null ? null : raw === "1";
}

export function saveSectionCollapsed(
  slug: string,
  label: string,
  collapsed: boolean,
): void {
  writeStorage(sectionKey(slug, label), collapsed ? "1" : "0");
}
