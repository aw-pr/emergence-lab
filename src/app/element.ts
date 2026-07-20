import { mountLab, type LabMountHandle } from "./mount.ts";
import stylesText from "./styles.css?inline";

export const LAB_ELEMENT_TAG = "emergence-lab-sim";

/** Document-level KaTeX link, required because @font-face rules never register
 * fonts from inside a shadow root. One per document, shared by all mounts. */
const KATEX_FONTS_LINK_ID = "emergence-lab-katex-fonts";

function katexCssHref(assetBase: string): string {
  return `${assetBase}katex/katex.min.css`;
}

function ensureDocumentKatexFonts(assetBase: string): void {
  if (document.getElementById(KATEX_FONTS_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = KATEX_FONTS_LINK_ID;
  link.rel = "stylesheet";
  link.href = katexCssHref(assetBase);
  document.head.appendChild(link);
}

/**
 * Define <emergence-lab-sim> (idempotent) and return the tag name.
 *
 * The element hosts the full lab inside an open shadow root. Without a `sim`
 * attribute it is hash-routed against the host page's own URL, so existing
 * #/<slug> deep links and browser history work unchanged; with `sim` (and
 * optional `variant`) it pins to one simulation and ignores the hash.
 *
 * Attributes: sim, variant, chrome ("site-embedded" | "standalone",
 * default site-embedded), asset-base, site-gallery-href.
 * Events: "sim-title" (CustomEvent<{ title: string | null }>, bubbles,
 * composed) whenever the visible simulation changes.
 * Methods: toggleImmersive() — toggles the top-layer overlay that hides the
 * description header and parameter sidebar, letting a host page drive the
 * same immersive mode as the in-app Maximise button.
 *
 * The class is created inside this function, not at module scope, so merely
 * importing the library never touches HTMLElement — imports stay safe in
 * non-browser contexts (SSR, scripts reading the registry).
 */
export function defineLabElement(): string {
  if (customElements.get(LAB_ELEMENT_TAG)) return LAB_ELEMENT_TAG;

  class EmergenceLabSimElement extends HTMLElement {
    static observedAttributes = ["sim", "variant"];

    #handle: LabMountHandle | null = null;
    #root: HTMLDivElement | null = null;

    connectedCallback(): void {
      if (!this.shadowRoot) {
        const shadow = this.attachShadow({ mode: "open" });

        const style = document.createElement("style");
        style.textContent = stylesText;
        shadow.appendChild(style);

        // KaTeX class rules must live inside the shadow root to reach the
        // rendered markup; the same sheet is linked document-level for fonts.
        const katexLink = document.createElement("link");
        katexLink.rel = "stylesheet";
        katexLink.href = katexCssHref(this.#assetBase());
        shadow.appendChild(katexLink);

        this.#root = document.createElement("div");
        this.#root.className = "lab-root";
        shadow.appendChild(this.#root);
      }
      ensureDocumentKatexFonts(this.#assetBase());
      this.#mount();
    }

    disconnectedCallback(): void {
      this.#handle?.dispose();
      this.#handle = null;
    }

    toggleImmersive(): void {
      this.#handle?.toggleImmersive();
    }

    attributeChangedCallback(): void {
      // Remount only when live; connectedCallback handles the initial mount.
      if (this.isConnected && this.#handle) this.#mount();
    }

    #assetBase(): string {
      return this.getAttribute("asset-base") ?? import.meta.env.BASE_URL;
    }

    #mount(): void {
      if (!this.#root) return;
      this.#handle?.dispose();

      const sim = this.getAttribute("sim");
      this.#handle = mountLab(this.#root, {
        mode:
          this.getAttribute("chrome") === "standalone"
            ? "standalone"
            : "site-embedded",
        siteGalleryHref: this.getAttribute("site-gallery-href") ?? "/labs",
        assetBase: this.#assetBase(),
        onTitleChange: (title) => {
          this.dispatchEvent(
            new CustomEvent("sim-title", {
              detail: { title },
              bubbles: true,
              composed: true,
            }),
          );
        },
        fixedRoute: sim
          ? { slug: sim, variant: this.getAttribute("variant") ?? undefined }
          : undefined,
      });
    }
  }

  customElements.define(LAB_ELEMENT_TAG, EmergenceLabSimElement);
  return LAB_ELEMENT_TAG;
}
