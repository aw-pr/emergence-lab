import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { presetsFor } from "../src/app/presets.ts";

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/157-ising-coarse-domains-trial.md
const contract = process.env.TRIAL_CONTRACT === "157" ? test : test.skip;
const SLUG = "ising-model";
const ROW = "temperature2.38_coupling1.4";
const ID = `trial-157-${SLUG}-${ROW}`;
const NAME = "Coarse domains";
const PARAMS = { temperature: 2.38, coupling: 1.4, externalField: 0, sweepsPerStep: 0.5, initialState: "random" };
const SHIPPED = [
  { id: "critical", label: "Critical domains", params: { temperature: 2.269, coupling: 1, externalField: 0, sweepsPerStep: 0.5, initialState: "random" } },
  { id: "cold-quench", label: "Cold quench", params: { temperature: 0.7, coupling: 1, externalField: 0, sweepsPerStep: 0.8, initialState: "random" } },
  { id: "hot-noise", label: "Hot noise", params: { temperature: 4.5, coupling: 1, externalField: 0, sweepsPerStep: 1, initialState: "random" } },
  { id: "field-sweep", label: "Positive field", params: { temperature: 1.8, coupling: 1, externalField: 0.02, sweepsPerStep: 0.5, initialState: "random" } },
];
const REPORT = "docs/sweeps/2026-11-10-ising-coarse-domains.md";
const item =(page: Page) => page.locator(`[data-preset-source="trial"][data-preset-slug="${SLUG}"][data-preset-row="${ROW}"]`);
async function library(page: Page) {
  await page.goto("/#/presets");
  await expect(page.getByRole("heading", { name: "Presets", exact: true })).toBeVisible();
}
async function assertParams(page: Page, params: Record<string, unknown>) {
  await expect(page.locator(".sim-view__canvas")).toBeVisible();
  for (const [key, value] of Object.entries(params)) {
    await expect(page.locator(`[data-param-key="${key}"]`)).toHaveValue(String(value));
  }
}

contract("157 the Coarse domains trial is listed with its own stage badge beside the nine stage-144 trials", async ({ page }) => {
  await library(page);
  await expect(item(page)).toHaveCount(1);
  await expect(item(page)).toHaveAttribute("data-preset-id", ID);
  await expect(item(page).locator(".preset-item__badge")).toHaveText("Trial · stage 157");
  await expect(item(page).getByRole("heading", { level: 3 })).toHaveText(NAME);
  await expect(item(page).getByRole("button", { name: /^(Delete|Rename|Update preset)$/ })).toHaveCount(0);
  for (const slug of ["physarum", "particle-life", "boids"]) {
    const rows = page.locator(`[data-preset-source="trial"][data-preset-slug="${slug}"]`);
    await expect(rows).toHaveCount(3);
    await expect(rows.locator(".preset-item__badge")).toHaveText(["Trial · stage 144", "Trial · stage 144", "Trial · stage 144"]);
  }
  await item(page).getByRole("button", { name: "Open", exact: true }).click();
  await assertParams(page, PARAMS);
});

contract("157 the deep link opens the trial at its exact values", async ({ page }) => {
  await page.goto(`/#/${SLUG}?preset=${ID}`);
  await assertParams(page, PARAMS);
});

contract("157 shipped Ising presets are untouched and the evidence report names the candidate and its reference", async () => {
  expect(presetsFor(SLUG)).toEqual(SHIPPED);
  expect(existsSync(REPORT), REPORT).toBe(true);
  const report = readFileSync(REPORT, "utf8");
  for (const needle of ["146-ising-c04", "2.38", "1.4", "Critical domains", "Coarse domains", ID]) expect(report, needle).toContain(needle);
});
// AUTOMETTA-CONTRACT-END
