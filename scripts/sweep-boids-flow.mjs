#!/usr/bin/env node
/**
 * Offline "flow" sweep for Boids (2026-11-13).
 *
 * Runs the real Boids kernel (the compiled `.test-build` output of
 * src/sims/boids/kernel.ts) on a tier's real compute grid, at the per-step dt
 * the app hands it, and reads how colourful and how alive the flock is from
 * boid positions and headings. Colour in Boids is heading (the glyph shader
 * maps heading angle onto the cyclic palette), so the instrument rewards many
 * headings on screen at once, in coherent patches, that stay that way.
 *
 * Formulas and calibration: docs/sweeps/data/2026-11-13/boids-flow/INSTRUMENT.md
 *
 * Commands
 *   probe   Read the real grid per device tier from the running app (Playwright,
 *           headless). --base http://localhost:5174 --out <tiers.json>
 *   run     Run a rows file. --tier desktop|desktop720|tablet|phone
 *           --stage pilot|screen|long --rows <rows.json> --out <result.json>
 *           [--workers N] [--seeds 0,1] [--steps 150,300] [--resume]
 *           [--ids a,b] (subset of rows) [--frames <dir>] (a heading-coloured
 *           PNG per sample, for checking readings by eye) [--frame-scale 2]
 *           A long-stage rows file may name `fromScreen` + `top`; the top rows
 *           by rowScore in that screen result are added to its references.
 *   rescore Recompute summaries of a result file with the current scoring
 *           constants (no stepping). --in <result.json> [--out <file>]
 *   time    Uncontended cost: rows one at a time on the main thread, full
 *           kernel step including the raster pass. --tier --rows --out
 *           [--warmup 300] [--measure 300]
 *   design  Write the screen and long row files for every tier from a fixed
 *           Latin hypercube. --dir <rows dir>
 *
 * Needs `npm run build:test` first (the script refuses a kernel build older
 * than the source). No dependencies beyond the repo's own devDependencies.
 */
import os from "node:os";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SCRIPT), "..");
const KERNEL_JS = resolve(REPO, ".test-build/sims/boids/kernel.js");
const KERNEL_TS = resolve(REPO, "src/sims/boids/kernel.ts");
const METHOD_VERSION = "boids-flow-v1";

/** One kernel.step per rendered frame at 1x (renderer.ts tick, particle mode). */
const APP_FPS = 60;
const APP_DT = 1 / APP_FPS;

/**
 * Real compute grids, read from the running app by `probe` on 2026-11-13
 * (tiers.json). Desktop is the ultra cap, which any 16:9 window of at least
 * 1707x960 CSS px reaches; desktop720 is a 1280x720 window, which stays at one
 * cell per CSS px under the cap.
 */
const TIERS = {
  desktop: { grid: [1707, 960], css: [2560, 1440], dpr: 1, preset: "ultra", openingBoidCount: 28000 },
  desktop720: { grid: [1280, 720], css: [1280, 720], dpr: 2, preset: "ultra", openingBoidCount: 28000 },
  tablet: { grid: [768, 534], css: [1180, 820], dpr: 2, preset: "balanced", openingBoidCount: 7000 },
  phone: { grid: [390, 844], css: [390, 844], dpr: 3, preset: "balanced", openingBoidCount: 5000 },
};

/**
 * The screen runs to 2400 steps, not 1500: in the pilot the current defaults
 * collapse between 1200 and 2400, so a 25-second screen would pass them.
 */
const STAGES = {
  pilot: { seeds: [0, 1], steps: [150, 300, 600, 1200, 2400] },
  screen: { seeds: [0], steps: [150, 300, 600, 1200, 1800, 2400] },
  long: {
    seeds: [0, 1, 2],
    steps: [300, 600, 1200, 1800, 2700, 3600, 4500, 5400, 6300, 7200, 8100, 9000, 9900, 10800],
  },
};

// ------------------------------------------------------------------ metrics

const HEADING_BINS = 12;
/** Steps between the two readings churn compares (one app-second at 60 fps). */
const CHURN_LAG = 60;
/**
 * Five app-seconds: long enough for a flock at maxSpeed 24-40 to cross about
 * three view tiles, so drifting patches register and frozen lanes do not.
 */
const CHURN_SLOW_LAG = 300;
/** View tiles: the short side of the grid split into this many tiles. */
const VIEW_TILES_SHORT_SIDE = 20;
const ROW_TILE_MIN = 16;
const OCCUPIED_MIN = 2;
const DOMAIN_TILE_MIN = 3;
const DOMAIN_COHERENCE_MIN = 0.5;
const DOMAIN_JOIN_RADIANS = Math.PI / 4;
const DOMAIN_COUNT_SHARE = 0.01;
const DENSEST_TILE_FRACTION = 0.05;
const NN_SAMPLE = 3000;

/** Calibrated on the desktop pilot (INSTRUMENT.md, "Calibration"). */
export const SCORING = {
  flowThreshold: 0.5,
  scoreFromStep: 600,
  lifetimeFromStep: 300,
  coverageFull: 0.5,
  concentrationOk: 0.35,
  concentrationZero: 0.95,
  patchFull: 10,
  frozenChurn: 0.05,
};

function rowTileSize(visualRadius) {
  return Math.max(ROW_TILE_MIN, Math.round(2 * visualRadius));
}

function viewTileSize(grid) {
  return Math.max(ROW_TILE_MIN, Math.round(Math.min(grid[0], grid[1]) / VIEW_TILES_SHORT_SIDE));
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = Float64Array.from(values).sort();
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(value, places = 4) {
  if (value === null || !Number.isFinite(value)) return value;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function torusDelta(from, to, limit) {
  let delta = to - from;
  const half = limit / 2;
  if (delta > half) delta -= limit;
  else if (delta < -half) delta += limit;
  return delta;
}

function angleGap(a, b) {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/**
 * Small-sample-unbiased mean resultant length of n unit vectors summing to
 * (sx, sy): sqrt((|S|^2 - n) / (n (n - 1))). Random headings read ~0 however
 * few boids share the tile, so a sparse speckle cannot pose as order.
 */
function coherence(n, sx, sy) {
  if (n < 2) return 0;
  const r2 = (sx * sx + sy * sy - n) / (n * (n - 1));
  return r2 <= 0 ? 0 : Math.min(1, Math.sqrt(r2));
}

function tileField(x, y, ux, uy, count, grid, tile) {
  const [width, height] = grid;
  const cols = Math.max(1, Math.round(width / tile));
  const rows = Math.max(1, Math.round(height / tile));
  const n = new Int32Array(cols * rows);
  const sx = new Float64Array(cols * rows);
  const sy = new Float64Array(cols * rows);
  const colScale = cols / width;
  const rowScale = rows / height;
  for (let i = 0; i < count; i += 1) {
    const c = Math.min(cols - 1, Math.floor(x[i] * colScale));
    const r = Math.min(rows - 1, Math.floor(y[i] * rowScale));
    const t = r * cols + c;
    n[t] += 1;
    sx[t] += ux[i];
    sy[t] += uy[i];
  }
  const rho = new Float64Array(cols * rows);
  const theta = new Float64Array(cols * rows);
  for (let t = 0; t < n.length; t += 1) {
    rho[t] = coherence(n[t], sx[t], sy[t]);
    theta[t] = Math.atan2(sy[t], sx[t]);
  }
  return { cols, rows, tile, n, rho, theta };
}

function localOrder(field) {
  let weighted = 0;
  let mass = 0;
  for (let t = 0; t < field.n.length; t += 1) {
    if (field.n[t] < 2) continue;
    weighted += field.n[t] * field.rho[t];
    mass += field.n[t];
  }
  return mass > 0 ? weighted / mass : 0;
}

/**
 * Heading domains: connected patches (4-neighbour, torus) of coherent tiles
 * whose mean heading falls in the same 45-degree class, i.e. one colour band of
 * the cyclic palette. A pairwise "< 45 degrees apart" join was tried first and
 * chains a smooth swirl spanning every heading into one domain.
 */
function headingDomains(field, count) {
  const { cols, rows, n, rho, theta } = field;
  const size = cols * rows;
  const parent = new Int32Array(size);
  for (let t = 0; t < size; t += 1) parent[t] = t;
  const find = (t) => {
    while (parent[t] !== t) {
      parent[t] = parent[parent[t]];
      t = parent[t];
    }
    return t;
  };
  const classes = Math.round((2 * Math.PI) / DOMAIN_JOIN_RADIANS);
  const headingClass = new Int8Array(size).fill(-1);
  for (let t = 0; t < size; t += 1) {
    if (n[t] < DOMAIN_TILE_MIN || rho[t] < DOMAIN_COHERENCE_MIN) continue;
    const turn = (theta[t] / (2 * Math.PI) + 1) % 1;
    headingClass[t] = Math.min(classes - 1, Math.floor(turn * classes));
  }
  const active = (t) => headingClass[t] >= 0;
  const join = (a, b) => {
    if (!active(a) || headingClass[a] !== headingClass[b]) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const t = r * cols + c;
      if (cols > 1) join(t, r * cols + ((c + 1) % cols));
      if (rows > 1) join(t, ((r + 1) % rows) * cols + c);
    }
  }
  const mass = new Map();
  for (let t = 0; t < size; t += 1) {
    if (!active(t)) continue;
    const root = find(t);
    mass.set(root, (mass.get(root) ?? 0) + n[t]);
  }
  let total = 0;
  let sumSq = 0;
  let largest = 0;
  let counted = 0;
  for (const m of mass.values()) {
    total += m;
    sumSq += m * m;
    largest = Math.max(largest, m);
    if (m / count >= DOMAIN_COUNT_SHARE) counted += 1;
  }
  return {
    domains: counted,
    effectiveDomains: sumSq > 0 ? (total * total) / sumSq : 0,
    largestDomainShare: largest / count,
    domainMassShare: total / count,
  };
}

function coverageReading(field, count) {
  const tiles = field.n.length;
  let occupied = 0;
  for (let t = 0; t < tiles; t += 1) if (field.n[t] >= OCCUPIED_MIN) occupied += 1;
  const top = Math.max(1, Math.ceil(tiles * DENSEST_TILE_FRACTION));
  const sorted = Int32Array.from(field.n).sort();
  let topMass = 0;
  for (let k = 0; k < top; k += 1) topMass += sorted[tiles - 1 - k];
  return { coverage: occupied / tiles, densestShare: topMass / count };
}

function churnBetween(now, before) {
  if (!before) return null;
  let weighted = 0;
  let weight = 0;
  for (let t = 0; t < now.n.length; t += 1) {
    const w = Math.min(now.n[t] * now.rho[t], before.n[t] * before.rho[t]);
    if (w <= 0) continue;
    weighted += w * angleGap(now.theta[t], before.theta[t]);
    weight += w;
  }
  return weight > 0 ? weighted / (Math.PI * weight) : null;
}

function medianNearestNeighbour(x, y, count, grid) {
  const [width, height] = grid;
  const spacing = Math.max(2, Math.sqrt((width * height) / count));
  const cols = Math.max(1, Math.floor(width / spacing));
  const rows = Math.max(1, Math.floor(height / spacing));
  const bw = width / cols;
  const bh = height / rows;
  const step = Math.min(bw, bh);
  const start = new Int32Array(cols * rows + 1);
  const bucket = new Int32Array(count);
  for (let i = 0; i < count; i += 1) {
    const b = Math.min(rows - 1, Math.floor(y[i] / bh)) * cols + Math.min(cols - 1, Math.floor(x[i] / bw));
    bucket[i] = b;
    start[b + 1] += 1;
  }
  for (let b = 0; b < cols * rows; b += 1) start[b + 1] += start[b];
  const cursor = start.slice(0, cols * rows);
  const items = new Int32Array(count);
  for (let i = 0; i < count; i += 1) items[cursor[bucket[i]]++] = i;

  const stride = Math.max(1, Math.floor(count / NN_SAMPLE));
  const maxRing = Math.ceil(Math.max(cols, rows) / 2) + 1;
  const distances = [];
  for (let i = 0; i < count; i += stride) {
    const bc = bucket[i] % cols;
    const br = Math.floor(bucket[i] / cols);
    let best = Infinity;
    for (let ring = 0; ring <= maxRing; ring += 1) {
      if (ring > 0 && (ring - 1) * step >= Math.sqrt(best)) break;
      for (let dr = -ring; dr <= ring; dr += 1) {
        for (let dc = -ring; dc <= ring; dc += 1) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const b = ((br + dr + rows * 4) % rows) * cols + ((bc + dc + cols * 4) % cols);
          for (let k = start[b]; k < start[b + 1]; k += 1) {
            const j = items[k];
            if (j === i) continue;
            const dx = torusDelta(x[i], x[j], width);
            const dy = torusDelta(y[i], y[j], height);
            const d2 = dx * dx + dy * dy;
            if (d2 < best) best = d2;
          }
        }
      }
    }
    if (Number.isFinite(best)) distances.push(Math.sqrt(best));
  }
  return median(distances);
}

function unitHeadings(kernel) {
  const count = kernel.boidCount;
  const { vx, vy } = kernel;
  const ux = new Float32Array(count);
  const uy = new Float32Array(count);
  let speedSum = 0;
  for (let i = 0; i < count; i += 1) {
    const speed = Math.hypot(vx[i], vy[i]);
    speedSum += speed;
    if (speed > 0) {
      ux[i] = vx[i] / speed;
      uy[i] = vy[i] / speed;
    }
  }
  return { ux, uy, meanSpeed: speedSum / count };
}

function viewFieldOf(kernel, ctx) {
  const { ux, uy } = unitHeadings(kernel);
  return tileField(kernel.x, kernel.y, ux, uy, kernel.boidCount, ctx.grid, ctx.viewTile);
}

/** Everything one sample records, from the kernel's own position/velocity arrays. */
function measure(kernel, ctx, before, beforeSlow) {
  const count = kernel.boidCount;
  const { x, y } = kernel;
  const { ux, uy, meanSpeed } = unitHeadings(kernel);
  const hist = new Float64Array(HEADING_BINS);
  let gx = 0;
  let gy = 0;
  for (let i = 0; i < count; i += 1) {
    gx += ux[i];
    gy += uy[i];
    const turn = (Math.atan2(uy[i], ux[i]) / (2 * Math.PI) + 1) % 1;
    hist[Math.min(HEADING_BINS - 1, Math.floor(turn * HEADING_BINS))] += 1;
  }
  let entropy = 0;
  for (const h of hist) {
    if (h > 0) entropy -= (h / count) * Math.log(h / count);
  }
  const rowField = tileField(x, y, ux, uy, count, ctx.grid, ctx.rowTile);
  const viewField = tileField(x, y, ux, uy, count, ctx.grid, ctx.viewTile);
  const nn = medianNearestNeighbour(x, y, count, ctx.grid);
  const sample = {
    globalOrder: Math.hypot(gx, gy) / count,
    localOrder: localOrder(rowField),
    localOrderView: localOrder(viewField),
    headingEntropy: entropy / Math.log(HEADING_BINS),
    ...headingDomains(viewField, count),
    ...coverageReading(viewField, count),
    churn: churnBetween(viewField, before),
    churnSlow: churnBetween(viewField, beforeSlow),
    nnCells: nn,
    nnCss: nn * ctx.cssPerCell,
    meanSpeedFraction: meanSpeed / kernel.maxSpeed,
  };
  for (const key of Object.keys(sample)) sample[key] = round(sample[key]);
  return { sample, viewField };
}

/** Coverage term: 0 for tight balls or an empty screen, 1 once the flock fills enough of it. */
function coverageTerm(sample, scoring = SCORING) {
  const filled = clamp01(sample.coverage / scoring.coverageFull);
  const spread = clamp01(
    (scoring.concentrationZero - sample.densestShare) /
      (scoring.concentrationZero - scoring.concentrationOk),
  );
  return filled * spread;
}

/**
 * Patch term: 1 while the screen holds at least `patchFull` effective heading
 * domains, less when a few large regions (a two-tone split, broad lanes) carry
 * every heading between them.
 */
function patchTerm(sample, scoring = SCORING) {
  return scoring.patchFull ? clamp01(sample.effectiveDomains / scoring.patchFull) : 1;
}

export function flowScore(sample, scoring = SCORING) {
  return (
    sample.localOrder *
    sample.headingEntropy *
    (1 - sample.globalOrder) *
    coverageTerm(sample, scoring) *
    patchTerm(sample, scoring)
  );
}

/** Per-seed summary from its samples; pure, so `rescore` can re-run it. */
function summariseRun(samples, scoring = SCORING, dt = APP_DT) {
  const scored = samples.map((s) => ({ ...s, flowScore: round(flowScore(s, scoring)) }));
  const late = scored.filter((s) => s.step >= scoring.scoreFromStep);
  const rowScore = late.length ? Math.min(...late.map((s) => s.flowScore)) : null;
  let lifetime = 0;
  for (const s of scored.filter((s) => s.step >= scoring.lifetimeFromStep)) {
    if (s.flowScore < scoring.flowThreshold) break;
    lifetime = s.step;
  }
  const last = scored[scored.length - 1];
  return {
    samples: scored,
    summary: {
      rowScore: round(rowScore),
      chaosLifetimeSteps: lifetime,
      chaosLifetimeSeconds: round(lifetime * dt, 1),
      survivedToEnd: lifetime === last.step,
      finalGlobalOrder: last.globalOrder,
      finalLocalOrder: last.localOrder,
      finalEntropy: last.headingEntropy,
      peakGlobalOrder: Math.max(...scored.map((s) => s.globalOrder)),
      medianChurn: round(median(scored.map((s) => s.churn).filter((c) => c !== null))),
      medianChurnSlow: round(median(scored.map((s) => s.churnSlow).filter((c) => c !== null && c !== undefined))),
      medianNnCss: round(median(scored.map((s) => s.nnCss)), 2),
    },
  };
}

function summariseRow(row, scoring = SCORING) {
  for (const run of row.runs) {
    const { samples, summary } = summariseRun(run.samples, scoring, run.dt ?? APP_DT);
    run.samples = samples;
    run.summary = summary;
  }
  const pick = (key) => row.runs.map((r) => r.summary[key]).filter((v) => v !== null);
  row.summary = {
    rowScoreMedian: round(median(pick("rowScore"))),
    rowScoreMin: round(Math.min(...pick("rowScore"))),
    chaosLifetimeMinSteps: Math.min(...pick("chaosLifetimeSteps")),
    chaosLifetimeMedianSteps: median(pick("chaosLifetimeSteps")),
    seedsSurvived: row.runs.filter((r) => r.summary.survivedToEnd).length,
    frozen: median(pick("medianChurnSlow")) < scoring.frozenChurn,
    msPerStepMedian: round(median(row.runs.map((r) => r.msPerStep)), 2),
    msPerStepAppEstimate: round(median(row.runs.map((r) => r.msPerStep + r.rasteriseMs)), 2),
    medianNnCss: round(median(pick("medianNnCss")), 2),
  };
  return row;
}

// ------------------------------------------------------------------ frames

/** Twilight stops from src/app/colormap.ts (the Boids default palette). */
const TWILIGHT = [
  [0, [226, 217, 226]],
  [0.25, [65, 110, 175]],
  [0.5, [30, 20, 55]],
  [0.75, [150, 70, 90]],
  [1, [226, 217, 226]],
];
const BOIDS_BACKGROUND = [5, 8, 18];

function twilight(turn) {
  for (let k = 1; k < TWILIGHT.length; k += 1) {
    const [t1, c1] = TWILIGHT[k];
    if (turn <= t1) {
      const [t0, c0] = TWILIGHT[k - 1];
      const f = (turn - t0) / (t1 - t0);
      return [0, 1, 2].map((i) => c0[i] + (c1[i] - c0[i]) * f);
    }
  }
  return TWILIGHT[0][1];
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function encodePng(width, height, rgb) {
  const rowBytes = width * 3 + 1;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * rowBytes] = 0;
    rgb.copy(raw, y * rowBytes + 1, y * width * 3, (y + 1) * width * 3);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * A still of the glyph pass without trails or bloom: each boid a disc of
 * radius clamp(pointSize / 2, 2, 8) cells, coloured by heading on twilight and
 * dimmed when it opposes the mean heading, as boidPaletteColour does. For
 * judging instrument readings by eye, not a stand-in for the app's look.
 */
function renderFrame(kernel, grid, pointSize, scale = 1) {
  const [width, height] = grid;
  const count = kernel.boidCount;
  const { ux, uy } = unitHeadings(kernel);
  let mx = 0;
  let my = 0;
  for (let i = 0; i < count; i += 1) {
    mx += ux[i];
    my += uy[i];
  }
  const mean = Math.hypot(mx, my) || 1;
  mx /= mean;
  my /= mean;
  const halo = Math.max(2, Math.min(8, pointSize / 2));
  const core = halo * 0.2;
  const reach = Math.ceil(halo);
  const sum = new Float32Array(width * height * 3);
  const weight = new Float32Array(width * height);
  const cover = new Float32Array(width * height);
  for (let i = 0; i < count; i += 1) {
    const turn = (Math.atan2(uy[i], ux[i]) / (2 * Math.PI) + 1) % 1;
    const opposed = (1 - (ux[i] * mx + uy[i] * my)) * 0.5;
    const brightness = 0.35 + (1 - opposed) * 0.95 * 0.65;
    const colour = twilight(turn).map((c) => c * brightness);
    const cx = Math.floor(kernel.x[i]);
    const cy = Math.floor(kernel.y[i]);
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const f = 1 - smoothstep(core, halo, Math.hypot(dx, dy));
        if (f <= 0) continue;
        const px = (cx + dx + width) % width;
        const py = (cy + dy + height) % height;
        const p = py * width + px;
        sum[p * 3] += colour[0] * f;
        sum[p * 3 + 1] += colour[1] * f;
        sum[p * 3 + 2] += colour[2] * f;
        weight[p] += f;
        if (f > cover[p]) cover[p] = f;
      }
    }
  }
  const rgb = Buffer.alloc(width * height * 3);
  for (let p = 0; p < width * height; p += 1) {
    const mix = Math.min(cover[p] * 0.92, 1);
    for (let c = 0; c < 3; c += 1) {
      const dot = weight[p] > 0 ? sum[p * 3 + c] / weight[p] : BOIDS_BACKGROUND[c];
      rgb[p * 3 + c] = Math.round(BOIDS_BACKGROUND[c] + (dot - BOIDS_BACKGROUND[c]) * mix);
    }
  }
  if (scale <= 1) return encodePng(width, height, rgb);
  const w = Math.floor(width / scale);
  const h = Math.floor(height / scale);
  const small = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        let total = 0;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            total += rgb[((y * scale + dy) * width + x * scale + dx) * 3 + c];
          }
        }
        small[(y * w + x) * 3 + c] = Math.round(total / (scale * scale));
      }
    }
  }
  return encodePng(w, h, small);
}

// ------------------------------------------------------------------ jobs

let kernelModule = null;

async function loadKernel() {
  kernelModule ??= await import(pathToFileURL(KERNEL_JS).href);
  return kernelModule;
}

function schemaDefaults(kernel) {
  return Object.fromEntries(kernel.paramSchema.map((d) => [d.key, d.default]));
}

/** Kernel params a row runs with: schema defaults, then the row, never obstacles. */
function fullParams(kernel, rowParams) {
  return { ...schemaDefaults(kernel), ...rowParams, obstacleLayout: "none" };
}

async function runJob(job) {
  const { BoidsKernel } = await loadKernel();
  const kernel = new BoidsKernel();
  const params = fullParams(kernel, job.params);
  // With no obstacles nothing in the steering reads the raster, so skipping it
  // leaves the trajectory bit-identical (checked in INSTRUMENT.md) and its cost
  // is timed on its own below.
  const raster = kernel.rasterise;
  kernel.rasterise = () => {};
  kernel.init(job.grid[0], job.grid[1], { ...params, seed: job.seed });

  const ctx = {
    grid: job.grid,
    cssPerCell: job.cssPerCell,
    rowTile: rowTileSize(Number(params.visualRadius)),
    viewTile: viewTileSize(job.grid),
  };
  const sampleSteps = new Set(job.steps);
  const lagSteps = new Set();
  for (const s of job.steps) {
    for (const lag of [CHURN_LAG, CHURN_SLOW_LAG]) if (s > lag) lagSteps.add(s - lag);
  }
  const lagFields = new Map();
  const maxStep = Math.max(...job.steps);
  const stepTimes = new Float64Array(maxStep);
  const samples = [];
  const started = performance.now();
  for (let step = 1; step <= maxStep; step += 1) {
    const t0 = performance.now();
    kernel.step(job.dt);
    stepTimes[step - 1] = performance.now() - t0;
    if (lagSteps.has(step) && !sampleSteps.has(step)) {
      lagFields.set(step, viewFieldOf(kernel, ctx));
    }
    if (sampleSteps.has(step)) {
      const { sample, viewField } = measure(
        kernel,
        ctx,
        lagFields.get(step - CHURN_LAG) ?? null,
        lagFields.get(step - CHURN_SLOW_LAG) ?? null,
      );
      if (lagSteps.has(step)) lagFields.set(step, viewField);
      samples.push({ step, seconds: round((step * job.dt), 2), ...sample });
      if (job.framesDir) {
        mkdirSync(job.framesDir, { recursive: true });
        writeFileSync(
          `${job.framesDir}/${job.tier}-${job.rowId}-seed${job.seed}-step${step}.png`,
          renderFrame(kernel, job.grid, Number(params.pointSize), job.frameScale),
        );
      }
    }
  }
  const rasterTimes = [];
  for (let k = 0; k < 7; k += 1) {
    const t0 = performance.now();
    raster.call(kernel);
    rasterTimes.push(performance.now() - t0);
  }
  const sorted = Float64Array.from(stepTimes).sort();
  return {
    rowId: job.rowId,
    seed: job.seed,
    dt: job.dt,
    msPerStep: round(median(stepTimes), 3),
    msPerStepP90: round(sorted[Math.floor(sorted.length * 0.9)], 3),
    rasteriseMs: round(median(rasterTimes), 3),
    wallMs: Math.round(performance.now() - started),
    glyphDiameterCss: round(2 * Math.max(2, Math.min(8, Number(params.pointSize) / 2)) * job.cssPerCell, 2),
    samples,
  };
}

if (!isMainThread) {
  parentPort.on("message", async (job) => {
    try {
      parentPort.postMessage({ ok: true, result: await runJob(job) });
    } catch (error) {
      parentPort.postMessage({ ok: false, error: String(error?.stack ?? error), job });
    }
  });
}

/** Longest jobs first across a worker pool; `onResult` sees each as it lands. */
function runPool(jobs, workerCount, onResult) {
  const queue = [...jobs].sort((a, b) => b.cost - a.cost);
  return new Promise((resolvePool, rejectPool) => {
    let active = 0;
    let failed = false;
    const workers = [];
    const feed = (worker) => {
      const job = queue.shift();
      if (!job) {
        worker.terminate();
        if (--active === 0) resolvePool();
        return;
      }
      worker.postMessage(job);
    };
    const count = Math.max(1, Math.min(workerCount, queue.length));
    if (queue.length === 0) resolvePool();
    for (let k = 0; k < count; k += 1) {
      const worker = new Worker(SCRIPT);
      workers.push(worker);
      active += 1;
      worker.on("message", (msg) => {
        if (failed) return;
        if (!msg.ok) {
          failed = true;
          workers.forEach((w) => w.terminate());
          rejectPool(new Error(`job ${msg.job.rowId}/${msg.job.seed} failed:\n${msg.error}`));
          return;
        }
        onResult(msg.result);
        feed(worker);
      });
      worker.on("error", (error) => {
        failed = true;
        workers.forEach((w) => w.terminate());
        rejectPool(error);
      });
      feed(worker);
    }
  });
}

// ------------------------------------------------------------------ CLI helpers

function parseArgs(argv) {
  const args = { _: [] };
  for (let k = 0; k < argv.length; k += 1) {
    const a = argv[k];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[k + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      k += 1;
    }
  }
  return args;
}

function numberList(text) {
  return String(text).split(",").filter(Boolean).map(Number);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(REPO, path), "utf8"));
}

function writeJson(path, data) {
  const target = resolve(REPO, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(`${target}.tmp`, JSON.stringify(data, null, 1) + "\n");
  renameSync(`${target}.tmp`, target);
}

function assertKernelBuild() {
  if (!existsSync(KERNEL_JS)) throw new Error("No compiled kernel: run `npm run build:test` first.");
  if (statSync(KERNEL_JS).mtimeMs < statSync(KERNEL_TS).mtimeMs) {
    throw new Error("The compiled kernel is older than src/sims/boids/kernel.ts: run `npm run build:test`.");
  }
}

function tierInfo(name) {
  const tier = TIERS[name];
  if (!tier) throw new Error(`unknown tier ${name}; one of ${Object.keys(TIERS).join(", ")}`);
  return { name, ...tier, cssPerCell: tier.css[0] / tier.grid[0] };
}

/**
 * Long-stage rows: the spec's references, then screen candidates no costlier
 * than `maxCostRatio` x the screen's ref-current. `top` takes the best by
 * rowScore; `topFiner` adds the best of those whose median nearest-neighbour
 * spacing is at most `finerRatio` x ref-current's (the finer-grained look the
 * operator asked for), so a coarse-but-chaotic top end cannot crowd them out.
 */
function resolveRows(spec) {
  const rows = [...(spec.rows ?? [])];
  if (!spec.fromScreen) return rows;
  const screen = readJson(spec.fromScreen);
  const current = screen.rows.find((r) => r.id === "ref-current")?.summary;
  const known = new Set(rows.map((r) => r.id));
  const affordable = screen.rows
    .filter((r) => r.kind === "candidate" && r.summary?.rowScoreMedian !== null && r.summary?.rowScoreMedian !== undefined)
    .filter((r) => !current || !spec.maxCostRatio || r.summary.msPerStepMedian <= spec.maxCostRatio * current.msPerStepMedian)
    .sort((a, b) => b.summary.rowScoreMedian - a.summary.rowScoreMedian);
  const take = (list, count, reason) => {
    let taken = 0;
    for (const r of list) {
      if (taken >= count) break;
      if (known.has(r.id)) continue;
      known.add(r.id);
      taken += 1;
      rows.push({ id: r.id, kind: "candidate", label: r.label, params: r.rowParams, screenRank: screen.ranking.indexOf(r.id) + 1, selectedBy: reason });
    }
  };
  take(affordable, spec.top ?? 12, "rowScore");
  if (spec.topFiner && current) {
    const finer = affordable.filter((r) => r.summary.medianNnCss <= (spec.finerRatio ?? 0.7) * current.medianNnCss);
    take(finer, spec.topFiner, "finer");
  }
  return rows;
}

// ------------------------------------------------------------------ commands

async function commandRun(args) {
  assertKernelBuild();
  const tier = tierInfo(args.tier);
  const spec = readJson(args.rows);
  const stage = STAGES[args.stage];
  if (!stage) throw new Error(`--stage must be one of ${Object.keys(STAGES).join(", ")}`);
  const seeds = args.seeds ? numberList(args.seeds) : spec.seeds ?? stage.seeds;
  const steps = args.steps ? numberList(args.steps) : spec.steps ?? stage.steps;
  const workers = Number(args.workers ?? Math.max(1, os.cpus().length - 2));
  const only = args.ids ? new Set(String(args.ids).split(",")) : null;
  const rows = resolveRows(spec).filter((r) => !only || only.has(r.id));
  const framesDir = args.frames ? resolve(REPO, args.frames) : null;
  const { BoidsKernel } = await loadKernel();
  const probeKernel = new BoidsKernel();

  const out = args.out;
  const previous = args.resume && existsSync(resolve(REPO, out)) ? readJson(out) : null;
  const result = {
    method: METHOD_VERSION,
    command: `node scripts/sweep-boids-flow.mjs ${process.argv.slice(2).join(" ")}`,
    createdAt: new Date().toISOString(),
    tier: tier.name,
    grid: tier.grid,
    css: tier.css,
    cssPerCell: round(tier.cssPerCell, 4),
    preset: tier.preset,
    stage: args.stage,
    rowsFile: args.rows,
    dtDefault: APP_DT,
    stepsPerAppSecond: APP_FPS,
    seeds,
    steps,
    churnLagSteps: CHURN_LAG,
    churnSlowLagSteps: CHURN_SLOW_LAG,
    viewTile: viewTileSize(tier.grid),
    rowTileRule: `max(${ROW_TILE_MIN}, round(2 x visualRadius))`,
    scoring: SCORING,
    workers,
    host: { cpus: os.cpus().length, model: os.cpus()[0]?.model, node: process.version },
    kernelBuild: relative(REPO, KERNEL_JS),
    status: "running",
    rows: rows.map((r) => ({
      id: r.id,
      kind: r.kind ?? "candidate",
      label: r.label ?? r.id,
      ...(r.screenRank ? { screenRank: r.screenRank, selectedBy: r.selectedBy } : {}),
      rowParams: r.params,
      params: fullParams(probeKernel, r.params),
      dt: r.dt ?? APP_DT,
      runs: [],
    })),
  };
  if (previous) {
    for (const row of result.rows) {
      const old = previous.rows.find((r) => r.id === row.id);
      if (old) row.runs = old.runs.filter((run) => seeds.includes(run.seed));
    }
  }
  const jobs = [];
  for (const row of result.rows) {
    for (const seed of seeds) {
      if (row.runs.some((run) => run.seed === seed)) continue;
      jobs.push({
        rowId: row.id,
        seed,
        params: row.rowParams,
        grid: tier.grid,
        cssPerCell: tier.cssPerCell,
        dt: row.dt,
        steps,
        tier: tier.name,
        framesDir,
        frameScale: Number(args["frame-scale"] ?? 1),
        cost: Number(row.params.boidCount) * Math.max(...steps),
      });
    }
  }
  const started = Date.now();
  const total = jobs.length;
  let done = 0;
  console.log(`${tier.name}/${args.stage}: ${result.rows.length} rows x ${seeds.length} seeds = ${total} jobs on ${workers} workers`);
  writeJson(out, result);
  await runPool(jobs, workers, (run) => {
    const row = result.rows.find((r) => r.id === run.rowId);
    row.runs.push(run);
    row.runs.sort((a, b) => a.seed - b.seed);
    done += 1;
    const elapsed = (Date.now() - started) / 1000;
    console.log(`[${done}/${total}] ${run.rowId} seed ${run.seed}: ${run.msPerStep} ms/step, ${(run.wallMs / 1000).toFixed(0)} s (elapsed ${elapsed.toFixed(0)} s)`);
    writeJson(out, result);
  });
  finishResult(result);
  result.status = "complete";
  result.wallClockSeconds = Math.round((Date.now() - started) / 1000);
  writeJson(out, result);
  printTable(result);
}

/**
 * Screen and pilot rank by rowScore. The long stage ranks by median chaos
 * lifetime first, because its min-over-3-minutes rowScore punishes a dip at
 * minute three as hard as one at second ten; rowScore breaks ties.
 */
function finishResult(result, scoring = SCORING) {
  result.scoring = scoring;
  for (const row of result.rows) if (row.runs.length) summariseRow(row, scoring);
  const byLifetime = result.stage === "long";
  result.rankingKey = byLifetime ? "chaosLifetimeMedianSteps, then rowScoreMedian" : "rowScoreMedian";
  result.ranking = result.rows
    .filter((r) => r.summary && r.summary.rowScoreMedian !== null)
    .sort((a, b) =>
      (byLifetime ? b.summary.chaosLifetimeMedianSteps - a.summary.chaosLifetimeMedianSteps : 0) ||
      b.summary.rowScoreMedian - a.summary.rowScoreMedian)
    .map((r) => r.id);
}

function printTable(result) {
  const lines = [];
  lines.push("| rank | row | kind | rowScore med (min) | lifetime s med (min) | survived | ms/step | NN css | seed-0 final G / L / E |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  result.ranking.forEach((id, k) => {
    const r = result.rows.find((row) => row.id === id);
    const s = r.summary;
    const last = r.runs[0].summary;
    lines.push(
      `| ${k + 1} | ${r.id} | ${r.kind} | ${s.rowScoreMedian} (${s.rowScoreMin}) | ${round(s.chaosLifetimeMedianSteps / APP_FPS, 1)} (${round(s.chaosLifetimeMinSteps / APP_FPS, 1)}) | ${s.seedsSurvived}/${r.runs.length} | ${s.msPerStepMedian} | ${s.medianNnCss}${s.frozen ? " frozen" : ""} | ${last.finalGlobalOrder} / ${last.finalLocalOrder} / ${last.finalEntropy} |`,
    );
  });
  console.log(lines.join("\n"));
}

function commandRescore(args) {
  const result = readJson(args.in);
  finishResult(result);
  writeJson(args.out ?? args.in, result);
  printTable(result);
}

async function commandTime(args) {
  assertKernelBuild();
  const tier = tierInfo(args.tier);
  const only = args.ids ? new Set(String(args.ids).split(",")) : null;
  const rows = resolveRows(readJson(args.rows)).filter((r) => (only ? only.has(r.id) : true));
  const warmup = Number(args.warmup ?? 300);
  const measureSteps = Number(args.measure ?? 300);
  const { BoidsKernel } = await loadKernel();
  const out = [];
  for (const row of rows) {
    const kernel = new BoidsKernel();
    kernel.init(tier.grid[0], tier.grid[1], { ...fullParams(kernel, row.params), seed: 0 });
    for (let k = 0; k < warmup; k += 1) kernel.step(row.dt ?? APP_DT);
    const times = [];
    for (let k = 0; k < measureSteps; k += 1) {
      const t0 = performance.now();
      kernel.step(row.dt ?? APP_DT);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const entry = { id: row.id, boidCount: kernel.boidCount, msPerStepFull: round(median(times), 3), p90: round(times[Math.floor(times.length * 0.9)], 3) };
    out.push(entry);
    console.log(JSON.stringify(entry));
  }
  if (args.out) writeJson(args.out, { method: METHOD_VERSION, tier: tier.name, grid: tier.grid, warmup, measureSteps, note: "single process, main thread, full kernel.step including the raster pass", rows: out });
}

async function commandProbe(args) {
  const base = args.base ?? "http://localhost:5174";
  const { chromium } = await import("@playwright/test");
  const contexts = [
    { tier: "desktop720", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 },
    { tier: "desktop-mbp16", viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 2 },
    { tier: "desktop", viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 },
    { tier: "tablet", viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    { tier: "phone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  ];
  const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu"] });
  const readings = [];
  for (const { tier, ...options } of contexts) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${base}/#/boids`);
    await page.waitForSelector("canvas[data-render-size]", { timeout: 30000 });
    await page.waitForTimeout(3000);
    const read = () =>
      page.evaluate(async () => {
        const canvas = document.querySelector("canvas[data-render-size]");
        const rect = canvas.getBoundingClientRect();
        const qp = await import("/src/app/qualityProfiles.ts");
        const deviceTier = qp.detectDeviceTier();
        const leaf = (pattern) =>
          [...document.querySelectorAll("*")].find((e) => e.childElementCount === 0 && pattern.test(e.textContent ?? ""))?.textContent ?? null;
        const param = (key) => document.querySelector(`[data-param-key="${key}"]`)?.value ?? null;
        const iterText = leaf(/^iter [0-9,]+$/);
        return {
          renderSize: canvas.dataset.renderSize,
          displaySize: canvas.dataset.displaySize,
          renderer: canvas.dataset.renderer,
          devicePixelRatio: window.devicePixelRatio,
          canvasCss: [rect.width, rect.height],
          coarsePointer: matchMedia("(pointer: coarse)").matches,
          deviceTier,
          resolutionPreset: qp.qualityProfileFor("boids", "particle", deviceTier).defaultPreset,
          openingParams: Object.fromEntries(
            ["boidCount", "initialFlocks", "visualRadius", "separationRadius", "maxSpeed", "alignment", "cohesion", "separation", "pointSize"].map((k) => [k, Number(param(k))]),
          ),
          iterations: iterText ? Number(iterText.replace(/[^0-9]/g, "")) : null,
          fpsLabel: leaf(/^[0-9]+ fps$/),
          now: performance.now(),
        };
      });
    const first = await read();
    await page.waitForTimeout(6000);
    const second = await read();
    const { iterations: _i, now: _n, ...reading } = second;
    readings.push({
      context: tier,
      viewport: options.viewport,
      ...reading,
      headlessStepsPerSecond: round((second.iterations - first.iterations) / ((second.now - first.now) / 1000), 1),
      pageErrors: errors,
    });
    console.log(tier, JSON.stringify(readings.at(-1)));
    await context.close();
  }
  await browser.close();
  const outPath = args.out ?? "docs/sweeps/data/2026-11-13/boids-flow/tiers.json";
  writeJson(outPath, {
    method: METHOD_VERSION,
    measuredAt: new Date().toISOString(),
    base,
    note: "Headless Chromium (--use-angle=metal --enable-gpu), fresh context per tier, default Boids opening. headlessStepsPerSecond is kernel steps per wall second in headless, where rAF is not tied to a display; it shows CPU-bound cases (desktop) but not a real device's refresh rate.",
    readings,
  });
}

// ------------------------------------------------------------------ design

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let m = Math.imul(state ^ (state >>> 15), 1 | state);
    m ^= m + Math.imul(m ^ (m >>> 7), 61 | m);
    return ((m ^ (m >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Latin hypercube: one stratified, shuffled column per axis, in [0, 1). */
function latinHypercube(count, axes, random) {
  const columns = axes.map(() => {
    const strata = Array.from({ length: count }, (_, k) => (k + random()) / count);
    for (let k = count - 1; k > 0; k -= 1) {
      const j = Math.floor(random() * (k + 1));
      [strata[k], strata[j]] = [strata[j], strata[k]];
    }
    return strata;
  });
  return Array.from({ length: count }, (_, k) => Object.fromEntries(axes.map((a, i) => [a, columns[i][k]])));
}

const lerp = (lo, hi, u) => lo + (hi - lo) * u;
const quantise = (value, step) => Math.round(value / step) * step;
const FLOCK_CHOICES = [0, 6, 7, 8, 9, 10, 11, 12];

/** Search ranges per tier; radii shrink with the grid's short side. */
export const DESIGN = {
  seed: 20261113,
  desktop: { rows: 96, visualRadius: [8, 32], boidCount: [12000, 28000] },
  tablet: { rows: 96, visualRadius: [4, 20], boidCount: [4000, 12000] },
  phone: { rows: 96, visualRadius: [3, 16], boidCount: [3000, 8000] },
  shared: {
    separationRatio: [0.25, 2.0],
    separation: [0.1, 0.6],
    alignment: [0.01, 0.12],
    cohesion: [0, 0.02],
    maxSpeed: [24, 40],
  },
};

/** Long stage per tier: what goes forward from the screen, sized to the time budget. */
export const LONG_SELECTION = {
  desktop: { top: 8, topFiner: 3 },
  tablet: { top: 9, topFiner: 3 },
  phone: { top: 9, topFiner: 3 },
  maxCostRatio: 1.15,
  finerRatio: 0.7,
};

function designRow(tierName, u) {
  const t = DESIGN[tierName];
  const s = DESIGN.shared;
  const visualRadius = Math.round(lerp(t.visualRadius[0], t.visualRadius[1], u.visualRadius));
  const separationRadius = Math.max(1, Math.min(32, Math.round(visualRadius * lerp(s.separationRatio[0], s.separationRatio[1], u.separationRatio))));
  const params = {
    boidCount: quantise(lerp(t.boidCount[0], t.boidCount[1], u.boidCount), 250),
    initialFlocks: FLOCK_CHOICES[Math.min(FLOCK_CHOICES.length - 1, Math.floor(u.initialFlocks * FLOCK_CHOICES.length))],
    visualRadius,
    separationRadius,
    maxSpeed: Math.round(lerp(s.maxSpeed[0], s.maxSpeed[1], u.maxSpeed)),
    alignment: round(lerp(s.alignment[0], s.alignment[1], u.alignment), 3),
    cohesion: round(lerp(s.cohesion[0], s.cohesion[1], u.cohesion), 4),
    separation: round(lerp(s.separation[0], s.separation[1], u.separation), 3),
    pointSize: 4,
  };
  return params;
}

function rowId(p) {
  return `n${p.boidCount}_f${p.initialFlocks}_vr${p.visualRadius}_sr${p.separationRadius}_v${p.maxSpeed}_a${p.alignment}_c${p.cohesion}_s${p.separation}`;
}

/** Shrink a desktop-grid radius to the same fraction of another tier's short side. */
function scaleRadius(radius, tierName) {
  const short = Math.min(...TIERS[tierName].grid);
  return Math.max(1, Math.round((radius * short) / Math.min(...TIERS.desktop.grid)));
}

/** Boid count with the same boids-per-cell as `count` on the desktop grid. */
function scaleCount(count, tierName) {
  if (tierName === "desktop") return count;
  const [w, h] = TIERS[tierName].grid;
  const [dw, dh] = TIERS.desktop.grid;
  return quantise((count * w * h) / (dw * dh), 50);
}

const CURRENT = { boidCount: 28000, initialFlocks: 8, visualRadius: 14, separationRadius: 27, maxSpeed: 36, alignment: 0.09, cohesion: 0.011, separation: 0.22, pointSize: 4 };
const PRE_1105 = { ...CURRENT, boidCount: 17777, initialFlocks: 6, visualRadius: 25, separationRadius: 8 };
const REJECTED_152 = { boidCount: 17777, initialFlocks: 6, visualRadius: 36, separationRadius: 6, maxSpeed: 32, alignment: 0.15, cohesion: 0.035, separation: 0.2, pointSize: 4 };
/** Shipped preset Scatter merged over the kernel defaults, as the Presets select applies it. */
const SCATTER = { ...CURRENT, boidCount: 17777, visualRadius: 24, separationRadius: 10, maxSpeed: 26, alignment: 0.03, cohesion: 0.004, separation: 0.5 };

export function referenceRows(tierName) {
  const opening = TIERS[tierName].openingBoidCount;
  const refs = [
    { id: "ref-current", label: "current opening (tier count)", params: { ...CURRENT, boidCount: opening } },
    { id: "ref-pre1105", label: "pre-2026-11-05 defaults, desktop density", params: { ...PRE_1105, boidCount: scaleCount(17777, tierName) } },
    { id: "ref-scatter", label: "shipped preset Scatter, desktop density (pilot's top reference)", params: { ...SCATTER, boidCount: scaleCount(17777, tierName) } },
    { id: "ref-rejected152", label: "152 finalist the operator rejected (one heading, tight balls)", params: { ...REJECTED_152, boidCount: scaleCount(17777, tierName) } },
    { id: "ref-speckle", label: "alignment 0, cohesion 0 (pure speckle)", params: { ...CURRENT, boidCount: opening, alignment: 0, cohesion: 0 } },
  ];
  if (tierName !== "desktop" && tierName !== "desktop720") {
    refs.push(
      { id: "ref-current-scaled", label: "current opening, radii scaled to the tier's short side", params: { ...CURRENT, boidCount: opening, visualRadius: scaleRadius(14, tierName), separationRadius: scaleRadius(27, tierName) } },
      { id: "ref-pre1105-scaled", label: "pre-2026-11-05, radii scaled to the tier's short side", params: { ...PRE_1105, boidCount: scaleCount(17777, tierName), visualRadius: scaleRadius(25, tierName), separationRadius: scaleRadius(8, tierName) } },
    );
  }
  return refs.map((r) => ({ ...r, kind: "reference" }));
}

function commandDesign(args) {
  const dir = args.dir ?? "docs/sweeps/data/2026-11-13/boids-flow/rows";
  const random = mulberry32(DESIGN.seed);
  const axes = ["visualRadius", "separationRatio", "separation", "alignment", "cohesion", "maxSpeed", "boidCount", "initialFlocks"];
  for (const tierName of ["desktop", "tablet", "phone"]) {
    const unit = latinHypercube(DESIGN[tierName].rows, axes, random);
    const seen = new Set();
    const candidates = [];
    for (const u of unit) {
      const params = designRow(tierName, u);
      const id = rowId(params);
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push({ id, kind: "candidate", params });
    }
    const refs = referenceRows(tierName);
    writeJson(`${dir}/${tierName}-screen.json`, {
      method: METHOD_VERSION,
      tier: tierName,
      stage: "screen",
      design: { kind: "latin-hypercube", seed: DESIGN.seed, axes, ranges: { ...DESIGN.shared, ...DESIGN[tierName], initialFlocks: FLOCK_CHOICES } },
      seeds: STAGES.screen.seeds,
      steps: STAGES.screen.steps,
      rows: [...refs, ...candidates],
    });
    // Speckle and the rejected 152 look are settled by the screen; the long
    // stage carries the references a candidate has to beat on lifetime.
    const longRefs = ["ref-current", "ref-scatter", ...(tierName === "desktop" ? [] : ["ref-current-scaled"])];
    writeJson(`${dir}/${tierName}-long.json`, {
      method: METHOD_VERSION,
      tier: tierName,
      stage: "long",
      fromScreen: `docs/sweeps/data/2026-11-13/boids-flow/${tierName}-screen.json`,
      top: LONG_SELECTION[tierName].top,
      topFiner: LONG_SELECTION[tierName].topFiner,
      maxCostRatio: LONG_SELECTION.maxCostRatio,
      finerRatio: LONG_SELECTION.finerRatio,
      seeds: STAGES.long.seeds,
      steps: STAGES.long.steps,
      rows: refs.filter((r) => longRefs.includes(r.id)),
    });
    console.log(`${tierName}: ${refs.length} references + ${candidates.length} candidates`);
  }
}

// ------------------------------------------------------------------ main

if (isMainThread && process.argv[1] && resolve(process.argv[1]) === SCRIPT) {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] ?? "run";
  const commands = { run: commandRun, rescore: commandRescore, time: commandTime, probe: commandProbe, design: commandDesign };
  if (!commands[command]) {
    console.error(`unknown command ${command}; one of ${Object.keys(commands).join(", ")}`);
    process.exit(2);
  }
  Promise.resolve(commands[command](args)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
