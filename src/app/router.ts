export type Route =
  | { kind: "gallery" }
  | { kind: "presets" }
  | { kind: "sim"; slug: string; variant?: string; presetId?: string }
  | { kind: "not-found"; raw: string };

export type RouteHandler = (route: Route) => void;

export function parseHash(hash: string): Route {
  const cleaned = hash.replace(/^#\/?/, "").trim();
  if (cleaned === "" || cleaned === "gallery") {
    return { kind: "gallery" };
  }
  if (cleaned === "presets") return { kind: "presets" };
  const [path, query = ""] = cleaned.split("?");
  const presetId = new URLSearchParams(query).get("preset") ?? undefined;
  const preset = presetId !== undefined ? { presetId } : {};
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 1) {
    return { kind: "sim", slug: segments[0], ...preset };
  }
  // A second segment selects a variant within a sim family (e.g. which strange
  // attractor). #/<slug>/<variant>.
  if (segments.length === 2) {
    return { kind: "sim", slug: segments[0], variant: segments[1], ...preset };
  }
  return { kind: "not-found", raw: cleaned };
}

export function startRouter(handler: RouteHandler): () => void {
  const fire = () => handler(parseHash(window.location.hash));
  window.addEventListener("hashchange", fire);
  fire();
  return () => window.removeEventListener("hashchange", fire);
}

export function navigate(slug: string | null): void {
  window.location.hash = slug ? `#/${slug}` : "#/";
}
