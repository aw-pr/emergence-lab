export type Route =
  | { kind: "gallery" }
  | { kind: "sim"; slug: string }
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
