import type { SimKernel } from "./types.ts";
import { findEntry } from "./registry.ts";

/**
 * Public loader API used by the renderer. Given a slug, returns a fresh
 * SimKernel instance. The renderer never imports kernel files directly.
 */
export async function loadKernel(slug: string): Promise<SimKernel> {
  const entry = findEntry(slug);
  if (!entry) {
    throw new Error(`Unknown simulation slug: ${slug}`);
  }
  return entry.load();
}
