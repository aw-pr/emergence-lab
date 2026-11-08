import { test, expect, type Page, type Locator } from "@playwright/test";

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/155-stage-takes-the-screen.md
const contract = process.env.STAGE_SCREEN_CONTRACT === "155" ? test : test.skip;

async function openSim(page: Page) {
  await page.goto("/#/particle-life");
  await expect(page.locator(".sim-view__canvas")).toBeVisible();
  await expect(page.locator(".controls")).toBeAttached();
  await expect(page.locator(".sim-view")).not.toHaveClass(/sim-view--immersive/);
  await page.waitForTimeout(1000);
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "element must be laid out").not.toBeNull();
  return b!;
}

async function iterations(scope: Locator): Promise<number> {
  const text = (await scope.locator(".controls__iteration").first().textContent()) ?? "";
  expect(text, "iteration counter").toMatch(/iter\s+[\d,]+/);
  return Number(text.replace(/[^0-9]/g, ""));
}

// About opens the narrative in a top-layer panel over a sim that keeps running;
// Escape closes it and focus returns to the button.
async function aboutOverRunningSim(page: Page, scope: Locator) {
  const about = scope.getByRole("button", { name: "About", exact: true });
  await expect(about).toBeVisible();
  await about.click();
  const origin = scope.getByRole("heading", { name: /^origin$/i });
  const maths = scope.getByRole("heading", { name: /^the maths$/i });
  await expect(origin).toBeVisible();
  await expect(maths).toBeVisible();
  expect(await origin.evaluate((h) => !!h.closest(":popover-open, dialog:modal")), "About panel must be in the top layer").toBe(true);
  const before = await iterations(scope);
  await page.waitForTimeout(1500);
  expect(await iterations(scope), "the sim keeps running while About is open").toBeGreaterThan(before);
  await page.keyboard.press("Escape");
  await expect(origin).toBeHidden();
  await expect(about).toBeFocused();
}

async function canvasWidth(page: Page) {
  return (await box(page.locator(".sim-view__canvas"))).width;
}

contract("155 standalone: no header, stage within 48 px of the top, About over a running sim", async ({ page }) => {
  await openSim(page);
  await expect(page.locator(".sim-view__header")).toHaveCount(0);
  const canvas = await box(page.locator(".sim-view__canvas"));
  expect(canvas.y, "canvas top in px").toBeLessThanOrEqual(48);
  await expect(page.locator(".controls__title")).toBeVisible();
  await aboutOverRunningSim(page, page.locator("body"));
});

contract("155 presets live in the sidebar; the hide tab reflows the stage and persists", async ({ page }) => {
  await openSim(page);
  const sidebar = page.locator(".sim-view__sidebar");
  await expect(page.getByRole("button", { name: "Save preset", exact: true })).toHaveCount(1);
  await expect(sidebar.getByRole("button", { name: "Save preset", exact: true })).toHaveCount(1);
  await expect(sidebar.getByRole("link", { name: "Presets", exact: true })).toHaveCount(1);

  await sidebar.getByRole("button", { name: "Save preset", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Preset name", exact: true }).fill("Sidebar 155");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  const status = sidebar.getByRole("status").filter({ hasText: /\S/ });
  await expect(status.first()).toBeVisible();
  const sb = await box(sidebar);
  for (const s of await status.all()) {
    const b = await box(s);
    expect(b.x, "status starts inside the sidebar").toBeGreaterThanOrEqual(sb.x - 1);
    expect(b.x + b.width, "status ends inside the sidebar").toBeLessThanOrEqual(sb.x + sb.width + 1);
  }
  expect(await sidebar.evaluate((el) => el.scrollWidth - el.clientWidth), "sidebar horizontal overflow").toBeLessThanOrEqual(1);

  const hide = page.getByRole("button", { name: "Hide controls", exact: true });
  await expect(hide).toHaveCount(1);
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  const w0 = await canvasWidth(page);
  await hide.click();
  const show = page.getByRole("button", { name: "Show controls", exact: true });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => canvasWidth(page), { message: "hidden sidebar widens the canvas by 280 px" }).toBeGreaterThanOrEqual(w0 + 280);

  await page.reload();
  await expect(page.locator(".sim-view__canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show controls", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => canvasWidth(page), { message: "hidden state survives a reload" }).toBeGreaterThanOrEqual(w0 + 280);

  await page.getByRole("button", { name: "Show controls", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hide controls", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect.poll(async () => Math.abs((await canvasWidth(page)) - w0), { message: "Show controls restores the canvas width" }).toBeLessThanOrEqual(4);
  await page.reload();
  await expect(page.locator(".sim-view__canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide controls", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect.poll(async () => Math.abs((await canvasWidth(page)) - w0), { message: "shown state survives a reload" }).toBeLessThanOrEqual(4);
});

contract("155 embedded fixture: no lab bar, Gallery keeps its href, About works, no sidebar heading", async ({ page }) => {
  await page.setViewportSize({ width: 1372, height: 879 });
  await page.route("**/stage-embed-155", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><body style="margin:0"><h1 style="margin:0;height:98px">Host site</h1><div id="embed" style="height:781px"></div></body></html>',
  }));
  await page.goto("/stage-embed-155");
  await page.evaluate(async () => {
    const { defineLabElement } = await import("/src/app/element.ts" as string);
    defineLabElement();
    const lab = document.createElement("emergence-lab-sim");
    lab.setAttribute("sim", "game-of-life");
    lab.setAttribute("site-gallery-href", "/host-gallery");
    document.getElementById("embed")!.append(lab);
  });
  const lab = page.locator("emergence-lab-sim");
  await expect(lab.locator(".sim-view__canvas")).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(lab.locator(".sim-view__header")).toHaveCount(0);
  const host = await box(lab);
  const canvas = await box(lab.locator(".sim-view__canvas"));
  expect(canvas.y - host.y, "canvas top below the lab element top, px").toBeLessThanOrEqual(8);
  const gallery = lab.getByRole("link", { name: "← Gallery" });
  await expect(gallery).toBeVisible();
  await expect(gallery).toHaveAttribute("href", "/host-gallery");
  await expect(lab.getByRole("button", { name: "Save preset", exact: true })).toHaveCount(0);
  await expect(lab.getByRole("link", { name: "Presets", exact: true })).toHaveCount(0);
  await expect(lab.locator(".controls__title:visible")).toHaveCount(0);
  await aboutOverRunningSim(page, lab);
  const hostOrigin = lab.getByRole("heading", { name: /^origin$/i });
  await lab.evaluate((el) => (el as unknown as { toggleAbout(): void }).toggleAbout());
  await expect(hostOrigin, "element.toggleAbout() opens About").toBeVisible();
  await lab.evaluate((el) => (el as unknown as { toggleAbout(): void }).toggleAbout());
  await expect(hostOrigin, "element.toggleAbout() closes About").toBeHidden();
});

contract("155 regression: immersive drawer and exit unchanged, About hidden in immersive", async ({ page }) => {
  await openSim(page);
  const about = page.getByRole("button", { name: "About", exact: true });
  await expect(about).toBeVisible();
  await page.locator(".controls").getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.locator(".sim-view")).toHaveClass(/sim-view--immersive/);
  await expect(about).toBeHidden();
  await page.locator(".sim-view__drawer-handle").click();
  await expect(page.locator(".sim-view__sidebar")).toHaveClass(/sim-view__sidebar--open/);
  const drawer = await box(page.locator(".sim-view__sidebar"));
  const vw = page.viewportSize()!.width;
  expect(drawer.x, "immersive drawer sits on the right half").toBeGreaterThan(vw / 2);
  expect(drawer.x + drawer.width, "immersive drawer reaches the right edge").toBeGreaterThanOrEqual(vw - 2);
  await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
  await expect(page.locator(".sim-view")).not.toHaveClass(/sim-view--immersive/);
});

test.describe("155 phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
contract("155 regression: phone Parameters drawer unchanged; phone About opens full width", async ({ page }) => {
  await openSim(page);
  const params = page.locator(".sim-view__params-toggle");
  await expect(params).toHaveText(/Parameters/);
  await expect(params).toBeVisible();
  await params.click();
  await expect(page.locator(".sim-view")).toHaveClass(/sim-view--params-open/);
  await expect(params).toHaveAttribute("aria-expanded", "true");
  const sheet = await box(page.locator(".sim-view__sidebar"));
  expect(sheet.x, "phone drawer starts at the left edge").toBeLessThanOrEqual(2);
  expect(sheet.width, "phone drawer spans the width").toBeGreaterThanOrEqual(386);
  expect(sheet.y + sheet.height, "phone drawer reaches the bottom edge").toBeGreaterThanOrEqual(842);
  expect(sheet.y, "phone drawer rises from the bottom").toBeGreaterThanOrEqual(844 * 0.25);
  await params.click();
  await expect(page.locator(".sim-view")).not.toHaveClass(/sim-view--params-open/);

  const phoneAbout = page.getByRole("button", { name: "About", exact: true });
  await expect(phoneAbout).toBeVisible();
  await phoneAbout.click();
  const origin = page.getByRole("heading", { name: /^origin$/i });
  await expect(origin).toBeVisible();
  const panelWidth = await origin.evaluate((h) => (h.closest(":popover-open, dialog") ?? h).getBoundingClientRect().width);
  expect(panelWidth, "phone About panel width").toBeGreaterThanOrEqual(351);
  await page.keyboard.press("Escape");
  await expect(origin).toBeHidden();
});
});
// AUTOMETTA-CONTRACT-END
