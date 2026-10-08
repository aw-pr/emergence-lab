import { test, expect } from "@playwright/test";
import { decodePng, frameColourMetrics, frameDifference } from "./harness/frame.ts";

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/98-logistic-mandelbrot-inside-out-cycling.md
test.describe("inside-out cycling contract", () => {
  test.skip(process.env.INSIDE_OUT_CYCLING !== "1", "set INSIDE_OUT_CYCLING=1");
  test.use({ viewport: { width: 1280, height: 720 } });

  for (const geometryMode of ["cloud", "hybrid"]) {
    for (const cycleSpeed of [0, 0.1]) {
      test(`${geometryMode}: speed ${cycleSpeed}`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.addInitScript(({ geometryMode, cycleSpeed }) => {
          localStorage.setItem("el:values:logistic-mandelbrot", JSON.stringify({
            geometryMode, colourMode: "inside-out", cycleSpeed,
            autoRotate: false, continuousSpin: false, cascadeReveal: false,
            realAxisSweep: false, zoomGrowth: 0, boundaryDetail: 0,
          }));
        }, { geometryMode, cycleSpeed });
        await page.goto("/#/logistic-mandelbrot");
        const canvas = page.locator(".sim-view__canvas");
        await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-orbit3d");
        await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 120_000 });
        await expect(page.locator('[data-param-key="colourMode"]')).toHaveValue("inside-out");
        await expect(page.locator('[data-param-key="geometryMode"]')).toHaveValue(geometryMode);
        const palette = page.locator("select").filter({ has: page.locator('option[value="magma-cyclic"]') });
        await expect(palette).toHaveValue("magma-cyclic");
        await page.waitForTimeout(1500);
        const before = decodePng(await canvas.screenshot({ path: testInfo.outputPath("before.png") }));
        const camera = await canvas.getAttribute("data-orbit3d-camera-azimuth");
        const points = await canvas.getAttribute("data-orbit3d-points");
        await page.waitForTimeout(2500);
        const after = decodePng(await canvas.screenshot({ path: testInfo.outputPath("after.png") }));
        const motion = frameDifference(before, after);
        console.log(JSON.stringify({ geometryMode, cycleSpeed, motion }));
        expect(frameColourMetrics(before).lit).toBeGreaterThan(0.02);
        expect(frameColourMetrics(after).lit).toBeGreaterThan(0.02);
        expect(await canvas.getAttribute("data-orbit3d-camera-azimuth")).toBe(camera);
        expect(await canvas.getAttribute("data-orbit3d-points")).toBe(points);
        if (cycleSpeed === 0) expect(motion).toBeLessThan(0.1);
        else expect(motion).toBeGreaterThan(1);
        expect(errors).toEqual([]);
      });
    }
  }
});
// AUTOMETTA-CONTRACT-END
