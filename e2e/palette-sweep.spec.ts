/**
 * Logistic-Mandelbrot cycle-palette sweep: renders each candidate palette at
 * each band spacing through the real orbit3d renderer and scores the frame.
 *
 * Opt-in, like sweep.spec.ts: PALETTE_SWEEP=1 npx playwright test palette-sweep
 *
 * Every candidate gets its own browser context so persisted params cannot
 * leak between runs. Params go in through localStorage before navigation
 * (the same store the controls panel writes); palette, gamma and contrast
 * are not persisted, so they are driven through the colour panel's controls.
 * Artefacts land under e2e/artifacts/logistic-mandelbrot-palette/ (git-ignored).
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  contactSheet,
  decodePng,
  frameColourMetrics,
  frameDifference,
  type DecodedImage,
  type FrameColourMetrics,
} from "./harness/frame.ts";

const ENABLED = process.env.PALETTE_SWEEP === "1";
const OUT = "e2e/artifacts/logistic-mandelbrot-palette";
const SLUG = "logistic-mandelbrot";

interface PaletteCandidate {
  label: string;
  preset: string;
  gamma: number;
  contrast: number;
}

/** Shipped default first, matched references next, then the sweep's picks. */
const CANDIDATES: PaletteCandidate[] = [
  { label: "magma cyclic (shipped)", preset: "magma-cyclic", gamma: 1.65, contrast: 2.4 },
  { label: "twilight", preset: "twilight", gamma: 1.65, contrast: 2.4 },
  { label: "magma", preset: "magma", gamma: 1.65, contrast: 2.4 },
  { label: "amber k1.4", preset: "amber", gamma: 1.2, contrast: 1.4 },
  { label: "magma k1.8", preset: "magma", gamma: 1.2, contrast: 1.8 },
  { label: "rosewood", preset: "rosewood", gamma: 1.65, contrast: 1.4 },
  { label: "dusk", preset: "dusk", gamma: 1.65, contrast: 1.4 },
  { label: "verdigris", preset: "verdigris", gamma: 1.2, contrast: 1.4 },
];

const BAND_SPACINGS = [1.5, 3, 5];

/** Frozen params: camera parked, reveal off, beam off, phase pinned at zero. */
function frozenParams(cycleBands: number, cycleSpeed = 0) {
  return {
    autoRotate: false,
    continuousSpin: false,
    cascadeReveal: false,
    realAxisSweep: false,
    cycleSpeed,
    cycleBands,
  };
}

async function openSim(page: Page, params: Record<string, number | boolean>): Promise<void> {
  await page.addInitScript(
    ([slug, values]) => {
      localStorage.setItem(`el:values:${slug}`, JSON.stringify(values));
    },
    [SLUG, params] as const,
  );
  await page.goto(`/#/${SLUG}`);
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-orbit3d");
  await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 60_000 });
}

async function applyColour(page: Page, candidate: PaletteCandidate): Promise<void> {
  const applied = await page.evaluate(
    ({ preset, gamma, contrast }) => {
      // The Palette select sits in the View section beside the kernel
      // presets, not in the Colour section, so find it by its label.
      const select = [...document.querySelectorAll<HTMLSelectElement>("select")].find((el) =>
        el.parentElement?.querySelector(".control__label")?.textContent === "Palette",
      );
      if (!select) throw new Error("palette select not found");
      select.value = preset;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      const setRange = (labelText: string, value: number) => {
        const control = [...document.querySelectorAll<HTMLElement>("label.control--number")].find(
          (el) => el.querySelector(".control__label")?.textContent === labelText,
        );
        const input = control?.querySelector<HTMLInputElement>('input[type="range"]');
        if (!input) throw new Error(`${labelText} control not found`);
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      setRange("Gamma", gamma);
      setRange("Contrast", contrast);
      return select.value;
    },
    candidate,
  );
  expect(applied).toBe(candidate.preset);
  // Let a few frames render with the new palette texture before sampling.
  await page.waitForTimeout(600);
}

async function captureCanvas(page: Page, path: string): Promise<DecodedImage> {
  const buffer = await page.locator(".sim-view__canvas").screenshot({ path });
  return decodePng(buffer);
}

function slugify(label: string): string {
  return label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

interface StaticResult {
  candidate: PaletteCandidate;
  cycleBands: number;
  file: string;
  metrics: FrameColourMetrics;
}

const staticResults: StaticResult[] = [];
const staticFrames: DecodedImage[] = [];
const temporalResults: Array<{ candidate: PaletteCandidate; cycleBands: number; motion: number }> = [];

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  test.skip(!ENABLED, "set PALETTE_SWEEP=1 to run the cycle-palette sweep");
  mkdirSync(`${OUT}/frames`, { recursive: true });
});

for (const candidate of CANDIDATES) {
  for (const cycleBands of BAND_SPACINGS) {
    test(`static frame: ${candidate.label} at ${cycleBands} bands/unit`, async ({ browser }) => {
      test.skip(!ENABLED, "set PALETTE_SWEEP=1 to run the cycle-palette sweep");
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      try {
        await openSim(page, frozenParams(cycleBands));
        await applyColour(page, candidate);
        const file = `frames/${slugify(candidate.label)}-b${cycleBands}.png`;
        const frame = await captureCanvas(page, `${OUT}/${file}`);
        const metrics = frameColourMetrics(frame);
        // AUTOMETTA-CONTRACT-BEGIN card=docs/stages/97-orbit3d-hue-preserving-tonemap.md
        expect(metrics.lit).toBeGreaterThan(0.02);
        // AUTOMETTA-CONTRACT-END
        staticResults.push({ candidate, cycleBands, file, metrics });
        staticFrames.push(frame);
      } finally {
        await context.close();
      }
    });
  }
}

/**
 * How much colour actually travels: three frames a third of a lap apart at
 * the default 0.06 laps/s. Timed rather than phase-pinned, so treat the
 * numbers as ±5% and read them for order of magnitude.
 */
for (const candidate of CANDIDATES) {
  test(`colour travel: ${candidate.label} at 3 bands/unit`, async ({ browser }) => {
    test.skip(!ENABLED, "set PALETTE_SWEEP=1 to run the cycle-palette sweep");
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    try {
      await openSim(page, frozenParams(3, 0.06));
      await applyColour(page, candidate);
      const frames: DecodedImage[] = [];
      for (let i = 0; i < 3; i += 1) {
        frames.push(
          await captureCanvas(page, `${OUT}/frames/${slugify(candidate.label)}-travel-${i}.png`),
        );
        if (i < 2) await page.waitForTimeout(5_500);
      }
      const motion =
        (frameDifference(frames[0], frames[1]) + frameDifference(frames[1], frames[2])) / 2;
      temporalResults.push({ candidate, cycleBands: 3, motion });
    } finally {
      await context.close();
    }
  });
}

test.afterAll(() => {
  if (!ENABLED || staticResults.length === 0) return;
  const fmt = (n: number, dp = 3) => n.toFixed(dp);
  const rows = staticResults.map((r) => {
    const m = r.metrics;
    return `| ${r.candidate.label} | ${r.candidate.gamma} | ${r.candidate.contrast} | ${r.cycleBands} | ${fmt(m.lit)} | ${fmt(m.edgeDensity)} | ${fmt(m.hueSpread)} | ${fmt(m.chroma)} | ${fmt(m.whiteClip)} | ${fmt(m.neon)} | \`${r.file}\` |`;
  });
  const travel = temporalResults.map(
    (r) => `| ${r.candidate.label} | ${r.cycleBands} | ${fmt(r.motion, 2)} |`,
  );
  const report = `# Cycle palette browser sweep — ${new Date().toISOString().slice(0, 10)}

Rendered through the GPU orbit3d path at 1280×720, camera parked at the default pose, cascade reveal and light beam off, phase pinned at 0 (cycle speed 0). Metrics are over lit pixels (OKLab L > 0.1) of the canvas screenshot.

- **edges**: share of lit pixels with a > 12 OKLab×100 step to a neighbour — band edges and sheet outlines.
- **hueSpread**: circular spread of hue over chromatic lit pixels; 0 is one hue, 1 is every hue equally.
- **chroma**: mean OKLab chroma over lit pixels.
- **whiteClip**: share of lit pixels that are near-white and colourless — the cloud reading as white.
- **neon**: share of lit pixels that are bright and highly saturated.

## Static frames

| palette | gamma | contrast | bands/unit | lit | edges | hueSpread | chroma | whiteClip | neon | frame |
|---|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

## Colour travel (3 bands/unit, cycle speed 0.06, frames 5.5 s apart)

Mean OKLab×100 change per pixel between frames a third of a lap apart. Higher means the cycle is visibly moving colour, not just brightness.

| palette | bands/unit | motion |
|---|---|---|
${travel.join("\n")}

Contact sheet: \`contact-sheet-browser.png\`, rows are palettes in the order above, columns are ${BAND_SPACINGS.join(" / ")} bands per unit.
`;
  writeFileSync(`${OUT}/browser-report.md`, report);
  writeFileSync(
    `${OUT}/browser-ranked.json`,
    JSON.stringify({ static: staticResults, travel: temporalResults }, null, 2),
  );
  // Central 900×560 window of each 1280×720 frame, halved: the cloud and the
  // cardioid on the ground plane, without the chrome at the edges.
  writeFileSync(
    `${OUT}/contact-sheet-browser.png`,
    contactSheet(staticFrames, BAND_SPACINGS.length, { x: 300, y: 80, width: 720, height: 600 }, 2),
  );
});
