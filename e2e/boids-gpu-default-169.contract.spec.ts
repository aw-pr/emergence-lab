import { test, expect, type Page } from "@playwright/test";

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/169-boids-gpu-default.md
const contract = process.env.BOIDS_GPU === "169" ? test : test.skip;
// Opening defaults at 946357cbc; this card changes none of them.
const DEFAULTS = {
  obstacleLayout: "none", obstacleAmount: 0.5, boidCount: 28000, initialFlocks: 5, visualRadius: 14,
  separationRadius: 27, maxSpeed: 36, alignment: 0.09, cohesion: 0.011, separation: 0.22, pointSize: 4,
};
const CANVAS = ".sim-view__canvas";

async function open(page: Page, query: string) {
  // A goto to the URL the page is already on, fragment included, is a
  // same-document navigation in Chromium and keeps the running engine.
  await page.goto("about:blank");
  await page.goto(`/${query}#/boids`);
  await expect(page.locator(CANVAS)).toBeVisible();
  await expect.poll(() => page.locator(CANVAS).getAttribute("data-render-size")).toMatch(/^\d+x\d+$/);
}

function renderer(page: Page) {
  return page.locator(CANVAS).getAttribute("data-simulation-renderer");
}

function hasEngine(page: Page) {
  return page.evaluate((selector) => "boidsGpu" in (document.querySelector(selector) as object), CANVAS);
}

function tier(page: Page) {
  return page.evaluate(async () => {
    const { detectDeviceTier } = await import("/src/app/qualityProfiles.ts" as string);
    return detectDeviceTier();
  });
}

contract("169 plain URL on the desktop tier: Boids steps on the GPU, on the unchanged defaults", async ({ page }) => {
  await open(page, "");
  expect(await tier(page)).toBe("desktop");
  await expect.poll(() => renderer(page), { message: "GPU stepping engages with no switch" }).toBe("gpu-boids");
  expect(await hasEngine(page)).toBe(true);
  const steps = () => page.evaluate((selector) => (document.querySelector(selector) as any).boidsGpu.steps as number, CANVAS);
  const before = await steps();
  await page.waitForTimeout(1000);
  expect(await steps(), "the GPU engine is stepping the flock").toBeGreaterThan(before + 10);
  const defaults = await page.evaluate(async () => {
    const { BoidsKernel } = await import("/src/sims/boids/kernel.ts" as string);
    const kernel = new BoidsKernel();
    return Object.fromEntries(kernel.paramSchema.map((p: { key: string; default: unknown }) => [p.key, p.default]));
  });
  expect(defaults).toEqual(DEFAULTS);
  const tiers = await page.evaluate(async () => {
    const { tierParamOverridesFor } = await import("/src/app/qualityProfiles.ts" as string);
    return [tierParamOverridesFor("boids", "desktop"), tierParamOverridesFor("boids", "tablet"), tierParamOverridesFor("boids", "phone")];
  });
  expect(tiers).toEqual([{}, { boidCount: 7000 }, { boidCount: 5000 }]);
});

contract("169 ?simulationRenderer=cpu keeps Boids on the CPU kernel", async ({ page }) => {
  await open(page, "?simulationRenderer=cpu");
  expect(await tier(page)).toBe("desktop");
  await page.waitForTimeout(1500);
  expect(await renderer(page)).not.toBe("gpu-boids");
  expect(await hasEngine(page)).toBe(false);
});

contract("169 ?simulationRenderer=gpu still steps on the GPU", async ({ page }) => {
  await open(page, "?simulationRenderer=gpu");
  await expect.poll(() => renderer(page)).toBe("gpu-boids");
  expect(await hasEngine(page)).toBe(true);
});

contract("169 plain URL: a dropped boulder hands the flock to the CPU and clearing it hands it back", async ({ page }) => {
  await open(page, "");
  await expect.poll(() => renderer(page)).toBe("gpu-boids");
  const canvas = page.locator(CANVAS);
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55);
  await expect.poll(() => renderer(page), { message: "CPU takes over once a boulder exists" }).not.toBe("gpu-boids");
  expect(await hasEngine(page)).toBe(false);
  await page.getByRole("button", { name: "Clear dropped boulders", exact: true }).click();
  await expect.poll(() => renderer(page), { message: "GPU resumes on a clear field" }).toBe("gpu-boids");
});

contract("169 plain URL on the tablet tier: Boids stays on the CPU kernel", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  });
  const page = await context.newPage();
  await open(page, "");
  expect(await tier(page)).toBe("tablet");
  await page.waitForTimeout(1500);
  expect(await renderer(page)).not.toBe("gpu-boids");
  expect(await hasEngine(page)).toBe(false);
  await context.close();
});
// AUTOMETTA-CONTRACT-END
