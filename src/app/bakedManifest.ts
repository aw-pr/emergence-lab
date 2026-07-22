/**
 * Manifest of prebaked point clouds available to this deployment, written by
 * scripts/bake-orbit3d.mjs into the same directory as the binaries.
 *
 * Bakes are machine-local: the directory is gitignored and excluded from the
 * publish rsync, so on the published site the fetch 404s, the list is empty,
 * and the "Model source" control is never rendered.
 */

const MANIFEST_FILE = "baked/index.json";

export interface BakedEntry {
  /** Human-readable id; doubles as the dropdown option text. */
  id: string;
  /** Sim slug this bake belongs to. */
  sim: string;
  /** File name, relative to the manifest's own directory. */
  file: string;
  cellCount: number;
  sampleCount: number;
  points: number;
  bytes: number;
}

let manifestPromise: Promise<readonly BakedEntry[]> | null = null;
let resolved: readonly BakedEntry[] = [];

/**
 * A bake only ever exists on the machine that ran the baker, so only a locally
 * served app can have one. Anything else — the published site above all — skips
 * the fetch entirely rather than 404ing on every sim open. Private LAN ranges
 * count as local: a dev server exposed with `--host` for phone testing serves
 * the same `public/baked/` directory.
 */
function servedLocally(): boolean {
  const { hostname, protocol } = window.location;
  if (protocol === "file:") return true;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost") ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

function isEntry(value: unknown): value is BakedEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && typeof entry.sim === "string" &&
    typeof entry.file === "string";
}

/** Resolve the manifest once per session; empty when absent or malformed. */
export function loadBakedManifest(): Promise<readonly BakedEntry[]> {
  if (!manifestPromise) {
    if (!servedLocally()) {
      manifestPromise = Promise.resolve([]);
      return manifestPromise;
    }
    manifestPromise = fetch(`${import.meta.env.BASE_URL}${MANIFEST_FILE}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        const bakes = (data as { bakes?: unknown } | null)?.bakes;
        return Array.isArray(bakes) ? bakes.filter(isEntry) : [];
      })
      .catch(() => [] as BakedEntry[])
      .then((entries) => {
        resolved = entries;
        return entries;
      });
  }
  return manifestPromise;
}

/** Bakes belonging to one sim, in manifest order. */
export async function bakesFor(slug: string): Promise<readonly BakedEntry[]> {
  const entries = await loadBakedManifest();
  return entries.filter((entry) => entry.sim === slug);
}

/**
 * File name for a bake id, from the already-resolved manifest. Synchronous for
 * callers inside a render build; null before the manifest resolves, for an
 * unknown id, or for the "live" source.
 */
export function bakedFileFor(id: string): string | null {
  return resolved.find((entry) => entry.id === id)?.file ?? null;
}
