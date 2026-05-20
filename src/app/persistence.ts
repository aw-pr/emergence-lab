export type SliderBounds = { min: number; max: number };

const BOUNDS_PREFIX = "el:bounds";
const VALUES_PREFIX = "el:values";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (private mode, disabled storage, quota).
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
