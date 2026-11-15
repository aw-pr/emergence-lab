import { test, expect, type Browser, type Page, type Locator } from "@playwright/test";

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/167-parameters-panel-opens-minimised.md
const contract = process.env.PANEL_MINIMISED === "167" ? test : test.skip;
const HINT = "Adjust parameters: arrow tab on the left";
const SIMS = ["boids", "gray-scott", "mandelbrot"];

function hint(scope: Page | Locator) {
  return scope.getByText(HINT, { exact: true });
}

async function openSim(page: Page, slug: string) {
  await page.goto(`/#/${slug}`);
  await expect(page.locator(".sim-view__canvas")).toBeVisible();
  await expect(page.locator(".sim-view")).not.toHaveClass(/sim-view--immersive/);
  await page.waitForTimeout(600);
}

async function expectMinimised(scope: Page | Locator) {
  await expect(scope.locator(".sim-view")).toHaveClass(/sim-view--controls-hidden/);
  const tab = scope.getByRole("button", { name: "Show controls", exact: true });
  await expect(tab).toBeVisible();
  await expect(tab).toHaveAttribute("aria-expanded", "false");
  await expect(scope.getByRole("button", { name: "Hide controls", exact: true })).toHaveCount(0);
}

async function openPanel(scope: Page | Locator) {
  await scope.getByRole("button", { name: "Show controls", exact: true }).click();
  await expect(scope.locator(".sim-view")).not.toHaveClass(/sim-view--controls-hidden/);
  await expect(scope.getByRole("button", { name: "Hide controls", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(scope.locator(".sim-view__sidebar")).toBeVisible();
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "element must be laid out").not.toBeNull();
  return b!;
}

function overlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function touchPage(browser: Browser, baseURL: string, width: number, height: number) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width, height },
    screen: { width: width + 400, height: height + 400 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  return { context, page: await context.newPage() };
}

contract("167 standalone desktop: every sim opens minimised with the hint in the bar", async ({ page }) => {
  for (const slug of SIMS) {
    await openSim(page, slug);
    await expectMinimised(page);
    await expect(hint(page), `${slug}: hint`).toBeVisible();
    await expect(page.locator(".sim-view__bar").getByText(HINT, { exact: true }), `${slug}: hint sits in the bar`).toHaveCount(1);
    const about = page.getByRole("button", { name: "About", exact: true });
    expect(overlap(await box(hint(page)), await box(about)), `${slug}: hint overlaps About`).toBe(false);
    const canvas = await box(page.locator(".sim-view__canvas"));
    expect(canvas.x, `${slug}: stage starts at the left edge`).toBeLessThanOrEqual(2);
  }
});

contract("167 opening the panel once retires the hint for good, and views still open minimised", async ({ page }) => {
  await openSim(page, "boids");
  await expect(hint(page)).toBeVisible();
  await openPanel(page);
  await expect(hint(page)).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".sim-view__canvas")).toBeVisible();
  await page.waitForTimeout(600);
  await expectMinimised(page);
  await expect(hint(page), "hint stays gone after a reload").toHaveCount(0);

  await openSim(page, "gray-scott");
  await expectMinimised(page);
  await expect(hint(page), "hint stays gone on another sim").toHaveCount(0);

  await openPanel(page);
  await page.getByRole("button", { name: "Hide controls", exact: true }).click();
  await expectMinimised(page);
});

contract("167 embedded: minimised, hint is a pill beside the tab, gone once opened", async ({ page }) => {
  await page.setViewportSize({ width: 1372, height: 879 });
  await page.route("**/panel-embed-167", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><body style="margin:0"><h1 style="margin:0;height:98px">Host site</h1><div id="embed" style="height:781px"></div></body></html>',
  }));
  await page.goto("/panel-embed-167");
  await page.evaluate(async () => {
    const { defineLabElement } = await import("/src/app/element.ts" as string);
    defineLabElement();
    const lab = document.createElement("emergence-lab-sim");
    lab.setAttribute("sim", "boids");
    document.getElementById("embed")!.append(lab);
  });
  const lab = page.locator("emergence-lab-sim");
  await expect(lab.locator(".sim-view__canvas")).toBeVisible();
  await page.waitForTimeout(800);
  await expect(lab.locator(".sim-view__bar")).toHaveCount(0);
  await expectMinimised(lab);
  await expect(hint(lab)).toBeVisible();
  const pill = await box(hint(lab));
  const tab = await box(lab.getByRole("button", { name: "Show controls", exact: true }));
  expect(pill.x - (tab.x + tab.width), "pill starts within 24 px of the tab's right edge").toBeLessThanOrEqual(24);
  expect(pill.x, "pill is to the right of the tab").toBeGreaterThanOrEqual(tab.x + tab.width - 1);
  expect(Math.abs(pill.y + pill.height / 2 - (tab.y + tab.height / 2)), "pill is level with the tab, px").toBeLessThanOrEqual(24);
  for (const name of ["About"]) {
    expect(overlap(pill, await box(lab.getByRole("button", { name, exact: true }))), `pill overlaps ${name}`).toBe(false);
  }
  await openPanel(lab);
  await expect(hint(lab)).toHaveCount(0);
});

contract("167 tablet: minimised with the hint; a tap on the tab opens the panel", async ({ browser, baseURL }) => {
  const { context, page } = await touchPage(browser, baseURL!, 1180, 820);
  await openSim(page, "boids");
  await expectMinimised(page);
  await expect(hint(page)).toBeVisible();
  await page.getByRole("button", { name: "Show controls", exact: true }).tap();
  await expect(page.locator(".sim-view")).not.toHaveClass(/sim-view--controls-hidden/);
  await expect(page.locator(".sim-view__sidebar")).toBeVisible();
  await expect(hint(page)).toHaveCount(0);
  await context.close();
});

contract("167 phone: no hint, the Parameters button is unchanged and the tab stays hidden", async ({ browser, baseURL }) => {
  const { context, page } = await touchPage(browser, baseURL!, 390, 844);
  await page.goto("/#/boids");
  await expect(page.locator(".sim-view__canvas")).toBeVisible();
  await page.waitForTimeout(600);
  await expect(hint(page).locator("visible=true")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Parameters$/ })).toBeVisible();
  await expect(page.locator(".sim-view__sidebar-tab")).toBeHidden();
  await context.close();
});

contract("167 blocked storage: the view still opens minimised with the hint and the panel opens", async ({ page }) => {
  await page.addInitScript(() => {
    const refuse = () => { throw new DOMException("blocked", "SecurityError"); };
    Storage.prototype.getItem = refuse;
    Storage.prototype.setItem = refuse;
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await openSim(page, "game-of-life");
  await expectMinimised(page);
  await expect(hint(page)).toBeVisible();
  await openPanel(page);
  await expect(hint(page)).toHaveCount(0);
  expect(errors, "no uncaught page errors").toEqual([]);
});
// AUTOMETTA-CONTRACT-END
