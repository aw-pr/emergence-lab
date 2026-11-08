import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/154-lab-chrome-promo-tokens.md
const contract = process.env.LAB_CHROME_CONTRACT === "154" ? test : test.skip;
const CYAN = [90, 200, 250];
const BASE_STRUCTURE = {
  sim: "sha256:56fee8e7d2aaed651c75f7c8aba2c2626d2030bc714930e1702c67da2c7cea05",
  presets: "sha256:4951688f58b02a17529ca3327666ddfd361709d6849bd91146dd2f3d55e19cd0",
  gallery: "sha256:a9ab13d45cc8a3c31815efe3b7609cad7d70adb3e137afa5f52024ee86fbad84",
};

async function openSim(page: Page) {
  await page.goto("/#/particle-life");
  await expect(page.locator(".sim-view__canvas")).toBeVisible();
  await expect(page.locator(".controls")).toBeVisible();
  await page.waitForTimeout(1500);
}

// Element tree as depth and tag only: text, classes and attributes may change, elements may not.
async function structure(page: Page, rootSelector: string): Promise<string> {
  const lines = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [];
    const out: string[] = [];
    const walk = (el: Element, depth: number) => {
      out.push(`${depth}:${el.tagName.toLowerCase()}`);
      for (const child of Array.from(el.children)) walk(child, depth + 1);
    };
    walk(root, 0);
    return out;
  }, rootSelector);
  expect(lines.length, `${rootSelector} must render`).toBeGreaterThan(20);
  return "sha256:" + createHash("sha256").update(lines.join("\n")).digest("hex");
}

function firstFamily(stack: string): string {
  return stack.split(",")[0].trim().replace(/^["']|["']$/g, "");
}

function radii(page: Page, locator: ReturnType<Page["locator"]>) {
  return locator.evaluateAll((els) => els.map((el) => {
    const s = getComputedStyle(el);
    const corners = [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius];
    return { name: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40), max: Math.max(...corners.map((c) => parseFloat(c) || 0)) };
  }));
}

// Every rgb()/rgba()/color(srgb ...) token in every colour-bearing computed property
// of every element and pseudo-element in the sim view; returns the near-cyan ones.
async function nearCyan(page: Page): Promise<string[]> {
  return page.evaluate((cyan) => {
    const props = ["color", "background-color", "background-image", "border-top-color", "border-right-color", "border-bottom-color",
      "border-left-color", "outline-color", "box-shadow", "text-shadow", "text-decoration-color", "caret-color", "accent-color",
      "fill", "stroke", "column-rule-color", "filter"];
    const tokens = (value: string): number[][] => {
      const found: number[][] = [];
      for (const m of value.matchAll(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/g)) {
        const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        found.push([+m[1], +m[2], +m[3], a]);
      }
      for (const m of value.matchAll(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/g)) {
        const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        found.push([+m[1] * 255, +m[2] * 255, +m[3] * 255, a]);
      }
      return found;
    };
    const root = document.querySelector(".sim-view");
    if (!root) return ["no .sim-view"];
    const hits: string[] = [];
    const els = [root, ...Array.from(root.querySelectorAll("*"))];
    for (const el of els) {
      for (const pseudo of [null, "::before", "::after"]) {
        const s = getComputedStyle(el, pseudo);
        for (const prop of props) {
          const value = s.getPropertyValue(prop);
          for (const [r, g, b, a] of tokens(value)) {
            if (a > 0 && Math.abs(r - cyan[0]) <= 8 && Math.abs(g - cyan[1]) <= 8 && Math.abs(b - cyan[2]) <= 8) {
              hits.push(`${el.tagName.toLowerCase()}.${(el.getAttribute("class") || "").split(" ")[0]}${pseudo ?? ""} ${prop}: ${value.slice(0, 60)}`);
            }
          }
        }
      }
    }
    return hits;
  }, CYAN);
}

contract("154 sim view tokens: accent, Inter first, near-square buttons, no cyan", async ({ page }) => {
  await openSim(page);

  const accent = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--accent)";
    document.querySelector(".sim-view")!.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  expect(accent, "--accent must resolve to #0066CC inside the sim view").toBe("rgb(0, 102, 204)");

  for (const sel of ["body", ".sim-view", ".controls"]) {
    const stack = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(stack.length, `${sel} font stack`).toBeGreaterThan(0);
    expect(firstFamily(stack), `${sel} font stack must start with Inter: ${stack}`).toBe("Inter");
  }

  const save = page.getByRole("button", { name: "Save preset", exact: true });
  await expect(save).toHaveCount(1);
  const transport = page.locator(".controls__transport button");
  const presetButtons = page.locator(".sim-view .preset-button");
  expect(await transport.count(), "transport buttons").toBeGreaterThanOrEqual(4);
  expect(await presetButtons.count(), "sim view preset buttons").toBeGreaterThanOrEqual(1);
  const rounded = [...await radii(page, save), ...await radii(page, transport), ...await radii(page, presetButtons)]
    .filter((b) => b.max > 4);
  expect(rounded, "buttons with border-radius above 4 px").toEqual([]);

  expect(await nearCyan(page), "computed colours within 8 units of #5ac8fa").toEqual([]);
});

contract("154 cyan literals are gone from the lab stylesheet", () => {
  const css = readFileSync("src/app/styles.css", "utf8");
  expect(css.length).toBeGreaterThan(5000);
  expect(css).toContain("--accent");
  expect(css.match(/#5ac8fa/gi) ?? [], "#5ac8fa literals").toEqual([]);
  expect(css.match(/rgba?\(\s*90[\s,]+200[\s,]+250\b/g) ?? [], "rgb(90 200 250) literals").toEqual([]);
});

contract("154 copy: Fullscreen, no Vite, Emergence Lab", async ({ page }) => {
  await openSim(page);
  const controls = page.locator(".controls");
  await expect(controls.getByRole("button", { name: "Fullscreen", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /maximi[sz]e/i })).toHaveCount(0);
  for (const name of ["Pause", "Reset", "Reset to defaults"]) {
    await expect(controls.getByRole("button", { name, exact: true }), `transport button ${name} keeps its name`).toHaveCount(1);
  }

  await page.goto("/#/presets");
  await expect(page.getByRole("heading", { name: "Presets", exact: true })).toBeVisible();
  const presetsText = (await page.locator("#app").textContent()) ?? "";
  expect(presetsText).toMatch(/saved in this browser/i);
  expect(presetsText).not.toMatch(/vite/i);

  await page.goto("/#/");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveText("Emergence Lab");
});

contract("154 DOM structure unchanged from ee7f42462 (card-local, style and copy only)", async ({ page }) => {
  await openSim(page);
  expect(await structure(page, ".sim-view"), "sim view element tree").toBe(BASE_STRUCTURE.sim);
  await page.goto("/#/presets");
  await expect(page.getByRole("heading", { name: "Presets", exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await structure(page, "#app"), "presets page element tree").toBe(BASE_STRUCTURE.presets);
  await page.goto("/#/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await structure(page, "#app"), "gallery element tree").toBe(BASE_STRUCTURE.gallery);
});
// AUTOMETTA-CONTRACT-END
