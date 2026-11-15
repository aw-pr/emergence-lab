import { expect, type Locator, type Page } from "@playwright/test";

/** Open the active layout's panel through its normal user control. */
export async function openControls(scope: Page | Locator): Promise<void> {
  await expect(scope.locator(".sim-view__canvas")).toHaveAttribute("data-renderer", /webgl2|canvas2d/);
  const view = scope.locator(".sim-view");
  const immersive = (await view.getAttribute("class"))?.split(/\s+/).includes("sim-view--immersive");
  const phoneToggle = scope.locator(".sim-view__params-toggle");
  const toggle = immersive
    ? scope.locator(".sim-view__drawer-handle")
    : await phoneToggle.isVisible()
      ? phoneToggle
      : scope.locator(".sim-view__sidebar-tab");
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(scope.locator(".sim-view__sidebar")).toBeInViewport();
}
