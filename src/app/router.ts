export type Route =
  | { kind: "gallery" }
  | { kind: "sim"; slug: string; variant?: string }
  | { kind: "not-found"; raw: string };

export type RouteHandler = (route: Route) => void;

export function parseHash(hash: string): Route {
  const cleaned = hash.replace(/^#\/?/, "").trim();
  if (cleaned === "" || cleaned === "gallery") {
    return { kind: "gallery" };
  }
  const segments = cleaned.split("/").filter(Boolean);
  if (segments.length === 1) {
    return { kind: "sim", slug: segments[0] };
  }
  // A second segment selects a variant within a sim family (e.g. which strange
  // attractor). #/<slug>/<variant>.
  if (segments.length === 2) {
    return { kind: "sim", slug: segments[0], variant: segments[1] };
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
