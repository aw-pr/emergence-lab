#!/usr/bin/env node
/**
 * Photograph every Boids flow candidate and reference in the real app.
 *
 * Each row opens `#/boids?preset=<id>` on the running dev server in a fresh
 * headless Chromium context under its tier's emulation, with the row's params
 * and the default colour, display and speed options. The app runs its own
 * rAF loop, so trails, bloom and the heading palette are the real ones.
 *
 * Two things are pinned by an init script, without touching src/:
 *   - the kernel's seed (the renderer reseeds from Math.random on every load),
 *   - the kernel's dt, at 1/60 per call. The renderer calls step once per
 *     rendered frame at 1x, so step N is N/60 s of app time on a 60 Hz display
 *     whatever the headless frame rate is. Trail fade is per drawn frame, so
 *     one step per frame gives the trail length a 60 Hz display shows.
 * rAF delivery is held at each target step so the frame on screen is exactly
 * that step; the hold is released after the screenshot.
 *
 * At the first target the live kernel's positions and velocities are compared
 * with a fresh kernel stepped the same number of times at the same seed and dt
 * (seedCheck), so the frames are the offline instrument's seed runs.
 *
 * Usage:
 *   node scripts/capture-boids-flow.mjs [--tiers desktop,tablet,phone,desktop720]
 *     [--rows id,id] [--seeds 0[,1,2]] [--concurrency 3] [--base http://localhost:5174]
 *     [--steps 300,1200,3600,9000] [--sheets-only]
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = "docs/sweeps/data/2026-11-13/boids-flow";
const CANDIDATES = `${DATA_DIR}/candidates.json`;
const CAPTURES = `${DATA_DIR}/captures.json`;
const IMAGES = "docs/images/sweeps-2026-11-13";
const ARTIFACTS = "e2e/artifacts/boids-flow";
const METHOD = "boids-flow-capture-v1";
const STEPS_PER_APP_SECOND = 60;
const DT = 1 / STEPS_PER_APP_SECOND;
const HEADING_BINS = 12;
const LAUNCH_ARGS = [
  "--use-angle=metal",
  "--enable-gpu",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
];

/** Emulation per capture tier; grids and presets as measured by `sweep-boids-flow.mjs probe` (tiers.json). */
const TIERS = {
  desktop: {
    rowTier: "desktop",
    label: "desktop, 2560x1440 at DPR 1 (ultra cap, the sweep's desktop grid)",
    context: { viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 },
    deviceTier: "desktop",
    grid: "1707x960",
  },
  tablet: {
    rowTier: "tablet",
    label: "tablet, 1180x820 touch at DPR 2 (balanced cap)",
    context: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    deviceTier: "tablet",
    grid: "768x534",
  },
  phone: {
    rowTier: "phone",
    label: "phone, 390x844 touch at DPR 3 (balanced, 1 cell per CSS px)",
    context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
    deviceTier: "phone",
    grid: "390x844",
  },
  desktop720: {
    rowTier: "desktop",
    label: "desktop window, 1280x720 at DPR 2 (uncapped, 1.78x denser than the sweep grid at the same count)",
    context: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 },
    deviceTier: "desktop",
    grid: "1280x720",
    retainFrames: false,
  },
};
const TIER_ORDER = ["desktop", "desktop720", "tablet", "phone"];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else { args[key] = next; i += 1; }
  }
  return args;
}

const abs = (p) => join(ROOT, p);
const readJson = (p) => JSON.parse(readFileSync(abs(p), "utf8"));
const writeJson = (p, v) => { mkdirSync(dirname(abs(p)), { recursive: true }); writeFileSync(abs(p), JSON.stringify(v, null, 1) + "\n"); };
const round = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? v ?? null : Math.round(v * 10 ** d) / 10 ** d);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (xs, q) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/** Capture id: the row id (desktop rows on the 1280x720 pass take that tier's name), plus the seed when it is not 0. */
function captureIdFor(tier, row, seed) {
  const base = tier === TIERS[tier].rowTier ? row.id : row.id.replace(new RegExp(`^${TIERS[tier].rowTier}-`), `${tier}-`);
  return seed ? `${base}-seed${seed}` : base;
}

function rowsFor(tier, candidates, filter, seed = 0) {
  const rowTier = TIERS[tier].rowTier;
  const rows = [
    ...candidates.candidates.filter((r) => r.tier === rowTier).map((r) => ({ ...r, kind: "candidate" })),
    ...candidates.references.filter((r) => r.tier === rowTier).map((r) => ({ ...r, kind: "reference" })),
  ];
  return rows
    .map((row) => ({ tier, row, captureId: captureIdFor(tier, row, seed) }))
    .filter((job) => !filter || filter.has(job.row.id) || filter.has(job.captureId));
}

/**
 * Offline seed-run samples at the capture steps, from the long/screen result file
 * the row came from; null when that run was on another grid than the capture's.
 */
function offlineSamples(row, seed, steps, grid) {
  if (!row?.source || !row.sourceRowId) return null;
  const file = abs(row.source);
  if (!existsSync(file)) return null;
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (data.grid?.join("x") !== grid) return null;
  const source = data.rows?.find((r) => r.id === row.sourceRowId);
  const run = source?.runs?.find((r) => r.seed === seed);
  if (!run) return null;
  const pick = ["globalOrder", "localOrder", "headingEntropy", "effectiveDomains", "coverage", "nnCss", "flowScore"];
  return {
    source: row.source,
    sourceRowId: row.sourceRowId,
    dt: run.dt,
    bySteps: Object.fromEntries(steps.map((step) => {
      const s = run.samples.find((x) => x.step === step);
      return [step, s ? Object.fromEntries(pick.map((k) => [k, s[k] ?? null])) : null];
    })),
  };
}

// ------------------------------------------------------------------ in-page

/** Init script: preset in storage, rAF hold gate, kernel seed and dt pin. Runs before any app script. */
function instrument(cfg) {
  if (location.origin !== cfg.origin) return;
  try {
    localStorage.clear();
    localStorage.setItem(cfg.presetsKey, cfg.presetsJson);
  } catch (error) {
    console.error("boids-flow: storage", error);
  }
  const st = {
    cfg, steps: 0, frames: 0, held: false, holdAt: cfg.targets[0], inits: [], errors: [],
    stepMs: [], frameTs: [], requestedDt: { min: Infinity, max: -Infinity }, liveKernel: null,
  };
  window.__bf = st;
  const raf = window.requestAnimationFrame.bind(window);
  let queue = new Map();
  let nextId = 1;
  let scheduled = false;
  const pump = (ts) => {
    scheduled = false;
    if (st.liveKernel && st.steps >= st.holdAt) {
      st.held = true;
      return;
    }
    st.frames += 1;
    st.frameTs.push(ts);
    const callbacks = queue;
    queue = new Map();
    for (const cb of callbacks.values()) {
      try { cb(ts); } catch (error) { st.errors.push(String(error?.stack ?? error)); }
    }
  };
  const schedule = () => { if (!scheduled && !st.held) { scheduled = true; raf(pump); } };
  window.requestAnimationFrame = (cb) => { const id = nextId++; queue.set(id, cb); schedule(); return id; };
  window.cancelAnimationFrame = (id) => { queue.delete(id); };
  st.resume = (holdAt) => { st.holdAt = holdAt; st.held = false; schedule(); };

  import(cfg.kernelUrl).then((mod) => {
    const Kernel = Object.values(mod).find((v) => typeof v === "function" && typeof v.prototype?.step === "function" && typeof v.prototype?.init === "function");
    if (!Kernel) throw new Error("no kernel class exported");
    const proto = Kernel.prototype;
    const origInit = proto.init;
    const origStep = proto.step;
    Object.assign(st, { Kernel, origInit, origStep });
    proto.init = function init(width, height, params) {
      const next = { ...params, seed: cfg.seed };
      st.inits.push({ width, height, appSeed: params?.seed ?? null, seed: cfg.seed, atFrame: st.frames });
      st.liveKernel = this;
      st.initArgs = { width, height, params: next };
      st.steps = 0;
      st.stepMs = [];
      return origInit.call(this, width, height, next);
    };
    proto.step = function step(dt) {
      if (this !== st.liveKernel) return origStep.call(this, dt);
      if (dt < st.requestedDt.min) st.requestedDt.min = dt;
      if (dt > st.requestedDt.max) st.requestedDt.max = dt;
      const t0 = performance.now();
      origStep.call(this, cfg.dt);
      st.stepMs.push(performance.now() - t0);
      st.steps += 1;
    };
    st.kernelPatched = true;
  }).catch((error) => st.errors.push(`kernel patch: ${error?.stack ?? error}`));
}

/** Snapshots for the preset store, built from the app's own defaults on the row's tier. */
async function buildSnapshots(page, rows, deviceTier) {
  return page.evaluate(async ({ rows, deviceTier }) => {
    const reg = await import("/src/app/registry.ts");
    const cm = await import("/src/app/colormap.ts");
    const qp = await import("/src/app/qualityProfiles.ts");
    const rm = await import("/src/app/renderModes.ts");
    const sp = await import("/src/app/savedPresets.ts");
    const kernel = await reg.findEntry("boids").load();
    const defaults = Object.fromEntries(kernel.paramSchema.map((p) => [p.key, p.default]));
    const colourOptions = cm.defaultColourOptionsFor("boids", kernel.channelCount);
    kernel.destroy();
    const validator = new sp.PresetValidator(reg.REGISTRY);
    const out = [];
    for (const row of rows) {
      const snapshot = {
        slug: "boids",
        params: { ...defaults, ...row.params },
        colourOptions: structuredClone(colourOptions),
        displayOptions: sp.defaultDisplayOptionsFor("boids"),
        resolution: qp.qualityProfileFor("boids", rm.getRenderMode("boids"), deviceTier).defaultPreset,
        stepsPerFrame: sp.speedProfileFor("boids").initial,
        autoCycle: false,
      };
      await validator.snapshot(snapshot);
      out.push({ id: `boids-flow-${row.captureId}`, name: `Boids flow · ${row.captureId}`, snapshot });
    }
    return { presets: out, presetsKey: sp.SAVED_PRESETS_KEY };
  }, { rows, deviceTier });
}

/** Readings taken while held: counters, timing, and heading order from the live kernel's arrays. */
async function readHeld(page, bins) {
  return page.evaluate((bins) => {
    const st = window.__bf;
    const k = st.liveKernel;
    const count = k.boidCount;
    const ux = new Float32Array(count);
    const uy = new Float32Array(count);
    const hist = new Float64Array(bins);
    let gx = 0;
    let gy = 0;
    for (let i = 0; i < count; i += 1) {
      const speed = Math.hypot(k.vx[i], k.vy[i]);
      if (speed > 0) { ux[i] = k.vx[i] / speed; uy[i] = k.vy[i] / speed; }
      gx += ux[i];
      gy += uy[i];
      const turn = (Math.atan2(uy[i], ux[i]) / (2 * Math.PI) + 1) % 1;
      hist[Math.min(bins - 1, Math.floor(turn * bins))] += 1;
    }
    let entropy = 0;
    for (const h of hist) if (h > 0) entropy -= (h / count) * Math.log(h / count);
    const leaf = (pattern) => [...document.querySelectorAll("*")].find((e) => e.childElementCount === 0 && pattern.test(e.textContent ?? ""))?.textContent ?? null;
    const iterText = leaf(/^iter [0-9,]+$/);
    const canvas = document.querySelector("canvas[data-render-size]");
    return {
      steps: st.steps,
      frames: st.frames,
      held: st.held,
      boidCount: count,
      iterations: iterText ? Number(iterText.replace(/[^0-9]/g, "")) : null,
      fpsLabel: leaf(/^[0-9]+ fps$/),
      renderSize: canvas?.dataset.renderSize ?? null,
      globalOrder: Math.hypot(gx, gy) / count,
      headingEntropy: entropy / Math.log(bins),
      frameTs: st.frameTs.splice(0),
      stepMs: st.stepMs.splice(0),
      requestedDt: { ...st.requestedDt },
      inits: st.inits.length,
      errors: st.errors.slice(),
    };
  }, bins);
}

/** Fresh kernel, same init args, same number of fixed-dt steps: must equal the live state bit for bit. */
async function seedCheck(page, steps) {
  return page.evaluate((steps) => {
    const st = window.__bf;
    const live = st.liveKernel;
    const { width, height, params } = st.initArgs;
    const fresh = new st.Kernel();
    st.origInit.call(fresh, width, height, params);
    const t0 = performance.now();
    for (let i = 0; i < steps; i += 1) st.origStep.call(fresh, st.cfg.dt);
    const ms = performance.now() - t0;
    let mismatches = 0;
    for (const key of ["x", "y", "vx", "vy"]) {
      for (let i = 0; i < live.boidCount; i += 1) if (!Object.is(live[key][i], fresh[key][i])) mismatches += 1;
    }
    const sample = [live.x[0], live.y[0], live.vx[0], live.vy[0]];
    fresh.destroy?.();
    return { steps, seed: params.seed, grid: [width, height], boidCount: live.boidCount, mismatches, identical: mismatches === 0, firstBoid: sample, freshMsPerStep: ms / steps };
  }, steps);
}

const HIDE_UI = `body * { visibility: hidden !important; }
canvas[data-render-size] { visibility: visible !important; }`;

async function waitHeld(page, step, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const s = await page.evaluate(() => ({ held: window.__bf?.held ?? false, steps: window.__bf?.steps ?? 0, errors: window.__bf?.errors?.length ?? 0 }));
    if (s.errors) throw new Error("page loop errors; see __bf.errors");
    if (s.held && s.steps >= step) {
      if (s.steps !== step) throw new Error(`held at step ${s.steps}, wanted ${step}`);
      return;
    }
    if (Date.now() > deadline) throw new Error(`timed out at step ${s.steps} waiting for ${step}`);
    await new Promise((r) => setTimeout(r, s.steps > step - 60 ? 50 : 500));
  }
}

function segmentStats(held, segWallMs) {
  const deltas = [];
  for (let i = 1; i < held.frameTs.length; i += 1) deltas.push(held.frameTs[i] - held.frameTs[i - 1]);
  return {
    frames: held.frameTs.length,
    wallMs: Math.round(segWallMs),
    headlessFps: round(held.frameTs.length / (segWallMs / 1000), 1),
    msPerFrameMedian: round(median(deltas), 2),
    msPerFrameP90: round(quantile(deltas, 0.9), 2),
    kernelMsPerStepMedian: round(median(held.stepMs), 3),
    kernelMsPerStepP90: round(quantile(held.stepMs, 0.9), 3),
    kernelSteps: held.stepMs.length,
  };
}

/**
 * The kernel module URL the app imports. Vite stamps `?t=<hmr time>` on a module
 * edited while the server runs, and a patch on the unstamped URL would land on a
 * second module instance the app never uses.
 */
async function appKernelUrl(base) {
  const registry = await (await fetch(`${base}/src/app/registry.ts`)).text();
  const match = registry.match(/import\("(\/src\/sims\/boids\/kernel\.ts[^"]*)"\)/);
  if (!match) throw new Error("boids kernel import not found in the served registry");
  return match[1];
}

async function captureRow(browser, job, opts) {
  const { tier, row, captureId, preset, presetsKey } = job;
  const t = TIERS[tier];
  const retained = row.kind === "candidate" && t.retainFrames !== false;
  mkdirSync(abs(IMAGES), { recursive: true });
  mkdirSync(abs(`${ARTIFACTS}/${tier}`), { recursive: true });
  const context = await browser.newContext(t.context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(`console: ${m.text()}`); });
  const kernelUrl = await appKernelUrl(opts.base);
  await context.addInitScript(instrument, {
    origin: new URL(opts.base).origin,
    presetsKey,
    presetsJson: JSON.stringify({ format: "emergence-presets", version: 1, presets: [preset] }),
    targets: opts.steps,
    seed: job.seed,
    dt: DT,
    kernelUrl,
  });
  const started = Date.now();
  try {
    await page.goto(`${opts.base}/#/boids?preset=${encodeURIComponent(preset.id)}`);
    await page.waitForSelector("canvas[data-render-size]", { timeout: 60000 });
    await page.waitForFunction(() => window.__bf?.inits?.length > 0, null, { timeout: 60000, polling: 250 });
    await page.addStyleTag({ content: HIDE_UI });
    const setup = await page.evaluate(() => {
      const st = window.__bf;
      const param = (key) => document.querySelector(`[data-param-key="${key}"]`)?.value ?? null;
      const canvas = document.querySelector("canvas[data-render-size]");
      const rect = canvas.getBoundingClientRect();
      return {
        kernelPatched: !!st.kernelPatched,
        inits: st.inits,
        initParams: st.initArgs.params,
        renderSize: canvas.dataset.renderSize,
        displaySize: canvas.dataset.displaySize,
        renderer: canvas.dataset.renderer,
        canvasCss: [rect.width, rect.height],
        devicePixelRatio: window.devicePixelRatio,
        coarsePointer: matchMedia("(pointer: coarse)").matches,
        controlParams: Object.fromEntries(["boidCount", "initialFlocks", "visualRadius", "separationRadius", "maxSpeed", "alignment", "cohesion", "separation", "pointSize"].map((k) => [k, Number(param(k))])),
        storageKeys: Object.keys(localStorage),
      };
    });
    if (setup.renderSize !== t.grid) throw new Error(`${captureId}: grid ${setup.renderSize}, expected ${t.grid}`);
    if (setup.renderer !== "webgl2") throw new Error(`${captureId}: renderer ${setup.renderer}`);
    for (const [k, v] of Object.entries(row.params)) {
      if (k === "obstacleLayout") continue;
      if (setup.initParams[k] !== v) throw new Error(`${captureId}: kernel ${k}=${setup.initParams[k]}, row ${v}`);
    }
    if (setup.initParams.obstacleLayout !== "none") throw new Error(`${captureId}: obstacleLayout ${setup.initParams.obstacleLayout}`);

    const frames = [];
    let seed = null;
    let segStart = Date.now();
    for (const [index, step] of opts.steps.entries()) {
      const segSteps = step - (index ? opts.steps[index - 1] : 0);
      await waitHeld(page, step, Math.max(180000, segSteps * 250));
      const segWallMs = Date.now() - segStart;
      const held = await readHeld(page, HEADING_BINS);
      if (held.renderSize !== t.grid) throw new Error(`${captureId}: grid changed to ${held.renderSize}`);
      if (held.inits !== 1) throw new Error(`${captureId}: kernel initialised ${held.inits} times`);
      const seconds = step / STEPS_PER_APP_SECOND;
      const stem = `boids-flow-${captureId}-t${seconds}s`;
      const canvas = page.locator("canvas[data-render-size]");
      const png = `${ARTIFACTS}/${tier}/${stem}.png`;
      await canvas.screenshot({ path: abs(png), scale: "css" });
      let path = png;
      if (retained) {
        // Frames wider than 1280 CSS px are kept as JPEG; the lossless PNG stays in the artifacts folder.
        if (t.context.viewport.width > 1280) {
          path = `${IMAGES}/${stem}.jpg`;
          await canvas.screenshot({ path: abs(path), scale: "css", type: "jpeg", quality: 90 });
        } else {
          path = `${IMAGES}/${stem}.png`;
          copyFileSync(abs(png), abs(path));
        }
      }
      if (index === 0) seed = await seedCheck(page, step);
      frames.push({
        seconds, step, kernelSteps: held.steps, renderedFrames: held.frames, iterationsReadout: held.iterations,
        framesWithoutKernelStep: held.frames - held.steps, fpsLabel: held.fpsLabel, path, png, retained,
        bytes: statSync(abs(path)).size,
        live: { globalOrder: round(held.globalOrder), headingEntropy: round(held.headingEntropy) },
        segment: segmentStats(held, segWallMs),
        requestedDt: { min: round(held.requestedDt.min, 5), max: round(held.requestedDt.max, 5) },
      });
      console.log(`${captureId} t${seconds}s step ${held.steps} frames ${held.frames} iter ${held.iterations} G ${held.globalOrder.toFixed(3)} fps ${frames.at(-1).segment.headlessFps} kernel ${frames.at(-1).segment.kernelMsPerStepMedian} ms${index === 0 ? ` seedCheck ${seed.identical ? "identical" : `${seed.mismatches} mismatches`}` : ""}`);
      if (index + 1 < opts.steps.length) {
        segStart = Date.now();
        await page.evaluate((next) => window.__bf.resume(next), opts.steps[index + 1]);
      }
    }
    const errors = await page.evaluate(() => window.__bf.errors);
    return {
      captureId, rowId: row.id, kind: row.kind, tier, rowTier: row.tier, name: row.name, role: row.role ?? null,
      backedAsDefault: row.backedAsDefault ?? false,
      params: row.params, seed: job.seed, dt: DT,
      grid: setup.renderSize, displaySize: setup.displaySize, canvasCss: setup.canvasCss, devicePixelRatio: setup.devicePixelRatio,
      coarsePointer: setup.coarsePointer, resolution: preset.snapshot.resolution,
      presetId: preset.id, snapshot: preset.snapshot, kernelModule: kernelUrl,
      appSeedOverridden: setup.inits[0].appSeed, controlParams: setup.controlParams, storageKeysAtStart: setup.storageKeys,
      seedCheck: seed,
      frames,
      offline: offlineSamples(row, job.seed, opts.steps, setup.renderSize),
      wallClockSeconds: Math.round((Date.now() - started) / 1000),
      pageErrors: [...pageErrors, ...errors],
    };
  } finally {
    await context.close();
  }
}

// ------------------------------------------------------------------ sheets

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function rowLabel(entry, row) {
  const p = entry.params;
  const life = row?.chaosLifetimeStepsPerSeed ? row.chaosLifetimeStepsPerSeed.map((s) => `${Math.round(s / 60)}`).join("/") : "n/a";
  const cost = row?.msPerStepUncontendedSteady ?? row?.msPerStepUncontended;
  const sourceGrid = TIERS[entry.rowTier]?.grid;
  const gridNote = sourceGrid && sourceGrid !== entry.grid ? ` (offline, ${sourceGrid} grid)` : "";
  return `<div class="name">${esc(entry.name)}${entry.backedAsDefault ? " <span class=tag>backed default</span>" : ""}${entry.kind === "reference" ? " <span class=tag ref>reference</span>" : ""}</div>
<div class="id">${esc(entry.captureId)}</div>
${entry.role && entry.role !== "backed default" ? `<div class="role">${esc(entry.role)}</div>` : ""}
<div class="p">${p.boidCount} boids · ${p.initialFlocks} flocks</div>
<div class="p">visual ${p.visualRadius} · separation ${p.separationRadius}</div>
<div class="p">speed ${p.maxSpeed} · point ${p.pointSize}</div>
<div class="p">align ${p.alignment} · coh ${p.cohesion} · sep ${p.separation}</div>
<div class="m">chaos life s (seeds 0/1/2)${esc(gridNote)}: ${esc(life)}</div>
<div class="m">${cost ? `${cost} ms/step (V8, uncontended)${esc(gridNote)}` : ""}</div>`;
}

async function buildSheet(browser, tier, entries, candidatesById, opts) {
  const t = TIERS[tier];
  const vp = t.context.viewport;
  const cellW = tier === "phone" ? 230 : 520;
  const cellH = Math.round((cellW * vp.height) / vp.width);
  const labelW = 270;
  const steps = opts.steps;
  const header = `<div class="title">Boids flow · ${esc(t.label)} · grid ${esc(t.grid)} · seed 0 (a -seedN suffix marks another seed) · dt 1/60 per rendered frame · default colour and display (twilight, trails 0.93, bloom 0.3, 1x)</div>`;
  const cols = steps.map((s) => `<div class="colhead">${s / STEPS_PER_APP_SECOND} s · step ${s}</div>`).join("");
  const body = entries.map((entry) => {
    const cells = steps.map((s) => {
      const f = entry.frames.find((x) => x.step === s);
      if (!f) return `<div class="cell missing">missing</div>`;
      const off = entry.offline?.bySteps?.[s];
      return `<div class="cell"><img src="${pathToFileURL(abs(f.png ?? f.path)).href}" width="${cellW}" height="${cellH}"><div class="cap">G ${f.live.globalOrder.toFixed(2)} · H ${f.live.headingEntropy.toFixed(2)}${off?.effectiveDomains != null ? ` · domains ${off.effectiveDomains.toFixed(1)}` : ""}</div></div>`;
    }).join("");
    return `<div class="row"><div class="label">${rowLabel(entry, candidatesById.get(entry.rowId))}</div>${cells}</div>`;
  }).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
body { margin: 0; background: #0d0f14; color: #d8dbe2; font: 13px/1.35 -apple-system, Helvetica, Arial, sans-serif; }
.wrap { padding: 12px; width: max-content; }
.title { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
.row, .heads { display: flex; gap: 6px; margin-bottom: 6px; }
.label, .spacer { width: ${labelW}px; flex: none; }
.colhead { width: ${cellW}px; font-weight: 600; }
.cell { width: ${cellW}px; flex: none; }
.cell img { display: block; background: #000; }
.cap { font-size: 11px; color: #9aa1ad; }
.name { font-weight: 600; font-size: 14px; }
.id { color: #8a93a3; font-size: 11px; }
.role { color: #c9b77a; }
.tag { font-size: 10px; background: #2f5f3a; color: #d9f2de; padding: 0 4px; border-radius: 3px; white-space: nowrap; }
.tag.ref { background: #5a3f2a; color: #f2e1d0; }
.p { color: #c3c8d2; }
.m { color: #8a93a3; font-size: 11px; }
.missing { color: #e66; }
</style><div class="wrap">${header}<div class="heads"><div class="spacer"></div>${cols}</div>${body}
<div class="m">G = global heading order (1 = one shared heading). H = heading entropy over 12 bins (1 = all headings equally present). Both from the live kernel at the frame shown. Domains = offline effective heading domains for the same seed and step. Chaos life = seconds before the offline instrument read the flow as collapsed, per seed.</div></div>`;
  mkdirSync(abs(ARTIFACTS), { recursive: true });
  const htmlPath = abs(`${ARTIFACTS}/sheet-${tier}.html`);
  writeFileSync(htmlPath, html);
  const width = 24 + labelW + steps.length * (cellW + 6);
  const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(pathToFileURL(htmlPath).href);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 60000 });
  const out = `${IMAGES}/boids-flow-sheet-${tier}.jpg`;
  await page.screenshot({ path: abs(out), fullPage: true, type: "jpeg", quality: 88 });
  await context.close();
  return { path: out, bytes: statSync(abs(out)).size, cellCss: [cellW, cellH], rows: entries.map((e) => e.captureId) };
}

// ------------------------------------------------------------------ main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const opts = {
    base: args.base ?? "http://localhost:5174",
    seeds: String(args.seeds ?? args.seed ?? 0).split(",").map(Number),
    concurrency: Number(args.concurrency ?? 3),
    steps: String(args.steps ?? "300,1200,3600,9000").split(",").map(Number),
    tiers: String(args.tiers ?? "desktop,tablet,phone").split(",").filter(Boolean),
  };
  for (const tier of opts.tiers) if (!TIERS[tier]) throw new Error(`unknown tier ${tier}`);
  const filter = args.rows ? new Set(String(args.rows).split(",")) : null;
  const candidates = readJson(CANDIDATES);
  const candidatesById = new Map([...candidates.candidates, ...candidates.references].map((r) => [r.id, r]));
  const previous = existsSync(abs(CAPTURES)) ? readJson(CAPTURES) : null;
  const store = previous?.method === METHOD ? previous : { method: METHOD, rows: {}, sheets: {}, tiers: {} };
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const commandLine = `node scripts/capture-boids-flow.mjs ${process.argv.slice(2).join(" ")}`.trim();
  const save = () => {
    const ordered = Object.fromEntries(TIER_ORDER.flatMap((tier) => Object.entries(store.rows).filter(([, r]) => r.tier === tier)));
    writeJson(CAPTURES, {
      method: METHOD,
      updatedAt: new Date().toISOString(),
      commands: [...new Set([...(store.commands ?? []), commandLine])],
      base: opts.base,
      candidatesFile: CANDIDATES,
      browser: browser.version(),
      host: { platform: process.platform, arch: process.arch, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, node: process.version },
      launchArgs: LAUNCH_ARGS,
      clock: {
        dt: DT,
        stepsPerAppSecond: STEPS_PER_APP_SECOND,
        note: "The app's own rAF loop renders every frame (trails, bloom, palette as shipped). An init script pins the kernel's dt to 1/60 per call; the renderer calls step once per rendered frame at 1x (stepsPerFrame 1), so step N = N/60 s of app time on a 60 Hz display. requestedDt records the frame intervals the renderer asked for (headless rAF, not 60 Hz). rAF delivery is held at each target step for the screenshot, so held time is not in any timing. Trail fade is per drawn frame, so the trail length is a 60 Hz display's.",
      },
      seed: {
        default: 0,
        note: "Each row records its seed; capture ids for a seed other than 0 end in -seedN. The renderer reseeds every load from Math.random (renderer.ts nextSeed); the init script replaces that seed in kernel.init with the row's seed (appSeedOverridden records what the app picked). seedCheck compares the live kernel at the first target with a fresh kernel stepped the same count at the same seed and dt; identical means the frames are the offline instrument's runs for this seed, so offline.bySteps lines up with live readings.",
      },
      timing: {
        note: "segment.headlessFps and msPerFrame* are wall-clock frame rates of headless Chromium while up to `concurrency` rows ran side by side, held time excluded. kernelMsPerStep* is the kernel.step wall time inside the page (V8 in Chromium, main thread, raster pass included). Neither is a real display's frame rate; uncontended single-process costs are in candidates.json.",
        concurrency: opts.concurrency,
        loadAverageAtSave: os.loadavg().map((v) => round(v, 2)),
      },
      targets: opts.steps.map((s) => ({ seconds: s / STEPS_PER_APP_SECOND, step: s })),
      tiers: Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [k, { label: v.label, rowTier: v.rowTier, viewportCss: v.context.viewport, deviceScaleFactor: v.context.deviceScaleFactor, touch: !!v.context.hasTouch, grid: v.grid, deviceTier: v.deviceTier }])),
      retention: `Every frame is a lossless PNG at the canvas's CSS resolution in ${ARTIFACTS}/<tier>/ (git-ignored; field png). Candidate frames are also kept in ${IMAGES} (field path): the PNG itself up to 1280 CSS px wide, a JPEG at quality 90 for the 2560x1440 desktop tier. Reference frames, and every frame of the 1280x720 desktop720 pass, are only in the artifacts folder and on the contact sheets, which are built from the lossless PNGs. offline is attached only where the offline run used the capture's grid (not desktop720).`,
      sheets: store.sheets,
      rows: ordered,
    });
  };
  try {
    if (!args["sheets-only"]) {
      const jobs = [];
      for (const tier of opts.tiers) {
        const tierJobs = opts.seeds.flatMap((seed) => rowsFor(tier, candidates, filter, seed).map((job) => ({ ...job, seed })));
        if (!tierJobs.length) continue;
        const setupContext = await browser.newContext(TIERS[tier].context);
        const setupPage = await setupContext.newPage();
        await setupPage.goto(`${opts.base}/`);
        const built = await buildSnapshots(setupPage, tierJobs.map((j) => ({ captureId: j.captureId, params: j.row.params })), TIERS[tier].deviceTier);
        await setupContext.close();
        tierJobs.forEach((job, i) => { job.preset = built.presets[i]; job.presetsKey = built.presetsKey; });
        jobs.push(...tierJobs);
      }
      const cost = (j) => (j.row.params.boidCount * (TIERS[j.tier].rowTier === "desktop" ? 2 : 1));
      jobs.sort((a, b) => cost(b) - cost(a));
      console.log(`capturing ${jobs.length} rows, ${opts.concurrency} at a time: ${jobs.map((j) => j.captureId).join(", ")}`);
      let next = 0;
      const failures = [];
      await Promise.all(Array.from({ length: Math.min(opts.concurrency, jobs.length) }, async () => {
        for (;;) {
          const job = jobs[next++];
          if (!job) return;
          try {
            store.rows[job.captureId] = await captureRow(browser, job, opts);
            save();
          } catch (error) {
            failures.push({ captureId: job.captureId, error: String(error?.stack ?? error) });
            console.error(`FAILED ${job.captureId}: ${error?.stack ?? error}`);
          }
        }
      }));
      if (failures.length) {
        console.error(JSON.stringify(failures, null, 1));
        process.exitCode = 1;
      }
    }
    for (const tier of opts.tiers) {
      const entries = Object.values(store.rows).filter((r) => r.tier === tier);
      if (!entries.length) continue;
      for (const entry of entries) entry.offline = offlineSamples(candidatesById.get(entry.rowId), entry.seed, entry.frames.map((f) => f.step), entry.grid);
      const order = rowsFor(tier, candidates, null).map((j) => j.row.id);
      entries.sort((a, b) => order.indexOf(a.rowId) - order.indexOf(b.rowId) || a.seed - b.seed);
      store.sheets[tier] = await buildSheet(browser, tier, entries, candidatesById, opts);
      console.log(`sheet ${tier}: ${store.sheets[tier].path} (${Math.round(store.sheets[tier].bytes / 1024)} KB)`);
    }
    save();
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
