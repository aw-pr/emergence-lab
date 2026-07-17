/**
 * The current sim's name, published to the document.
 *
 * Two consumers. The tab title, which otherwise reads "emergence-lab" whatever
 * you are looking at, since the app is hash-routed and never reloads. And the
 * site's /labs/run bar, which names the sim in its own chrome: framed, the app
 * drops its title block, so the bar is the only place the name appears. The
 * bar reads the data attribute (same-origin) and observes it for changes, so
 * it keeps up with navigation inside the frame that never touches the parent
 * URL. Set it before any await, so a slow kernel load cannot let a stale name
 * land after a newer one.
 */
const SUFFIX = "Emergence Lab";

export function setSimDocumentTitle(name: string | null): void {
  document.title = name ? `${name} — ${SUFFIX}` : SUFFIX;
  if (name) {
    document.documentElement.dataset.simTitle = name;
  } else {
    delete document.documentElement.dataset.simTitle;
  }
}
