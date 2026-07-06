import { renderGallery } from "./gallery.ts";
import { renderSimView, type SimViewHandle } from "./simView.ts";
import { startRouter, type Route } from "./router.ts";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root element in index.html.");
}
const appRoot = root;

let currentHandle: SimViewHandle | null = null;
let token = 0;

async function show(route: Route): Promise<void> {
  const current = ++token;

  currentHandle?.dispose();
  currentHandle = null;

  switch (route.kind) {
    case "gallery":
      renderGallery(appRoot);
      return;

    case "sim": {
      appRoot.innerHTML = `<div class="loading">Loading ${escapeHtml(route.slug)}…</div>`;
      const handle = await renderSimView(appRoot, route.slug, route.variant);
      if (current !== token) {
        // A newer navigation happened while we were loading.
        handle.dispose();
        return;
      }
      currentHandle = handle;
      return;
    }

    case "not-found":
      appRoot.innerHTML = `
        <section class="not-found">
          <h1>Not found</h1>
          <p>Nothing at <code>#/${escapeHtml(route.raw)}</code>.</p>
          <p><a href="#/">Back to gallery</a></p>
        </section>
      `;
      return;
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

startRouter((route) => {
  void show(route);
});
