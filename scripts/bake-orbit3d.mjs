#!/usr/bin/env node
/**
 * Offline baker for the logistic-Mandelbrot orbit3d point cloud.
 *
 * Reuses the pure sampler compiled by `npm run build:test` and runs the same
 * base-sweep + cascade-tail refinement the live builder uses, but without its
 * time-slicing, warmup ceiling, or point-budget reservoir — plus a second
 * refinement level the browser can't afford. Output is a quantized ELPC
 * binary that Orbit3DPointCloud.applyPrebaked() loads directly.
 *
 * ELPC v1 layout (little-endian, sample-major to match the live layout):
 *   magic "ELPC" u8x4 | version u32 | cellCount u32 | sampleCount u32
 *   positions u16 x 3N (re over [-2,1], im over [-1,1], z over [-2,2])
 *   periods u8 x N | interiors u8 x N | boundaries u8 x N | weights u8 x N
 *
 * Usage:
 *   npm run build:test
 *   node scripts/bake-orbit3d.mjs --points 6e6 --out public/baked/logistic-mandelbrot.elpc
 *
 * Flags: --points (target total), --samples (orbit window, default 64),
 *        --warmup (default 20000), --refine-fraction (default 0.35),
 *        --out (default public/baked/logistic-mandelbrot.elpc)
 */
import { createRequire } from "node:module";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const model = require(join(repoRoot, ".test-build/sims/logistic-mandelbrot/model.js"));

const { RE_MIN, RE_MAX, IM_MIN, IM_MAX, ESCAPED, sampleAttractorCell, cellCoordinate } =
  model;

const SURVIVING_CELL_ESTIMATE = 0.22;
const REFINE_PERIOD_THRESHOLD = 8;
const REFINE_SUBDIVISION = 3;
const SUB_CELLS = REFINE_SUBDIVISION * REFINE_SUBDIVISION;
// Level-2 digs into sub-cells that still look chaotic or deeply periodic.
const REFINE_L2_PERIOD_THRESHOLD = 16;
const REFINE_L1_WEIGHT = 0.15;
const REFINE_L2_WEIGHT = 0.06;
const SUB_SURVIVAL_ESTIMATE = 0.6;

// ---------------------------------------------------------------------------
// Worker: sample a list of (re, im) jobs, return survivors.
// ---------------------------------------------------------------------------
if (!isMainThread) {
  const { jobs, warmup, samples } = workerData;
  const count = jobs.length / 2;
  const orbit = new Float32Array(samples);
  const survivorSamples = new Float32Array(count * samples);
  const survivorMeta = new Float32Array(count * 4); // re, im, period, interior
  const escaped = new Uint8Array(count);
  const measure = { interior: 1 };
  let survivors = 0;
  for (let i = 0; i < count; i += 1) {
    const re = jobs[i * 2];
    const im = jobs[i * 2 + 1];
    const result = sampleAttractorCell(re, im, warmup, samples, orbit, 0, measure);
    if (result === ESCAPED) {
      escaped[i] = 1;
      continue;
    }
    survivorSamples.set(orbit, survivors * samples);
    survivorMeta[survivors * 4] = re;
    survivorMeta[survivors * 4 + 1] = im;
    survivorMeta[survivors * 4 + 2] = result;
    survivorMeta[survivors * 4 + 3] = measure.interior;
    survivors += 1;
  }
  const samplesOut = survivorSamples.slice(0, survivors * samples);
  const metaOut = survivorMeta.slice(0, survivors * 4);
  parentPort.postMessage({ samples: samplesOut, meta: metaOut, escaped }, [
    samplesOut.buffer,
    metaOut.buffer,
    escaped.buffer,
  ]);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main: plan, fan out, refine, quantize, write.
// ---------------------------------------------------------------------------
function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}
function stringFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : fallback;
}

const targetPoints = flag("points", 6_000_000);
const sampleCount = Math.max(8, Math.round(flag("samples", 64)));
const warmup = Math.max(200, Math.round(flag("warmup", 20_000)));
const refineFraction = Math.min(0.6, Math.max(0, flag("refine-fraction", 0.35)));
const outPath = join(
  repoRoot,
  stringFlag("out", "public/baked/logistic-mandelbrot.elpc"),
);
const workerCount = Math.max(1, Math.min(16, os.cpus().length - 2));

function runWorkers(jobs) {
  // jobs: Float64Array of interleaved (re, im). Split evenly across workers.
  const count = jobs.length / 2;
  const perWorker = Math.ceil(count / workerCount);
  const tasks = [];
  for (let w = 0; w < workerCount; w += 1) {
    const start = w * perWorker;
    const end = Math.min(count, start + perWorker);
    if (start >= end) break;
    const slice = jobs.slice(start * 2, end * 2);
    tasks.push(
      new Promise((resolve, reject) => {
        const worker = new Worker(fileURLToPath(import.meta.url), {
          workerData: { jobs: slice, warmup, samples: sampleCount },
          transferList: [slice.buffer],
        });
        worker.once("message", resolve);
        worker.once("error", reject);
      }),
    );
  }
  return Promise.all(tasks);
}

/** Two-pass chamfer distance (grid units) to the nearest escaped cell. */
function chamfer(escapeMask, width, height) {
  const distances = new Float32Array(escapeMask.length);
  const FAR = 1e9;
  const DIAG = Math.SQRT2;
  for (let i = 0; i < escapeMask.length; i += 1) {
    distances[i] = escapeMask[i] === 1 ? 0 : FAR;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      let best = distances[i];
      if (x > 0) best = Math.min(best, distances[i - 1] + 1);
      if (y > 0) {
        best = Math.min(best, distances[i - width] + 1);
        if (x > 0) best = Math.min(best, distances[i - width - 1] + DIAG);
        if (x < width - 1) best = Math.min(best, distances[i - width + 1] + DIAG);
      }
      distances[i] = best;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      let best = distances[i];
      if (x < width - 1) best = Math.min(best, distances[i + 1] + 1);
      if (y < height - 1) {
        best = Math.min(best, distances[i + width] + 1);
        if (x < width - 1) best = Math.min(best, distances[i + width + 1] + DIAG);
        if (x > 0) best = Math.min(best, distances[i + width - 1] + DIAG);
      }
      distances[i] = best;
    }
  }
  return distances;
}

/** Deterministic stride-pick of up to `cap` items from `list` (pairs). */
function stridePick(list, itemSize, cap) {
  const count = list.length / itemSize;
  if (count <= cap) return list;
  const stride = count / cap;
  const out = new Float64Array(cap * itemSize);
  for (let i = 0; i < cap; i += 1) {
    const source = Math.floor(i * stride) * itemSize;
    for (let k = 0; k < itemSize; k += 1) out[i * itemSize + k] = list[source + k];
  }
  return out;
}

function subdivisionJobs(parents, cellW, cellH) {
  const count = parents.length / 2;
  const jobs = new Float64Array(count * SUB_CELLS * 2);
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    const re = parents[i * 2];
    const im = parents[i * 2 + 1];
    for (let sy = 0; sy < REFINE_SUBDIVISION; sy += 1) {
      for (let sx = 0; sx < REFINE_SUBDIVISION; sx += 1) {
        jobs[cursor] = re + ((sx + 0.5) / REFINE_SUBDIVISION - 0.5) * cellW;
        jobs[cursor + 1] = im + ((sy + 0.5) / REFINE_SUBDIVISION - 0.5) * cellH;
        cursor += 2;
      }
    }
  }
  return jobs;
}

function interestingCoords(meta, threshold) {
  const count = meta.length / 4;
  const coords = [];
  for (let i = 0; i < count; i += 1) {
    const period = meta[i * 4 + 2];
    if (period === 0 || period >= threshold) {
      coords.push(meta[i * 4], meta[i * 4 + 1]);
    }
  }
  return Float64Array.from(coords);
}

const started = performance.now();
const basePoints = targetPoints * (1 - refineFraction);
const l1Points = targetPoints * refineFraction * (2 / 3);
const l2Points = targetPoints * refineFraction * (1 / 3);

const baseCellTarget = Math.ceil(basePoints / sampleCount / SURVIVING_CELL_ESTIMATE);
const aspect = (RE_MAX - RE_MIN) / (IM_MAX - IM_MIN);
const gridWidth = Math.round(Math.sqrt(baseCellTarget * aspect));
const gridHeight = Math.ceil(baseCellTarget / gridWidth);
const cellW = (RE_MAX - RE_MIN) / gridWidth;
const cellH = (IM_MAX - IM_MIN) / gridHeight;

console.log(
  `bake: target ${(targetPoints / 1e6).toFixed(1)}M points, ` +
    `${sampleCount} samples/cell, warmup ${warmup}, ` +
    `grid ${gridWidth}x${gridHeight}, ${workerCount} workers`,
);

const baseJobs = new Float64Array(gridWidth * gridHeight * 2);
const midRow = Math.floor(gridHeight / 2);
for (let y = 0; y < gridHeight; y += 1) {
  const im = y === midRow ? 0 : cellCoordinate(IM_MIN, IM_MAX, y, gridHeight);
  for (let x = 0; x < gridWidth; x += 1) {
    const i = y * gridWidth + x;
    baseJobs[i * 2] = cellCoordinate(RE_MIN, RE_MAX, x, gridWidth);
    baseJobs[i * 2 + 1] = im;
  }
}

const baseResults = await runWorkers(baseJobs);
// Reassemble the full escape mask in grid order (workers processed contiguous
// row-major slices, and Promise.all preserves order).
const escapeMask = new Uint8Array(gridWidth * gridHeight);
let maskCursor = 0;
for (const result of baseResults) {
  escapeMask.set(result.escaped, maskCursor);
  maskCursor += result.escaped.length;
}
const baseMeta = baseResults.map((r) => r.meta);
const baseSamples = baseResults.map((r) => r.samples);
const baseSurvivors = baseMeta.reduce((sum, m) => sum + m.length / 4, 0);
console.log(
  `base: ${baseSurvivors.toLocaleString()} surviving cells ` +
    `(${((performance.now() - started) / 1000).toFixed(1)}s)`,
);

// Level-1 refinement: subdivide interesting base cells.
const l1CandidateCap = Math.ceil(l1Points / sampleCount / (SUB_CELLS * SUB_SURVIVAL_ESTIMATE));
const l1Interesting = interestingCoords(
  Float32Array.from(baseMeta.flatMap((m) => Array.from(m))),
  REFINE_PERIOD_THRESHOLD,
);
const l1Parents = stridePick(l1Interesting, 2, l1CandidateCap);
const l1Results = await runWorkers(subdivisionJobs(l1Parents, cellW, cellH));
const l1Survivors = l1Results.reduce((sum, r) => sum + r.meta.length / 4, 0);
console.log(
  `refine L1: ${(l1Parents.length / 2).toLocaleString()} cells -> ` +
    `${l1Survivors.toLocaleString()} sub-cells ` +
    `(${((performance.now() - started) / 1000).toFixed(1)}s)`,
);

// Level-2 refinement: subdivide still-interesting level-1 sub-cells.
const l2CandidateCap = Math.ceil(l2Points / sampleCount / (SUB_CELLS * SUB_SURVIVAL_ESTIMATE));
const l2Interesting = interestingCoords(
  Float32Array.from(l1Results.flatMap((r) => Array.from(r.meta))),
  REFINE_L2_PERIOD_THRESHOLD,
);
const l2Parents = stridePick(l2Interesting, 2, l2CandidateCap);
const l2Results = await runWorkers(
  subdivisionJobs(l2Parents, cellW / REFINE_SUBDIVISION, cellH / REFINE_SUBDIVISION),
);
const l2Survivors = l2Results.reduce((sum, r) => sum + r.meta.length / 4, 0);
console.log(
  `refine L2: ${(l2Parents.length / 2).toLocaleString()} cells -> ` +
    `${l2Survivors.toLocaleString()} sub-cells ` +
    `(${((performance.now() - started) / 1000).toFixed(1)}s)`,
);

// ---------------------------------------------------------------------------
// Assemble sample-major quantized arrays.
// ---------------------------------------------------------------------------
const cellCount = baseSurvivors + l1Survivors + l2Survivors;
const totalPoints = cellCount * sampleCount;
const distances = chamfer(escapeMask, gridWidth, gridHeight);
const cellScale = (cellW + cellH) / 2;

const positions = new Uint16Array(totalPoints * 3);
const periods = new Uint8Array(totalPoints);
const interiors = new Uint8Array(totalPoints);
const boundaries = new Uint8Array(totalPoints);
const weights = new Uint8Array(totalPoints);

const q16 = (value, min, max) =>
  Math.max(0, Math.min(65535, Math.round(((value - min) / (max - min)) * 65535)));
const q8 = (value) => Math.max(0, Math.min(255, Math.round(value * 255)));

let slot = 0;
function appendGroup(metaList, sampleList, weight) {
  for (let group = 0; group < metaList.length; group += 1) {
    const meta = metaList[group];
    const samples = sampleList[group];
    const count = meta.length / 4;
    for (let i = 0; i < count; i += 1) {
      const re = meta[i * 4];
      const im = meta[i * 4 + 1];
      const period = meta[i * 4 + 2];
      const interior = meta[i * 4 + 3];
      const gx = Math.max(
        0,
        Math.min(gridWidth - 1, Math.floor(((re - RE_MIN) / (RE_MAX - RE_MIN)) * gridWidth)),
      );
      const gy = Math.max(
        0,
        Math.min(gridHeight - 1, Math.floor(((im - IM_MIN) / (IM_MAX - IM_MIN)) * gridHeight)),
      );
      const boundary = Math.min(1, distances[gy * gridWidth + gx] * cellScale);
      for (let sample = 0; sample < sampleCount; sample += 1) {
        const index = sample * cellCount + slot;
        positions[index * 3] = q16(re, RE_MIN, RE_MAX);
        positions[index * 3 + 1] = q16(im, IM_MIN, IM_MAX);
        positions[index * 3 + 2] = q16(samples[i * sampleCount + sample], -2, 2);
        periods[index] = Math.min(255, period);
        interiors[index] = q8(interior);
        boundaries[index] = q8(boundary);
        weights[index] = q8(weight);
      }
      slot += 1;
    }
  }
}
appendGroup(baseMeta, baseSamples, 1);
appendGroup(l1Results.map((r) => r.meta), l1Results.map((r) => r.samples), REFINE_L1_WEIGHT);
appendGroup(l2Results.map((r) => r.meta), l2Results.map((r) => r.samples), REFINE_L2_WEIGHT);

const header = new ArrayBuffer(16);
const view = new DataView(header);
view.setUint8(0, 0x45); // E
view.setUint8(1, 0x4c); // L
view.setUint8(2, 0x50); // P
view.setUint8(3, 0x43); // C
view.setUint32(4, 1, true);
view.setUint32(8, cellCount, true);
view.setUint32(12, sampleCount, true);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  Buffer.concat([
    Buffer.from(header),
    Buffer.from(positions.buffer),
    Buffer.from(periods.buffer),
    Buffer.from(interiors.buffer),
    Buffer.from(boundaries.buffer),
    Buffer.from(weights.buffer),
  ]),
);
const bytes = 16 + totalPoints * (6 + 4);
console.log(
  `wrote ${outPath}\n` +
    `  ${cellCount.toLocaleString()} cells x ${sampleCount} samples = ` +
    `${(totalPoints / 1e6).toFixed(1)}M points, ` +
    `${(bytes / 1e6).toFixed(0)}MB, ` +
    `${((performance.now() - started) / 1000).toFixed(1)}s total`,
);
