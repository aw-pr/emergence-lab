import { test, expect } from "@playwright/test";

// The sandpile's height mapping drawn through the real WebGL2 shader must
// agree with colormap.ts, the CPU authority, for every grain count, activity
// level, palette and glow setting the sandpile ships.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("sandpile height mapping agrees across CPU and GPU for every palette and glow setting", async ({ page }) => {
  const webgl2 = await page.evaluate(
    () => document.createElement("canvas").getContext("webgl2") !== null,
  );
  test.skip(!webgl2, "WebGL2 is unavailable in this browser, so the shader path cannot be read back");

  const result = await page.evaluate(async () => {
    const { buildMapper, defaultColourOptionsFor } = await import("/src/app/colormap.ts");
    const { createWebGLRendererBackend } = await import("/src/app/webglRenderer.ts");
    const canvas = document.createElement("canvas");
    const backend = createWebGLRendererBackend(canvas);
    if (!backend) throw new Error("WebGL2 backend failed to start");
    const gl = canvas.getContext("webgl2")!;

    const state = new Float32Array(2);
    const channelRanges = [[0, 1], [0, 1]] as const;
    const kernel = {
      name: "Abelian Sandpile",
      channelCount: 2,
      channelLabels: ["Stable height", "Avalanche activity"],
      channelRanges,
      paramSchema: [],
      init() {}, step() {}, destroy() {},
      readState: () => state,
    };
    const sandpileDefaults = defaultColourOptionsFor("abelian-sandpile", 2);
    const palettes = [
      { preset: "sandpile-classic" as const },
      { preset: "sandpile-sunflower" as const },
      { preset: "viridis" as const },
      { preset: "sand" as const },
      { preset: "sand" as const, gamma: 0.9, contrast: 1.1 },
    ];

    let maxError = 0;
    let samples = 0;
    const worst: string[] = [];
    try {
      backend.resizeDisplay(8, 8);
      backend.setGrid(1, 1, kernel, "grid", {});
      for (const palette of palettes) {
        for (const avalancheGlow of [false, true]) {
          const colourOptions = { ...sandpileDefaults, ...palette, avalancheGlow };
          const cpu = buildMapper(2, channelRanges, colourOptions, "height");
          for (let height = 0; height <= 3; height += 1) {
            for (const activity of [0, 0.5, 1]) {
              state[0] = height / 3;
              state[1] = activity;
              backend.draw({
                state, kernel, colourOptions,
                displayOptions: { dotSize: 1, trailFade: 0, bloom: 0 },
                mode: "grid", params: {}, elapsedTime: 0, speedScale: 1,
              });
              const rgba = new Uint8Array(4);
              gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
              const expected = cpu(state, 0);
              samples += 1;
              const error = Math.max(
                ...[0, 1, 2].map((channel) => Math.abs(rgba[channel] - expected[channel])),
              );
              if (error > 2) {
                worst.push(
                  `${palette.preset} glow=${avalancheGlow} h=${height} a=${activity}: gpu ${Array.from(rgba.slice(0, 3))} cpu ${expected}`,
                );
              }
              maxError = Math.max(maxError, error);
            }
          }
        }
      }
      return { maxError, samples, worst: worst.slice(0, 5) };
    } finally {
      backend.destroy();
    }
  });

  expect(result.samples).toBe(5 * 2 * 4 * 3);
  expect(result.worst).toEqual([]);
  expect(result.maxError).toBeLessThanOrEqual(2);
});
