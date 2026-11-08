// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/152-boids-clump-sweep.md
import { test } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { SWEEP_CONFIGS, expandSweep } from "./harness/sims.ts";
import { encodeGrayscalePng } from "./harness/report.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STAGE = 152;
const contractTest = process.env.SWEEP_CONTRACT === String(STAGE) ? test : test.skip;
const ARTIFACT = `sweep-${STAGE}-boids`;
const DATA = `docs/sweeps/data/2026-11-03/${STAGE}/boids.json`;
const PRESETS = `docs/sweeps/data/2026-11-03/${STAGE}/boids.presets.json`;
const IMAGE_PREFIX = "docs/images/sweeps-2026-11-03/";
const REPORT = "docs/sweeps/boids-interestingness.md";
const AXES: Record<string, number[]> = { maxSpeed: [24, 32, 40], cohesion: [0.01, 0.02, 0.035], initialFlocks: [3, 6, 12] };
const PINNED: Record<string, number | string> = { boidCount: 17777, visualRadius: 36, separationRadius: 6, separation: 0.2, alignment: 0.15, obstacleLayout: "none" };
const STEPS = [300, 600, 1200];
const REFERENCES: Record<string, Record<string, number | string>> = {
  [`${STAGE}-current-balanced-flock`]: { boidCount: 17777, visualRadius: 36, separationRadius: 6, maxSpeed: 16, alignment: 0.06, cohesion: 0.012, separation: 0.2, initialFlocks: 6, obstacleLayout: "none" },
  [`${STAGE}-current-tight-flock`]: { boidCount: 17777, visualRadius: 30, separationRadius: 5, maxSpeed: 20, alignment: 0.1, cohesion: 0.02, separation: 0.16, initialFlocks: 6, obstacleLayout: "none" },
  [`${STAGE}-current-scatter`]: { boidCount: 17777, visualRadius: 24, separationRadius: 10, maxSpeed: 26, alignment: 0.03, cohesion: 0.004, separation: 0.5, initialFlocks: 6, obstacleLayout: "none" },
};
const HISTORICAL_BOIDS_CONFIG_HASHES: Record<string, string> = {
  "sweep-144-boids": "e70f0ad4b4fbbd5ee01df315c6a45105d47d1725784ec4a96f50645941e5deb4",
  boids: "9eb10e40fd4cfa4b34d310c1cd57d38e2d38f6e26ffd2e1767650304774751c7",
};
const METRIC_OPTIONS = { blurRadius: 6, threshold: 0.25, minMassFraction: 0.03 };
const SPEED_CEILING = 40;

type Sample = { clumps: number; headingSpread: number; meanSpeed: number };
const MAIN_SEED = 0;
/** The card's ranking rule, written out so the module and the retained scores are both held to it. */
function expectedScore(samples: Sample[]): number {
  assert.ok(samples.length > 0, "a score needs samples");
  let score = Infinity;
  for (const s of samples) {
    const clumpTerm = Math.min(1, Math.max(0, (s.clumps - 1) / 4));
    const speedTerm = Math.min(1, Math.max(0, s.meanSpeed / SPEED_CEILING));
    score = Math.min(score, clumpTerm * s.headingSpread * speedTerm);
  }
  return score;
}
const near = (actual: number, expected: number, label: string) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} vs ${expected}`);

function blobField(width: number, height: number, blobs: { x: number; y: number; vx: number; vy: number }[], sigma = 4) {
  const density = new Float32Array(width * height);
  const speed = new Float32Array(width * height);
  const vx = new Float32Array(width * height);
  const vy = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = y * width + x;
    let best = 0; let bvx = 0; let bvy = 0;
    for (const b of blobs) {
      const dx = Math.min(Math.abs(x - b.x), width - Math.abs(x - b.x));
      const dy = Math.min(Math.abs(y - b.y), height - Math.abs(y - b.y));
      const d = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      density[i] += d;
      if (d > best) { best = d; bvx = b.vx; bvy = b.vy; }
    }
    if (density[i] > 1e-3) { vx[i] = bvx; vy[i] = bvy; speed[i] = Math.hypot(bvx, bvy); } else { density[i] = 0; }
  }
  return { width, height, density, speed, vx, vy };
}

function text(value: unknown): asserts value is string {
  assert.equal(typeof value, "string");
  assert.ok((value as string).trim().length > 0, "empty string");
}
function finite(value: unknown, label: string): asserts value is number {
  assert.ok(typeof value === "number" && Number.isFinite(value), `${label} must be a finite number`);
}
function params(value: any): void {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  assert.ok(Object.keys(value).length > 0, "empty params");
  for (const v of Object.values(value)) {
    assert.ok(["number", "string", "boolean"].includes(typeof v));
    if (typeof v === "number") assert.ok(Number.isFinite(v));
  }
}
function image(path: string, read: (path: string) => Buffer): void {
  text(path); assert.ok(path.startsWith(IMAGE_PREFIX) && !path.split("/").includes("..") && path.endsWith(".png"), `image path ${path}`);
  const png = read(path);
  assert.ok(png.length > 24, "empty PNG");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "not PNG");
  assert.equal(png.subarray(12, 16).toString(), "IHDR");
  assert.ok(png.readUInt32BE(16) >= 128 && png.readUInt32BE(20) >= 128, "undersized image");
}
function sample(s: any, maxSpeed: number, imageRequired: boolean, read: (path: string) => Buffer): Sample {
  assert.ok(s && typeof s === "object");
  assert.ok(STEPS.includes(s.steps), `unexpected steps ${s.steps}`);
  assert.ok(Number.isInteger(s.seed), "seed recorded");
  finite(s.clumps, "clumps"); assert.ok(Number.isInteger(s.clumps) && s.clumps >= 0);
  finite(s.headingSpread, "headingSpread"); assert.ok(s.headingSpread >= 0 && s.headingSpread <= 1);
  finite(s.speedFraction, "speedFraction"); assert.ok(s.speedFraction >= 0 && s.speedFraction <= 1, "speed channel is a fraction of maxSpeed");
  finite(s.meanSpeed, "meanSpeed"); near(s.meanSpeed, s.speedFraction * maxSpeed, "meanSpeed is the fraction scaled by the row's maxSpeed");
  text(s.stateSha256); assert.match(s.stateSha256, /^[0-9a-f]{64}$/);
  assert.ok(s.viewport && Number.isInteger(s.viewport.width) && Number.isInteger(s.viewport.height), "viewport recorded");
  assert.equal(s.kernelCalls, s.steps, "fixed-step clock");
  if (imageRequired) image(s.image, read); else if (s.image != null) image(s.image, read);
  if (s.artifact != null) text(s.artifact);
  return s;
}
function validate(result: any, sets: Record<string, unknown>[], read: (path: string) => Buffer): void {
  const m = result.manifest;
  assert.equal(m.slug, "boids");
  text(m.methodVersion); assert.ok(m.methodVersion.includes("clump"), "method version names the clump instrument");
  text(m.command); assert.ok(m.command.includes(`sweep ${STAGE} boids`), "wrong sweep command");
  assert.deepEqual(m.canvasCss, { width: 960, height: 600 });
  assert.deepEqual(m.steps, STEPS);
  assert.deepEqual(m.metricOptions, METRIC_OPTIONS);
  assert.ok(Array.isArray(m.priorCoverage) && m.priorCoverage.length > 0);
  for (const prior of m.priorCoverage) {
    text(prior.source); text(prior.description);
    assert.ok(!prior.source.startsWith("/") && !prior.source.split("/").includes(".."));
    assert.ok(read(prior.source).length > 0, "missing prior source");
  }
  assert.ok(Array.isArray(m.candidates) && m.candidates.length === sets.length, "candidate count");
  assert.deepEqual(m.candidates.map((c: any) => c.params), sets, "manifest must follow expanded config order");
  const declared = new Map<string, any>();
  for (const c of m.candidates) { text(c.id); params(c.params); assert.ok(!declared.has(c.id), "duplicate manifest id"); declared.set(c.id, c.params); }
  assert.equal(result.ranked.length, declared.size, "incomplete ranked results");
  assert.ok(Array.isArray(result.references) && result.references.length === Object.keys(REFERENCES).length, "missing references");
  const seen = new Set<string>();
  for (const row of [...result.ranked, ...result.references]) {
    text(row.id); text(row.label); params(row.params);
    assert.ok(!seen.has(row.id), "duplicate result id"); seen.add(row.id);
    assert.equal(row.effectivePopulation, 17777, `${row.id}: shipped population`);
    assert.ok(Array.isArray(row.samples) && row.samples.length === STEPS.length, `${row.id}: three time samples`);
    const isReference = result.references.includes(row);
    finite(row.params.maxSpeed, "maxSpeed");
    const samples = row.samples.map((s: any, i: number) => { const v = sample(s, row.params.maxSpeed, isReference, read); assert.equal(s.steps, STEPS[i], `${row.id}: sample order`); assert.equal(s.seed, MAIN_SEED, `${row.id}: main captures use seed ${MAIN_SEED}`); return v; });
    assert.ok(row.metrics && typeof row.metrics === "object");
    finite(row.metrics.score, "score");
    near(row.metrics.score, expectedScore(samples), `${row.id} score follows the ranking rule`);
  }
  for (const c of result.ranked) { assert.ok(declared.has(c.id)); assert.deepEqual(c.params, declared.get(c.id)); }
  for (let i = 1; i < result.ranked.length; i += 1) assert.ok(result.ranked[i - 1].metrics.score >= result.ranked[i].metrics.score, "ranking order");
  for (const ref of result.references) assert.deepEqual(ref.params, REFERENCES[ref.id], `${ref.id} params`);
  assert.ok(Array.isArray(result.finalists) && result.finalists.length === 3, "exactly three finalists");
  assert.deepEqual(result.finalists.map((f: any) => f.id), result.ranked.slice(0, 3).map((r: any) => r.id), "finalists are the top three ranked");
  for (const f of result.finalists) {
    const row = result.ranked.find((r: any) => r.id === f.id);
    for (const s of row.samples) image(s.image, read);
    assert.ok(Array.isArray(f.repeats) && f.repeats.length >= 3, "three independent repeats");
    const shas = new Set<string>(); const seeds = new Set<number>([MAIN_SEED]);
    for (const r of f.repeats) {
      sample(r, row.params.maxSpeed, true, read); assert.equal(r.steps, 600, "repeats at 600 steps");
      assert.ok(!seeds.has(r.seed), "repeat seeds are distinct from each other and from the main capture"); seeds.add(r.seed);
      shas.add(r.stateSha256);
    }
    assert.equal(shas.size, f.repeats.length, "repeats must be distinct runs");
  }
  const report = read(REPORT).toString();
  assert.ok(report.includes("2026-11-03") && report.includes(`${STAGE}/boids.json`) && report.includes(`${STAGE}/boids.presets.json`), "report does not link current evidence");
}
function fixture(sets: Record<string, unknown>[]): any {
  const candidates = sets.map((p, i) => ({ id: `c${String(i).padStart(2, "0")}`, params: { ...p } }));
  const mk = (steps: number, clumps: number, spread: number, speed: number, maxSpeed: number, tag: string, img: string | null, seed = 0) => ({ steps, seed, kernelCalls: steps, viewport: { width: 960, height: 600 }, clumps, headingSpread: spread, speedFraction: speed / maxSpeed, meanSpeed: speed, stateSha256: createHash("sha256").update(tag).digest("hex"), image: img, artifact: img ? null : `e2e/artifacts/${STAGE}/${tag}.png` });
  const unsorted = candidates.map((c, i) => {
    const maxSpeed = Number(c.params.maxSpeed);
    const samples = STEPS.map((t, k) => mk(t, 5, 0.8, 0.8 * maxSpeed, maxSpeed, `${i}${k}`, null));
    return { ...c, params: { ...c.params }, label: c.id, effectivePopulation: 17777, samples, metrics: { score: expectedScore(samples) } };
  });
  const rows = [...unsorted].sort((a, b) => b.metrics.score - a.metrics.score);
  for (const [i, row] of rows.slice(0, 3).entries()) for (const smp of row.samples) { smp.image = `${IMAGE_PREFIX}f${i}-t${smp.steps}.png`; smp.artifact = null; }
  return {
    manifest: { slug: "boids", methodVersion: "boids-clump-regime-v1-fixture", canvasCss: { width: 960, height: 600 }, steps: STEPS, metricOptions: METRIC_OPTIONS,
      candidates, priorCoverage: [{ source: "e2e/harness/sims.ts", description: "fixture previous coverage" }], command: `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep ${STAGE} boids"` },
    ranked: rows,
    references: Object.entries(REFERENCES).map(([id, p], i) => {
      const maxSpeed = Number(p.maxSpeed);
      const samples = STEPS.map((t, k) => mk(t, 3, 0.5, 0.5 * maxSpeed, maxSpeed, `r${i}${k}`, `${IMAGE_PREFIX}${id}-t${t}.png`));
      return { id, label: id, params: { ...p }, effectivePopulation: 17777, samples, metrics: { score: expectedScore(samples) } };
    }),
    finalists: rows.slice(0, 3).map((row, i) => ({ id: row.id, repeats: [1, 2, 3].map(k => mk(600, 5, 0.8, 0.8 * Number(row.params.maxSpeed), Number(row.params.maxSpeed), `rep${i}${k}`, `${IMAGE_PREFIX}f${i}-rep${k}.png`, k)) })),
  };
}

contractTest(`sweep ${STAGE} contract: the Boids clump config is the declared grid at the shipped population`, () => {
  const cfg = SWEEP_CONFIGS[ARTIFACT];
  assert.ok(cfg, `missing ${ARTIFACT} config`);
  assert.equal(cfg.slug, "boids");
  const sets = expandSweep(cfg);
  assert.equal(sets.length, 27);
  const product: Record<string, unknown>[] = [];
  for (const maxSpeed of AXES.maxSpeed) for (const cohesion of AXES.cohesion) for (const initialFlocks of AXES.initialFlocks) product.push({ ...PINNED, maxSpeed, cohesion, initialFlocks });
  const key = (p: Record<string, unknown>) => JSON.stringify(Object.keys(p).sort().map(k => [k, p[k]]));
  assert.deepEqual(sets.map(key).sort(), product.map(key).sort(), "sets are exactly the declared grid over the pinned base");
  for (const set of sets) {
    assert.equal(Object.hasOwn(set, "pointSize"), false, "point size is the kernel default, not pinned");
    assert.equal(Object.hasOwn(set, "seed"), false, "boids has no seed input");
  }
  assert.deepEqual(cfg.references.map(r => r.id).sort(), Object.keys(REFERENCES).sort());
  for (const ref of cfg.references) assert.deepEqual(ref.params, REFERENCES[ref.id], ref.id);
  for (const [k, hash] of Object.entries(HISTORICAL_BOIDS_CONFIG_HASHES)) {
    assert.equal(createHash("sha256").update(JSON.stringify(SWEEP_CONFIGS[k])).digest("hex"), hash, `${k} config changed`);
  }
});

contractTest(`sweep ${STAGE} contract: the clump instrument counts clumps, reads heading spread and wraps the torus`, async () => {
  const clumps: any = await import("./harness/clumps.ts");
  const W = 64; const H = 64;
  const uniform = { width: W, height: H, density: new Float32Array(W * H).fill(1), speed: new Float32Array(W * H).fill(1), vx: new Float32Array(W * H).fill(1), vy: new Float32Array(W * H) };
  const one = clumps.clumpRegime(uniform, METRIC_OPTIONS);
  assert.equal(one.clumps, 1, "a uniform field is one clump");
  near(one.headingSpread, 0, "uniform heading spread");
  near(one.meanSpeed, 1, "uniform mean speed");
  const two = clumps.clumpRegime(blobField(W, H, [{ x: 16, y: 32, vx: 1, vy: 0 }, { x: 48, y: 32, vx: -1, vy: 0 }]), METRIC_OPTIONS);
  assert.equal(two.clumps, 2, "two separated blobs");
  assert.ok(two.headingSpread > 0.9, `opposite headings spread ${two.headingSpread}`);
  near(two.meanSpeed, 1, "blob mean speed");
  const four = clumps.clumpRegime(blobField(W, H, [16, 48].flatMap(x => [16, 48].map(y => ({ x, y, vx: 0, vy: 2 })))), METRIC_OPTIONS);
  assert.equal(four.clumps, 4, "four separated blobs");
  assert.ok(four.headingSpread < 0.05, `same heading spread ${four.headingSpread}`);
  near(four.meanSpeed, 2, "four-blob mean speed");
  const wrapped = clumps.clumpRegime(blobField(W, H, [{ x: 0, y: 32, vx: 1, vy: 0 }]), METRIC_OPTIONS);
  assert.equal(wrapped.clumps, 1, "a blob across the x edge is one clump on the torus");
  const empty = clumps.clumpRegime({ width: W, height: H, density: new Float32Array(W * H), speed: new Float32Array(W * H), vx: new Float32Array(W * H), vy: new Float32Array(W * H) }, METRIC_OPTIONS);
  assert.equal(empty.clumps, 0); near(empty.headingSpread, 0, "empty spread"); near(empty.meanSpeed, 0, "empty speed");
  for (const [samples, expected] of [
    [[{ clumps: 5, headingSpread: 0.8, meanSpeed: 32 }], 0.64],
    [[{ clumps: 3, headingSpread: 0.5, meanSpeed: 20 }], 0.125],
    [[{ clumps: 5, headingSpread: 0.8, meanSpeed: 32 }, { clumps: 1, headingSpread: 0.9, meanSpeed: 40 }], 0],
    [[{ clumps: 9, headingSpread: 1, meanSpeed: 80 }], 1],
  ] as [Sample[], number][]) {
    near(clumps.clumpScore(samples), expected, "module score");
    near(expectedScore(samples), expected, "reference score");
  }
});

contractTest(`sweep ${STAGE} contract: retained results, images and report`, () => {
  assert.ok(existsSync(resolve(ROOT, DATA)), "missing retained results");
  const cfg = SWEEP_CONFIGS[ARTIFACT]; assert.ok(cfg, "missing config");
  validate(JSON.parse(readFileSync(resolve(ROOT, DATA), "utf8")), expandSweep(cfg), path => readFileSync(resolve(ROOT, path)));
});

contractTest(`sweep ${STAGE} contract: the shortlist is an importable emergence-presets file`, async () => {
  assert.ok(existsSync(resolve(ROOT, PRESETS)), "missing presets file");
  const raw = readFileSync(resolve(ROOT, PRESETS), "utf8");
  const envelope = JSON.parse(raw);
  assert.equal(envelope.format, "emergence-presets"); assert.equal(envelope.version, 1);
  assert.ok(Array.isArray(envelope.presets) && envelope.presets.length >= 3 && envelope.presets.length <= 9, "shortlist of three to nine");
  const retained = JSON.parse(readFileSync(resolve(ROOT, DATA), "utf8"));
  const ids = new Set<string>(); const names = new Set<string>();
  for (const entry of envelope.presets) {
    text(entry.id); assert.ok(entry.id.startsWith(`boids-${STAGE}-`), "id prefix"); assert.ok(!ids.has(entry.id), "duplicate id"); ids.add(entry.id);
    text(entry.name); assert.ok(entry.name.length <= 64); assert.ok(!names.has(entry.name.toLowerCase()), "duplicate name"); names.add(entry.name.toLowerCase());
    assert.equal(entry.snapshot.slug, "boids");
    assert.equal(entry.snapshot.customObstacles, undefined);
    assert.equal(entry.snapshot.params.obstacleLayout, "none");
    const row = retained.ranked.find((r: any) => entry.id === `boids-${STAGE}-${r.id}`);
    assert.ok(row, `${entry.id} is not a ranked candidate`);
    for (const [k, v] of Object.entries(row.params)) assert.deepEqual(entry.snapshot.params[k], v, `${entry.id} ${k}`);
  }
  for (const f of retained.finalists) assert.ok(ids.has(`boids-${STAGE}-${f.id}`), `finalist ${f.id} missing from the shortlist`);
  const require = createRequire(import.meta.url);
  const { PresetValidator } = require("../.test-build/app/savedPresets.js");
  const { BoidsKernel } = require("../.test-build/sims/boids/kernel.js");
  const validator = new PresetValidator([{ slug: "boids", load: async () => new BoidsKernel() }]);
  const accepted = await validator.backup(raw, true);
  assert.equal(accepted.length, envelope.presets.length, "the real validator accepts every entry");
});

contractTest(`sweep ${STAGE} contract: production source untouched and the evidence validator has teeth`, () => {
  assert.equal(execFileSync("git", ["status", "--porcelain", "--", "src"], { cwd: ROOT }).toString().trim(), "", "src must be clean");
  const base = execFileSync("git", ["merge-base", "HEAD", "dev"], { cwd: ROOT }).toString().trim();
  const tree = (rev: string) => execFileSync("git", ["rev-parse", `${rev}:src`], { cwd: ROOT }).toString().trim();
  assert.equal(tree("HEAD"), tree(base), "src differs from the branch point on dev");
  const cfg = SWEEP_CONFIGS[ARTIFACT];
  const sets = cfg ? expandSweep(cfg) : Array.from({ length: 27 }, (_, i) => ({ ...PINNED, maxSpeed: 24 + (i % 3) * 8, cohesion: 0.01, initialFlocks: 3 }));
  const png = encodeGrayscalePng(new Float32Array(128 * 128), 128, 128, 1);
  const read = (path: string) => path.endsWith(".png") ? png : Buffer.from(`2026-11-03 ${STAGE}/boids.json ${STAGE}/boids.presets.json ` + "fixture ".repeat(60));
  validate(fixture(sets), sets, read);
  for (const mutate of [
    (r: any) => { r.ranked.pop(); },
    (r: any) => { r.ranked[0].metrics.score = NaN; },
    (r: any) => { r.ranked[0].metrics.score = 0.9; },
    (r: any) => { r.ranked[0].samples[1].clumps = 1; },
    (r: any) => { r.ranked[1].params.maxSpeed = 99; },
    (r: any) => { r.references.pop(); },
    (r: any) => { r.references[0].params.maxSpeed = 17; },
    (r: any) => { r.ranked[0].effectivePopulation = 2500; },
    (r: any) => { r.finalists[0].repeats.pop(); },
    (r: any) => { r.finalists[0].repeats[1].stateSha256 = r.finalists[0].repeats[0].stateSha256; },
    (r: any) => { r.finalists[0].repeats[1].seed = r.finalists[0].repeats[0].seed; },
    (r: any) => { r.finalists[0].repeats[0].seed = 0; },
    (r: any) => { r.finalists[0].repeats[0].image = null; },
    (r: any) => { r.finalists.pop(); },
    (r: any) => { r.finalists[2].id = r.ranked[5].id; },
    (r: any) => { r.ranked[4].samples[0].seed = 7; },
    (r: any) => { r.ranked[4].samples[0].meanSpeed = 5; },
    (r: any) => { r.ranked[0].samples[0].image = "e2e/artifacts/elsewhere.png"; },
    (r: any) => { r.manifest.candidates[1].id = r.manifest.candidates[0].id; },
    (r: any) => { r.manifest.steps = [300, 600]; },
  ]) { const bad = fixture(sets); mutate(bad); assert.throws(() => validate(bad, sets, read), "mutation should fail validation"); }
  assert.throws(() => validate(fixture(sets), sets, path => path.endsWith(".png") ? Buffer.from("invalid") : read(path)));
});
// AUTOMETTA-CONTRACT-END
