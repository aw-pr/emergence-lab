// Pre-render deterministic still thumbnails for every gallery card (one per sim,
// one per strange-attractor variant) and write them as PNGs under
// public/thumbnails/. The gallery serves these static images instead of
// live-painting a WebGL still per card on every visit — instant, no context
// churn.
//
// Re-run whenever a kernel's default look changes:
//   node scripts/generate-thumbnails.mjs
//
// It boots the Vite dev server, drives the SAME paintKernelThumbnail path the
// app uses (via page-context dynamic import), and reads the canvas out as PNG.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "public/thumbnails");
const PORT = 5177;
const ORIGIN = `http://localhost:${PORT}`;
const WIDTH = 640;
const HEIGHT = 400;

// Slow-developing sims need more than the default 48 steps to reach a
// representative still. Offline generation makes this free.
const STEPS_BY_SLUG = {
  "gray-scott": 1100,
  "diffusion-limited-aggregation": 220,
  // Clustered flocks need time to leave their seeding ring and form streams.
  boids: 300,
};

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePromise, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolvePromise();
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) return reject(new Error(`server not up: ${url}`));
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const server = spawn(
    "npm",
    ["run", "dev", "--", "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: "ignore" },
  );

  const browser = await chromium.launch();
  try {
    await waitForServer(ORIGIN, 60_000);
    const page = await browser.newPage();
    await page.goto(ORIGIN, { waitUntil: "load" });

    const cards = await page.evaluate(async () => {
      const { REGISTRY } = await import("/src/app/registry.ts");
      const out = [];
      for (const entry of REGISTRY) {
        if (entry.variants && entry.variants.length > 0) {
          for (const variant of entry.variants) {
            out.push({
              key: `${entry.slug}__${variant.variant}`,
              slug: entry.slug,
              params: variant.params ?? {},
            });
          }
        } else {
          out.push({ key: entry.slug, slug: entry.slug, params: {} });
        }
      }
      return out;
    });

    for (const card of cards) {
      const steps = STEPS_BY_SLUG[card.slug];
      const dataUrl = await page.evaluate(
        async ({ slug, params, w, h, steps }) => {
          const { paintKernelThumbnail } = await import("/src/app/thumbnail.ts");
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          await paintKernelThumbnail(slug, canvas, {
            params,
            ...(steps ? { steps } : {}),
          });
          return canvas.toDataURL("image/png");
        },
        { slug: card.slug, params: card.params, w: WIDTH, h: HEIGHT, steps },
      );

      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      const file = resolve(OUT_DIR, `${card.key}.png`);
      await writeFile(file, Buffer.from(base64, "base64"));
      console.log(`  wrote thumbnails/${card.key}.png`);
    }

    console.log(`\nGenerated ${cards.length} thumbnails into public/thumbnails/`);
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
