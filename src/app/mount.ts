import { resetActiveChrome, setActiveChrome, type LabChrome } from "./chrome.ts";
import { setSimDocumentTitle } from "./docTitle.ts";
import { renderGallery } from "./gallery.ts";
import { renderSimView, type SimViewHandle } from "./simView.ts";
import { startRouter, type Route } from "./router.ts";

export interface MountLabOptions extends Partial<Omit<LabChrome, "onTitleChange">> {
  onTitleChange?: (name: string | null) => void;
  /**
   * Pin the mount to a single sim instead of following window.location.hash.
   * Without it the mount is hash-routed exactly like the standalone app, which
   * is what an inline host page wants: #/<slug> links keep working and browser
   * history moves through sims.
   */
  fixedRoute?: { slug: string; variant?: string };
}

export interface LabMountHandle {
  dispose(): void;
  toggleImmersive(): void;
}

/**
 * Mount the lab into a host-provided element. Extracted from the standalone
 * bootstrap so the same lifecycle serves both the static app (main.ts) and the
 * web component the site embeds. Returns a handle that stops routing and
 * releases the current view's kernel and render loop.
 */
export function mountLab(
  root: HTMLElement,
  options: MountLabOptions = {},
): LabMountHandle {
  const { fixedRoute, ...chrome } = options;
  setActiveChrome(chrome);

  let currentHandle: SimViewHandle | null = null;
  let token = 0;
  let disposed = false;

  async function show(route: Route): Promise<void> {
    const current = ++token;

    currentHandle?.dispose();
    currentHandle = null;

    switch (route.kind) {
      case "gallery":
        setSimDocumentTitle(null);
        renderGallery(root);
        return;

      case "sim": {
        root.innerHTML = `<div class="loading">Loading ${escapeHtml(route.slug)}…</div>`;
        const handle = await renderSimView(root, route.slug, route.variant);
        if (current !== token) {
          // A newer navigation happened while we were loading.
          handle.dispose();
          return;
        }
        currentHandle = handle;
        return;
      }

      case "not-found":
        setSimDocumentTitle(null);
        root.innerHTML = `
          <section class="not-found">
            <h1>Not found</h1>
            <p>Nothing at <code>#/${escapeHtml(route.raw)}</code>.</p>
            <p><a href="#/">Back to gallery</a></p>
          </section>
        `;
        return;
    }
  }

  const stopRouter = fixedRoute
    ? (void show({ kind: "sim", slug: fixedRoute.slug, variant: fixedRoute.variant }),
      () => {})
    : startRouter((route) => {
        void show(route);
      });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      stopRouter();
      token += 1; // strand any in-flight show()
      currentHandle?.dispose();
      currentHandle = null;
      root.innerHTML = "";
      resetActiveChrome();
    },
    toggleImmersive() {
      // Mounting is async (renderSimView awaits the kernel load), so
      // currentHandle may still be null if this fires early — a no-op.
      currentHandle?.toggleImmersive?.();
    },
  };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
