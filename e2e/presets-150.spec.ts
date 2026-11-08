import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

test.use({ actionTimeout: 10_000 });

const KEY = "el:saved-presets:v1";
const artifact = (name: string) => `e2e/fixtures/presets-150/${name}`;
const personal = (page: Page, name: string) => page.locator('[data-preset-source="personal"]').filter({ has: page.getByText(name, { exact: true }) });
async function library(page: Page) {
  await page.getByRole("link", { name: "Presets", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Presets", exact: true })).toBeVisible();
}
async function save(page: Page, name: string) {
  await page.getByRole("button", { name: "Save preset", exact: true }).click();
  await page.getByRole("textbox", { name: "Preset name", exact: true }).fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}
async function setParam(page: Page, key: string, value: number | string | boolean) {
  await page.locator(`[data-param-key="${key}"]`).evaluate((input: HTMLInputElement | HTMLSelectElement, value) => {
    if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(value);
    else input.value = String(value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement || (input as HTMLInputElement).type === "checkbox" ? "change" : "input", { bubbles: true }));
  }, value);
}
function control(page: Page, label: string) {
  return page.locator("label.control").filter({ has: page.locator(".control__label", { hasText: new RegExp(`^${label}$`) }) });
}
async function setRange(page: Page, label: string, value: number) {
  await control(page, label).locator('input[type="range"]').evaluate((input: HTMLInputElement, value) => {
    input.value = String(value); input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
async function instrument(page: Page) {
  await page.evaluate(async () => {
    const { REGISTRY } = await import("/src/app/registry.ts" as string);
    const { Renderer } = await import("/src/app/renderer.ts" as string);
    const evidence: any = { inits: [], destroyed: 0, starts: 0 };
    (window as any).presetEvidence = evidence;
    for (const entry of REGISTRY) {
      const load = entry.load;
      entry.load = async () => {
        const kernel = await load();
        const init = kernel.init.bind(kernel);
        kernel.init = (width: number, height: number, params: any) => {
          evidence.inits.push({ slug: entry.slug, width, height, params: structuredClone(params) });
          init(width, height, params);
        };
        return kernel;
      };
    }
    const play = Renderer.prototype.play;
    const destroy = Renderer.prototype.destroy;
    Renderer.prototype.play = function () { evidence.active = this; evidence.starts++; return play.call(this); };
    Renderer.prototype.destroy = function () { evidence.destroyed++; evidence.previous = this; return destroy.call(this); };
  });
}
async function runtime(page: Page) {
  return page.evaluate(() => {
    const evidence = (window as any).presetEvidence;
    const r = evidence.active;
    return { init: evidence.inits.at(-1), colourOptions: r.colourOptions, displayOptions: r.displayOptions,
      resolution: r.resolution, stepsPerFrame: r.stepsPerFrame, autoCycle: r.autoCycle, params: r.currentParams(),
      customObstacles: r.kernel.width > 0 ? r.kernel.exportCustomObstacleLayout?.() : undefined, destroyed: evidence.destroyed, starts: evidence.starts };
  });
}

test("150 supplemental: real trial kernel inputs, defaults and lifecycle", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/#/presets");
  await instrument(page);
  await page.evaluate(() => {
    localStorage.setItem('el:values:boids', JSON.stringify({ obstacleLayout: 'custom', boidCount: 1000 }));
    localStorage.setItem('el:custom-obstacles:boids', JSON.stringify({ version: 1, obstacles: [{ kind: 'circle', x: 0.5, y: 0.5, radius: 0.1 }] }));
    localStorage.setItem('el:render:physarum', JSON.stringify({ bloom: 1, steps: 16 }));
    localStorage.setItem('el:bounds:physarum:evaporation', JSON.stringify({ min: 0.1, max: 0.9 }));
  });
  const retained: any[] = [];
  for (const slug of ["physarum", "particle-life", "boids"]) {
    const data = JSON.parse(readFileSync(`docs/sweeps/data/2026-10-30/144/${slug}.app-evidence.json`, "utf8"));
    const row = data.rows.find((r: any) => r.kind === "finalist" && r.population.startsWith("shipped"));
    const item = page.locator(`[data-preset-source="trial"][data-preset-slug="${slug}"]`).first();
    await item.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save preset", exact: true })).toBeVisible();
    const actual = await runtime(page);
    for (const [key, value] of Object.entries(row.params)) expect(actual.init.params[key], `${slug}.${key}`).toEqual(value);
    const defaults = await page.evaluate(async slug => {
      const { findEntry } = await import("/src/app/registry.ts" as string);
      const { defaultColourOptionsFor } = await import("/src/app/colormap.ts" as string);
      const { defaultDisplayOptionsFor, speedProfileFor } = await import("/src/app/savedPresets.ts" as string);
      const { qualityProfileFor } = await import("/src/app/qualityProfiles.ts" as string);
      const { getRenderMode } = await import("/src/app/renderModes.ts" as string);
      const kernel = await findEntry(slug).load();
      const colourOptions = defaultColourOptionsFor(slug, kernel.channelCount); kernel.destroy();
      return { colourOptions, displayOptions: defaultDisplayOptionsFor(slug), resolution: qualityProfileFor(slug, getRenderMode(slug), "desktop").defaultPreset, stepsPerFrame: speedProfileFor(slug).initial, autoCycle: false };
    }, slug);
    for (const [key, value] of Object.entries(defaults)) expect((actual as any)[key], `${slug}.${key}`).toEqual(value);
    if (slug === "boids") expect(JSON.parse(actual.customObstacles).obstacles).toEqual([]);
    await page.screenshot({ path: artifact(`live-${slug}.png`) });
    retained.push({ slug, sourceRow: row.id, expectedParams: row.params, actual });
    await library(page);
    expect(await page.evaluate(() => (window as any).presetEvidence.previous.running)).toBe(false);
    expect((await runtime(page)).destroyed).toBe(retained.length * 2 - 1);
    await page.goBack();
    await expect(page.getByRole("button", { name: "Save preset", exact: true })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("heading", { name: "Presets", exact: true })).toBeVisible();
    // A second launch from history must also be disposed.
    retained.at(-1).historyDestroyed = (await runtime(page)).destroyed;
    expect(retained.at(-1).historyDestroyed).toBe(retained.length * 2);
  }
  expect(errors).toEqual([]);
  writeFileSync(artifact("runtime-trials.json"), JSON.stringify(retained, null, 2));
});

test("150 supplemental: full visual configuration, custom Boids field and session isolation", async ({ page }) => {
  await page.goto("/#/presets"); await instrument(page);
  await page.evaluate(() => { location.hash = "#/boids"; });
  await expect(page.getByRole("button", { name: "Save preset", exact: true })).toBeVisible();
  const drawer = page.getByRole("button", { name: "Show settings", exact: true });
  if (await drawer.isVisible()) await drawer.click();
  await setParam(page, "boidCount", 1000);
  await setParam(page, "obstacleLayout", "custom");
  await setRange(page, "Gamma", 1.35);
  await setRange(page, "Contrast", 1.6);
  await setRange(page, "Palette steps", 7);
  await setRange(page, "Bloom", 0.45);
  await setRange(page, "Trail fade", 0.87);
  await setRange(page, "Simulation speed", 2);
  await control(page, "Palette").locator("select").selectOption("ice");
  await control(page, "Invert colours").locator("input").check();
  await control(page, "Grid quality").locator("select").selectOption("balanced");
  const canvas = page.locator(".sim-view__canvas");
  await canvas.click({ position: { x: 520, y: 180 } });
  await save(page, "Custom field");
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).presets[0], KEY);
  expect(JSON.parse(saved.snapshot.customObstacles).obstacles).toHaveLength(1);
  const ordinary = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => /^el:(values|render|resolution|custom-obstacles):/.test(key))));
  await library(page);
  await personal(page, "Custom field").getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("button", { name: "Update preset", exact: true })).toBeVisible();
  const actual = await runtime(page);
  for (const key of ["params", "colourOptions", "displayOptions", "resolution", "stepsPerFrame", "autoCycle"]) expect((actual as any)[key], key).toEqual(saved.snapshot[key]);
  expect(actual.customObstacles).toBe(saved.snapshot.customObstacles);
  await setParam(page, "boidCount", 2000);
  await setRange(page, "Bloom", 0.1);
  await control(page, "Grid quality").locator("select").selectOption("high");
  await canvas.click({ position: { x: 590, y: 210 } });
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => /^el:(values|render|resolution|custom-obstacles):/.test(key))))).toEqual(ordinary);
  const reopenedDrawer = page.getByRole("button", { name: "Show settings", exact: true });
  if (await reopenedDrawer.isVisible()) await reopenedDrawer.click();
  await page.getByRole("button", { name: "Reset to defaults", exact: true }).click();
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => /^el:(values|render|resolution|custom-obstacles):/.test(key))))).toEqual(ordinary);
  await library(page);
  await personal(page, "Custom field").getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("button", { name: "Update preset", exact: true })).toBeVisible();
  expect((await runtime(page)).params).toEqual(saved.snapshot.params);
  writeFileSync(artifact("runtime-custom-field.json"), JSON.stringify({ saved: saved.snapshot, restored: actual }, null, 2));
});

test("150 supplemental: concurrent deletion, stale IDs and nonnumeric variant settings", async ({ page, context }) => {
  await page.goto("/#/clifford-dejong/dejong");
  await setParam(page, "colourMode", "angle");
  await save(page, "Variant"); await library(page);
  await personal(page, "Variant").getByRole("button", { name: "Open", exact: true }).click();
  const route = page.url();
  await expect(page.locator('[data-param-key="map"]')).toHaveValue("dejong");
  await expect(page.locator('[data-param-key="colourMode"]')).toHaveValue("angle");
  const other = await context.newPage(); await other.goto("/#/presets");
  await personal(other, "Variant").getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Update preset", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("no longer exists");
  await save(page, "Recovered");
  await page.goto(route);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Preset unavailable" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Presets", exact: true })).toBeVisible();
  await other.close();
});

test("150 supplemental: malformed storage recovery, atomic validation and limits in browser", async ({ page }) => {
  await page.goto("/#/game-of-life"); await save(page, "Good");
  await page.evaluate(key => localStorage.setItem(key, '{broken'), KEY);
  await library(page);
  await expect(page.getByRole("alert")).toContainText("left untouched");
  await expect(personal(page, "Good")).toHaveCount(1);
  await page.reload();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download raw data" }).click();
  expect(readFileSync((await (await download).path())!, "utf8")).toBe('{broken');
  await page.getByRole("button", { name: "Reset library", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset library", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("alert")).toBeHidden();
  await expect(page.locator('[data-preset-source="personal"]')).toHaveCount(0);
  const upload = async (buffer: Buffer) => page.getByLabel("Import presets", { exact: true }).setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer });
  const before = await page.evaluate(key => localStorage.getItem(key), KEY);
  await upload(Buffer.alloc(1024 * 1024 + 1, 32));
  await expect(page.getByRole("alert")).toContainText("1 MiB");
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(before);
});

test("150 supplemental: keyboard dialogs and mobile states", async ({ page }) => {
  await page.goto("/#/game-of-life");
  const saveButton = page.getByRole("button", { name: "Save preset", exact: true });
  await saveButton.click();
  const name = page.getByRole("textbox", { name: "Preset name", exact: true });
  await expect(name).toBeFocused();
  await page.keyboard.press("Escape"); await expect(saveButton).toBeFocused();
  await save(page, "Mobile configuration"); await library(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Search presets", { exact: true }).fill("not here");
  await expect(page.getByRole("heading", { name: "No matching presets" })).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: artifact("mobile-empty.png"), fullPage: true });
  await page.getByLabel("Search presets", { exact: true }).fill("");
  await personal(page, "Mobile configuration").getByRole("button", { name: "Rename", exact: true }).click();
  await page.screenshot({ path: artifact("mobile-dialog.png") });
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.getByRole("dialog").getByRole("button", { name: "Save", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(name).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(personal(page, "Mobile configuration").getByRole("button", { name: "Rename", exact: true })).toBeFocused();
  await page.screenshot({ path: artifact("library-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: artifact("library-desktop.png"), fullPage: true });
});

test("150 supplemental: embedded host chrome, fixed route and hash lifecycle", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/preset-embed-test", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><h1>Host site</h1><div id="embed"></div></body></html>' }));
  await page.goto("/preset-embed-test");
  await instrument(page);
  await page.evaluate(async () => {
    const { defineLabElement } = await import("/src/app/element.ts" as string);
    defineLabElement();
    const fixed = document.createElement("emergence-lab-sim");
    fixed.setAttribute("sim", "game-of-life"); fixed.setAttribute("site-gallery-href", "/host-gallery");
    document.getElementById("embed")!.append(fixed);
  });
  await expect(page.locator("emergence-lab-sim canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save preset", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Presets", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "← Gallery" })).toHaveAttribute("href", "/host-gallery");
  await page.evaluate(() => { location.hash = "#/presets"; });
  await expect(page.locator("emergence-lab-sim canvas")).toBeVisible();
  expect((await runtime(page)).destroyed).toBe(0);
  await page.evaluate(() => { document.querySelector("emergence-lab-sim")!.remove(); });
  expect((await runtime(page)).destroyed).toBe(1);
  await page.evaluate(() => {
    const host = document.createElement("emergence-lab-sim");
    host.setAttribute("site-gallery-href", "/host-gallery");
    document.getElementById("embed")!.append(host);
  });
  await expect(page.getByRole("heading", { name: "Presets", exact: true })).toBeVisible();
  await page.locator('[data-preset-source="trial"][data-preset-slug="boids"]').first().getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save preset", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Host site" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Gallery" })).toHaveAttribute("href", "/host-gallery");
  await library(page);
  expect((await runtime(page)).destroyed).toBe(2);
  await page.goBack(); await expect(page.getByRole("button", { name: "Save preset", exact: true })).toBeVisible();
  await page.goForward(); await expect(page.getByRole("heading", { name: "Presets", exact: true })).toBeVisible();
  expect((await runtime(page)).destroyed).toBe(3);
  expect(errors).toEqual([]);
});

test("150 supplemental: all available models and variants validate without quantization", async ({ page }) => {
  await page.goto("/#/presets");
  const result = await page.evaluate(async () => {
    const { REGISTRY } = await import("/src/app/registry.ts" as string);
    const { PresetValidator, defaultDisplayOptionsFor, speedProfileFor } = await import("/src/app/savedPresets.ts" as string);
    const { defaultColourOptionsFor } = await import("/src/app/colormap.ts" as string);
    const { qualityProfileFor } = await import("/src/app/qualityProfiles.ts" as string);
    const { getRenderMode } = await import("/src/app/renderModes.ts" as string);
    const validator = new PresetValidator(REGISTRY);
    const checked: string[] = [];
    for (const model of REGISTRY) {
      const kernel = await model.load();
      const params = Object.fromEntries(kernel.paramSchema.map((p: any) => [p.key, p.default]));
      const base = { slug: model.slug, params, colourOptions: defaultColourOptionsFor(model.slug, kernel.channelCount), displayOptions: defaultDisplayOptionsFor(model.slug), resolution: qualityProfileFor(model.slug, getRenderMode(model.slug)).defaultPreset, stepsPerFrame: speedProfileFor(model.slug).initial, autoCycle: false };
      kernel.destroy();
      for (const variant of [undefined, ...(model.variants ?? [])]) {
        const snapshot = { ...base, ...(variant ? { variant: variant.variant } : {}), params: { ...params, ...(variant?.params ?? {}) } };
        const valid = await validator.snapshot(snapshot);
        if (JSON.stringify(snapshot) !== JSON.stringify(valid)) throw new Error(`Changed ${model.slug}`);
        checked.push(model.slug + (variant ? `/${variant.variant}` : ""));
      }
    }
    return checked;
  });
  expect(result).toContain("lorenz-attractor/rossler");
  expect(result).toContain("clifford-dejong/svensson");
  expect(result).not.toContain("swarmalators");
  expect(result).not.toContain("markus-lyapunov");
  expect(result.length).toBeGreaterThanOrEqual(20);
  writeFileSync(artifact("validated-models.json"), JSON.stringify(result, null, 2));
});

test("150 supplemental: out-of-range save refusal leaves the live configuration running", async ({ page }) => {
  await page.goto("/#/presets"); await instrument(page);
  await page.evaluate(() => { location.hash = "#/game-of-life"; });
  await expect(page.getByRole("button", { name: "Save preset", exact: true })).toBeVisible();
  const drawer = page.getByRole("button", { name: "Show settings", exact: true });
  if (await drawer.isVisible()) await drawer.click();
  const row = page.locator('[data-param-key="birthMin"]').locator('..');
  await row.getByRole("button", { name: /^Adjust/ }).click();
  await row.locator('.control__tune-field').filter({ has: page.getByText("Max", { exact: true }) }).locator('input').fill('20');
  await row.getByRole("button", { name: "Apply", exact: true }).click();
  await setParam(page, "birthMin", 10);
  const before = (await runtime(page)).params;
  await page.getByRole("button", { name: "Save preset", exact: true }).click();
  await page.getByRole("textbox", { name: "Preset name", exact: true }).fill("Outside portable bounds");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("finite number");
  expect((await runtime(page)).params).toEqual(before);
  expect(await page.evaluate(() => (window as any).presetEvidence.active.running)).toBe(true);
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();
  await page.keyboard.press("Escape");
});
