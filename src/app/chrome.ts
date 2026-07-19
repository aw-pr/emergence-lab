import { isFramedBySite } from "./embed.ts";

/**
 * How the app's navigation chrome should behave for the current mount.
 *
 * "standalone": the app owns its gallery and title block (Netlify deploy,
 * direct /labs/app/ visits, and the legacy iframe shell, which maps onto the
 * same rules via isFramedBySite()).
 *
 * "site-embedded": the app is mounted inline in a host page that provides its
 * own navigation and heading. Back links leave for the host's gallery, the
 * in-view title block is dropped, and title changes are published to the host
 * through a callback instead of only the document.
 */
export type ChromeMode = "standalone" | "site-embedded";

export interface LabChrome {
  mode: ChromeMode;
  /** Where "← Gallery" goes when the host site owns the gallery. */
  siteGalleryHref: string;
  /** Base URL for static assets (thumbnails, KaTeX css). */
  assetBase: string;
  /** Host notification for sim title changes (site-embedded mounts). */
  onTitleChange?: (name: string | null) => void;
}

function defaultChrome(): LabChrome {
  return {
    mode: "standalone",
    siteGalleryHref: "/labs",
    assetBase: import.meta.env.BASE_URL,
  };
}

/**
 * Module-level rather than threaded through every render call: the render tree
 * (gallery, sim view, controls) is deep and a document realistically hosts one
 * lab at a time. Multiple simultaneous mounts would share this configuration.
 */
let activeChrome: LabChrome = defaultChrome();

export function setActiveChrome(chrome: Partial<LabChrome>): void {
  activeChrome = { ...defaultChrome(), ...chrome };
}

export function resetActiveChrome(): void {
  activeChrome = defaultChrome();
}

export function getChrome(): LabChrome {
  return activeChrome;
}

/** True when a host site's chrome (bar or page heading) names the sim, so the
 * in-view title block and the app's own gallery are redundant. */
export function siteOwnsChrome(): boolean {
  return activeChrome.mode === "site-embedded" || isFramedBySite();
}

/** Standalone site build opened top-level: offer a way back to the site. The
 * framed and embedded cases already sit inside the site's own navigation. */
export function showBackToSiteLink(): boolean {
  return (
    activeChrome.mode === "standalone" &&
    import.meta.env.BASE_URL !== "/" &&
    !isFramedBySite()
  );
}
