import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/150-saved-preset-library.md
const contract = process.env.PRESET_CONTRACT === "150" ? test : test.skip;
const KEY = "el:saved-presets:v1";
const personal = (page: Page) => page.locator('[data-preset-source="personal"]');
const named = (page: Page, name: string) => personal(page).filter({ has: page.getByText(name, { exact: true }) });
async function library(page: Page) {
  await page.goto("/#/presets");
  await expect(page.getByRole("heading", { name: "Presets", exact: true })).toBeVisible();
}
async function nameDialog(page: Page, name: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Preset name", exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
}
async function save(page: Page, name: string) {
  await page.getByRole("button", { name: "Save preset", exact: true }).click();
  await nameDialog(page, name);
}
async function exported(page: Page): Promise<any> {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export presets", exact: true }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  const data = JSON.parse(readFileSync(path!, "utf8"));
  expect(data.format).toBe("emergence-presets");
  expect(data.version).toBe(1);
  expect(Array.isArray(data.presets)).toBe(true);
  return data;
}
async function upload(page: Page, data: unknown) {
  await page.getByLabel("Import presets", { exact: true }).setInputFiles({
    name: "presets.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)),
  });
}
function assertSnapshot(s: any) {
  expect(typeof s.slug).toBe("string"); expect(s.slug.length).toBeGreaterThan(0);
  expect(Object.keys(s.params).length).toBeGreaterThan(0);
  for (const value of Object.values(s.params)) {
    expect(["number", "string", "boolean"]).toContain(typeof value);
    if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
  }
  expect(["performance", "balanced", "high", "ultra", "extreme"]).toContain(s.resolution);
  expect(typeof s.autoCycle).toBe("boolean");
  expect(Number.isFinite(s.stepsPerFrame)).toBe(true);
  expect(typeof s.colourOptions.preset).toBe("string");
  for (const key of ["invert", "paletteCycleReverse"]) expect(typeof s.colourOptions[key]).toBe("boolean");
  for (const key of ["gamma", "contrast", "steps"]) expect(Number.isFinite(s.colourOptions[key])).toBe(true);
  for (const key of ["dotSize", "trailFade", "bloom"]) expect(Number.isFinite(s.displayOptions[key])).toBe(true);
}
async function setParam(page: Page, key: string, value: number) {
  const input = page.locator(`input[data-param-key="${key}"]`);
  await expect(input).toHaveCount(1);
  await input.evaluate((el: HTMLInputElement, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, value);
  await expect(input).toHaveValue(String(value));
}
async function assertParams(page: Page, params: Record<string, unknown>) {
  for (const [key, value] of Object.entries(params)) {
    if (key === "seed") continue;
    const input = page.locator(`[data-param-key="${key}"]`);
    if (typeof value === "boolean") await expect(input).toBeChecked({ checked: value });
    else await expect(input).toHaveValue(String(value));
  }
}

contract("150 snapshot assertion fixtures and protected surfaces", () => {
  const good = { slug: "boids", params: { obstacleLayout: "none", boidCount: 1000 }, resolution: "high", autoCycle: false, stepsPerFrame: 1,
    colourOptions: { preset: "viridis", invert: false, paletteCycleReverse: false, gamma: 1, contrast: 1, steps: 0 },
    displayOptions: { dotSize: 1, trailFade: 0, bloom: 0 } };
  assertSnapshot(good);
  for (const bad of [{ ...good, params: {} }, { ...good, params: { n: NaN } }, { ...good, resolution: "unknown" }, { ...good, autoCycle: undefined }]) {
    expect(() => assertSnapshot(bad)).toThrow();
  }
  const diff = execFileSync("git", ["diff", "8803cd42c2caf43304751a1535e2a26eaade3c7e", "--", "src/sims", "src/app/presets.ts", "src/app/types.ts", "src/app/registry.ts", "src/app/renderer.ts", "src/app/rendererBackend.ts", "src/app/qualityProfiles.ts", "src/app/colormap.ts", "docs/INTERFACE.md", "docs/sweeps", "docs/images", "scripts", "package.json", "package-lock.json", ".autometta-vendor"], { encoding: "utf8" });
  expect(diff, "protected implementation and research must remain unchanged").toBe("");
});

contract("150 library routes, responsive layout and trial catalogue", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.getByRole("link", { name: "Presets", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Presets", exact: true }).click();
  await expect(page).toHaveURL(/#\/presets$/);
  await expect(page.getByRole("heading", { name: "Presets", exact: true })).toBeVisible();
  await expect(personal(page)).toHaveCount(0);
  await expect(page.locator('[data-preset-source="trial"]')).toHaveCount(9);
  await expect(page.getByText(/saved in this browser/i)).toBeVisible();
  const trials = page.locator('[data-preset-source="trial"]');
  await expect(trials.getByRole("button", { name: /^(Delete|Rename|Update preset)$/ })).toHaveCount(0);
  await page.getByLabel("Simulation", { exact: true }).selectOption("physarum");
  await expect(page.locator('[data-preset-source="trial"]:visible')).toHaveCount(3);
  await page.getByLabel("Search presets", { exact: true }).fill("no-result-150");
  await expect(page.locator('[data-preset-id]:visible')).toHaveCount(0);
  await page.getByLabel("Search presets", { exact: true }).fill("");
  await page.getByLabel("Simulation", { exact: true }).selectOption("");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `e2e/artifacts/presets-150/library-${width}.png`, fullPage: true });
  }
});

contract("150 nine trials launch exact source settings and save through reload", async ({ page }) => {
  for (const slug of ["physarum", "particle-life", "boids"]) {
    const data = JSON.parse(readFileSync(`docs/sweeps/data/2026-10-30/144/${slug}.app-evidence.json`, "utf8"));
    const rows = data.rows.filter((r: any) => r.kind === "finalist" && r.population.startsWith("shipped"));
    expect(rows).toHaveLength(3);
    for (const [index, row] of rows.entries()) {
      await library(page);
      // The row identifier belongs on the item itself, not on an implementation-specific child.
      const item = page.locator(`[data-preset-source="trial"][data-preset-slug="${slug}"][data-preset-row="${row.id}"]`);
      await expect(item).toHaveCount(1);
      await item.getByRole("button", { name: "Open", exact: true }).click();
      await expect(page.locator(".sim-view__canvas")).toBeVisible();
      await assertParams(page, row.params);
      await save(page, `${slug}-${index}`);
      await library(page);
      const saved = (await exported(page)).presets.find((p: any) => p.name === `${slug}-${index}`);
      assertSnapshot(saved.snapshot);
      expect(saved.snapshot.slug).toBe(slug);
      for (const [key, value] of Object.entries(row.params)) expect(saved.snapshot.params[key], key).toBe(value);
      await page.reload();
      await named(page, `${slug}-${index}`).getByRole("button", { name: "Open", exact: true }).click();
      await assertParams(page, row.params);
    }
  }
  await library(page);
  await expect(personal(page)).toHaveCount(9);
});

contract("150 personal CRUD, explicit update, cancellation and safe names", async ({ page }) => {
  await page.goto("/#/particle-life");
  await setParam(page, "species", 8);
  await save(page, "Original");
  await setParam(page, "species", 3);
  await library(page);
  await named(page, "Original").getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator('[data-param-key="species"]')).toHaveValue("8");
  await setParam(page, "species", 6);
  await page.getByRole("button", { name: "Update preset", exact: true }).click();
  await library(page); await page.reload();
  expect((await exported(page)).presets[0].snapshot.params.species).toBe(6);
  await named(page, "Original").getByRole("button", { name: "Rename", exact: true }).click();
  await nameDialog(page, "Renamed");
  await named(page, "Renamed").getByRole("button", { name: "Duplicate", exact: true }).click();
  await nameDialog(page, "Copy");
  await named(page, "Copy").getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Preset name", exact: true }).fill("Renamed");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(named(page, "Copy").getByRole("button", { name: "Rename", exact: true })).toBeFocused();
  await named(page, "Copy").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(named(page, "Copy")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.reload(); await expect(personal(page)).toHaveCount(2);
  await named(page, "Copy").getByRole("button", { name: "Rename", exact: true }).click();
  await nameDialog(page, '<img src=x onerror="window.bad150=1">');
  expect(await page.evaluate(() => (window as any).bad150)).toBeUndefined();
  await expect(personal(page).locator("img[src=x]")).toHaveCount(0);
});

contract("150 backup merge and invalid import are non-destructive", async ({ page }) => {
  await page.goto("/#/particle-life"); await save(page, "Backup"); await library(page);
  const before = await exported(page);
  await page.evaluate(key => localStorage.removeItem(key), KEY); await page.reload();
  await upload(page, before); await expect(personal(page)).toHaveCount(1);
  expect((await exported(page)).presets[0].snapshot).toEqual(before.presets[0].snapshot);
  await upload(page, before); await expect(personal(page)).toHaveCount(2);
  const stable = await exported(page);
  expect(new Set(stable.presets.map((p: any) => p.id)).size).toBe(2);
  expect(new Set(stable.presets.map((p: any) => p.name)).size).toBe(2);
  const invalids = [ { ...before, version: 999 }, { ...before, presets: [...before.presets, { ...before.presets[0], id: "bad", snapshot: { ...before.presets[0].snapshot, slug: "missing-model" } }] },
    { ...before, presets: [{ ...before.presets[0], snapshot: { ...before.presets[0].snapshot, params: { ...before.presets[0].snapshot.params, species: "wrong-type" } } }] } ];
  for (const invalid of invalids) {
    await upload(page, invalid); await expect(page.getByRole("alert")).toBeVisible();
    expect((await exported(page)).presets).toEqual(stable.presets);
  }
  await page.evaluate(key => localStorage.setItem(key, "{broken"), KEY); await page.reload();
  await expect(page.getByRole("heading", { name: "Presets", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
});

contract("150 storage refusal is honest and variant is retained", async ({ page }) => {
  await page.goto("/#/lorenz-attractor/rossler");
  await expect(page.locator('[data-param-key="attractor"]')).toHaveValue("rossler");
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("blocked", "QuotaExceededError"); }; });
  await save(page, "Ephemeral");
  await expect(page.getByText(/until reload/i)).toBeVisible();
  await page.getByRole("link", { name: "Presets", exact: true }).click();
  await expect(named(page, "Ephemeral")).toHaveCount(1);
  const data = await exported(page);
  expect(data.presets[0].snapshot.variant).toBe("rossler");
  expect(data.presets[0].snapshot.params.attractor).toBe("rossler");
  await page.reload(); await expect(personal(page)).toHaveCount(0);
});
// AUTOMETTA-CONTRACT-END
