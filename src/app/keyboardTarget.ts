/**
 * Whether a window-level keyboard event originated in an editable control, so
 * global shortcuts must leave it alone. Reads composedPath() rather than
 * event.target: when the app is mounted inside a shadow root (the site's web
 * component), events crossing the shadow boundary are retargeted to the host
 * element, and event.target would hide that the user is typing in an input.
 */
export function isEditableKeyboardEvent(event: KeyboardEvent): boolean {
  const origin = event.composedPath()[0] ?? event.target;
  if (!(origin instanceof HTMLElement)) return false;
  if (origin.isContentEditable) return true;
  const tag = origin.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON";
}
