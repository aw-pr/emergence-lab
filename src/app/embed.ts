/**
 * Where is this document running? Three deployments share one bundle:
 * standalone Netlify (base "/", top-level), the site build opened directly
 * (base "/labs/app/", top-level), and the site build framed by the /labs/run
 * shell (base "/labs/app/", iframe). Navigation chrome differs per case.
 */

/** True unless this document is rendered inside another document's iframe.
 * Wrapped in try/catch because cross-origin frames throw on window.top
 * access; same-origin here, but this must never break the standalone build. */
export function isTopLevelWindow(): boolean {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

/** True when the site build of the app is framed by the site's /labs/run
 * shell, so links back to the gallery should target the site's /labs page in
 * the parent window rather than the app's internal gallery. */
export function isFramedBySite(): boolean {
  return import.meta.env.BASE_URL !== "/" && !isTopLevelWindow();
}
