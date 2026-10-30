// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/142-lorenz-unexplored-regimes.md
import { test } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { SWEEP_CONFIGS, expandSweep } from "./harness/sims.ts";
import * as metrics from "./harness/metrics.ts";
import { encodeGrayscalePng } from "./harness/report.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STAGE = 142;
const contractTest = process.env.SWEEP_CONTRACT === String(STAGE) ? test : test.skip;
const SLUGS = ["lorenz-attractor"];
const MIN = 64;
const MAX = 88;
const HISTORICAL_KEYS = ["gray-scott", "boids", "lorenz-attractor", "clifford-dejong-clifford", "clifford-dejong-dejong", "clifford-dejong-svensson", "lenia", "belousov-zhabotinsky", "belousov-zhabotinsky-diffusion", "physarum", "swarmalators", "abelian-sandpile", "brians-brain", "cyclic-ca", "game-of-life", "ising-model", "diffusion-limited-aggregation", "kuramoto-oscillators", "particle-life"];
const imagePrefix = "docs/images/sweeps-2026-10-30/";
const dataPath = (slug: string) => `docs/sweeps/data/2026-10-30/${STAGE}/${slug}.json`;
const reportPath = (slug: string) => `docs/sweeps/${slug}-interestingness.md`;
function text(value: unknown): asserts value is string {
  assert.equal(typeof value, "string");
  assert.ok((value as string).trim().length > 0, "empty string");
}
function params(value: any): void {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  assert.ok(Object.keys(value).length > 0, "empty params");
  for (const v of Object.values(value)) {
    assert.ok(["number", "string", "boolean"].includes(typeof v));
    if (typeof v === "number") assert.ok(Number.isFinite(v));
  }
}
function validate(result: any, slug: string, read: (path: string) => Buffer): void {
  const m = result.manifest;
  assert.equal(m.slug, slug);
  text(m.methodVersion); text(m.command);
  assert.ok(m.command.includes(`sweep ${STAGE} `), "wrong sweep command");
  for (const n of [m.grid.width, m.grid.height]) assert.ok(Number.isInteger(n) && n >= 32);
  for (const n of [m.warmupSteps, m.fluxGap]) assert.ok(Number.isInteger(n) && n >= 0);
  assert.ok(Number.isFinite(m.dt) && m.dt > 0);
  assert.ok(Array.isArray(m.priorCoverage) && m.priorCoverage.length > 0);
  for (const prior of m.priorCoverage) {
    text(prior.source); text(prior.description);
    assert.ok(!prior.source.startsWith("/") && !prior.source.split("/").includes(".."));
    assert.ok(read(prior.source).length > 0, "missing prior source");
  }
  assert.ok(Array.isArray(m.candidates) && m.candidates.length >= MIN && m.candidates.length <= MAX, "candidate allowance");
  const declared = new Map<string, any>();
  for (const c of m.candidates) {
    text(c.id); params(c.params);
    assert.ok(!declared.has(c.id), "duplicate manifest id"); declared.set(c.id, c.params);
  }
  assert.equal(result.ranked.length, declared.size, "incomplete ranked results");
  assert.ok(Array.isArray(result.references) && result.references.length > 0, "missing references");
  const seen = new Set<string>();
  for (const c of [...result.ranked, ...result.references]) {
    text(c.id); text(c.label); params(c.params);
    assert.ok(!seen.has(c.id), "duplicate result id"); seen.add(c.id);
    assert.ok(c.metrics && typeof c.metrics === "object");
    assert.ok(typeof c.metrics.score === "number" && Number.isFinite(c.metrics.score));
    assert.ok(Object.keys(c.metrics).length >= 2, "score alone is inadequate evidence");
    for (const value of Object.values(c.metrics)) if (typeof value === "number") assert.ok(Number.isFinite(value));
  }
  for (const c of result.ranked) { assert.ok(declared.has(c.id)); assert.deepEqual(c.params, declared.get(c.id)); }
  for (let i = 1; i < result.ranked.length; i++) assert.ok(result.ranked[i - 1].metrics.score >= result.ranked[i].metrics.score, "ranking order");
  assert.ok(Array.isArray(result.finalists) && result.finalists.length >= 1 && result.finalists.length <= 3, "missing selected evidence");
  const selected = new Set<string>();
  function image(path: string): void {
    text(path); assert.ok(path.startsWith(imagePrefix) && !path.split("/").includes("..") && path.endsWith(".png"));
    const png = read(path);
    assert.ok(png.length > 24, "empty PNG");
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "not PNG");
    assert.equal(png.subarray(12, 16).toString(), "IHDR");
    assert.ok(png.readUInt32BE(16) >= 128 && png.readUInt32BE(20) >= 128, "undersized image");
  }
  for (const c of result.finalists) {
    assert.ok(declared.has(c.id) && !selected.has(c.id), "invalid finalist id"); selected.add(c.id);
    assert.ok(Array.isArray(c.images) && c.images.length >= 3, "dynamic evidence needs three frames");
    assert.equal(new Set(c.images).size, c.images.length, "duplicate frame path"); c.images.forEach(image);
  }
  for (const ref of result.references) image(ref.thumb);
  const report = read(reportPath(slug)).toString();
  assert.ok(report.includes("2026-10-30") && report.includes(`${STAGE}/${slug}.json`), "report does not link current evidence");
  assert.ok(report.length > 300, "missing substantive report");
}
function fixture(slug: string): any {
  const candidates = Array.from({ length: MIN }, (_, i) => ({ id: `candidate-${i}`, params: { value: i } }));
  return {
    manifest: { slug, methodVersion: "fixture-v1", grid: { width: 128, height: 128 }, warmupSteps: 128, fluxGap: 4, dt: 1,
      candidates, priorCoverage: [{ source: "e2e/harness/sims.ts", description: "fixture previous coverage" }], command: `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep ${STAGE} "` },
    ranked: candidates.map(c => ({ ...c, params: { ...c.params }, label: c.id, metrics: { score: 0.5, entropy: 0.2 } })),
    references: [{ id: "reference", label: "Current reference", params: { value: 0 }, metrics: { score: 0.4, entropy: 0.1 }, thumb: `${imagePrefix}reference.png` }],
    finalists: [{ id: candidates[0].id, images: [0, 1, 2].map(i => `${imagePrefix}candidate-${i}.png`) }],
  };
}

contractTest(`sweep ${STAGE} contract: new configs exist and match retained manifests`, () => {
  for (const slug of SLUGS) {
    const matching = Object.values(SWEEP_CONFIGS).filter(c => c.slug === slug && c.artifactId === `sweep-${STAGE}-${slug}`);
    assert.equal(matching.length, 1, `missing unique sweep-${STAGE}-${slug} config`);
    const cfg = matching[0]; const sets = expandSweep(cfg);
    assert.ok(sets.length >= MIN && sets.length <= MAX);
    assert.ok(existsSync(resolve(ROOT, dataPath(slug))), "missing retained results");
    const r = JSON.parse(readFileSync(resolve(ROOT, dataPath(slug)), "utf8"));
    assert.deepEqual(r.manifest.candidates.map((c: any) => c.params), sets, "manifest must follow expanded config order");
    assert.deepEqual(r.manifest.grid, { width: cfg.gridWidth, height: cfg.gridHeight });
    assert.equal(r.manifest.warmupSteps, cfg.warmupSteps); assert.equal(r.manifest.fluxGap, cfg.fluxGap); assert.equal(r.manifest.dt, cfg.dt);
    assert.equal(r.references.length, cfg.references.length);
    for (const ref of cfg.references) {
      const actual = r.references.find((x: any) => x.id === ref.id); assert.ok(actual); assert.deepEqual(actual.params, ref.params);
    }
    assert.ok(cfg.multiSnapshot && cfg.multiSnapshot.warmupSteps.length >= 5, "Lorenz requires five snapshots");
    for (const c of r.ranked) assert.ok(c.metrics.sampleCount >= 5 && c.metrics.spread?.score, "missing multi-snapshot spread");
  }
});
contractTest(`sweep ${STAGE} contract: complete report and image evidence`, () => {
  for (const slug of SLUGS) {
    assert.ok(existsSync(resolve(ROOT, dataPath(slug))), "missing retained results");
    validate(JSON.parse(readFileSync(resolve(ROOT, dataPath(slug)), "utf8")), slug, path => readFileSync(resolve(ROOT, path)));
  }
});
contractTest(`sweep ${STAGE} contract: protected source and historical configs unchanged`, () => {
  assert.equal(execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", "src"], { cwd: ROOT }).toString().trim(), "", "new production source is out of scope");
  const files = execFileSync("git", ["ls-files", "-z", "--", "src", "scripts/git-hooks/pre-push", "scripts/publish-sync.sh"], { cwd: ROOT }).toString().split("\0").filter(Boolean).sort();
  const hash = createHash("sha256");
  for (const path of files) hash.update(path).update("\0").update(readFileSync(resolve(ROOT, path))).update("\0");
  assert.equal(hash.digest("hex"), "b07b3867e129dfb1c64e6f85a8da54863ff2aa3a194ea0a55dec013b2447cf71", "production source or protected scripts changed");
  const historical = Object.fromEntries(HISTORICAL_KEYS.map(k => [k, SWEEP_CONFIGS[k]]));
  assert.equal(createHash("sha256").update(JSON.stringify(historical)).digest("hex"), "edfe7b93e982768fe779ae462e7b3319a958af3e86e3fa6f7a9770064951a33f", "historical configs changed");
  const field = [0,0,1,1,0,0,1,1,0,0,1,1,0,0,1,1];
  assert.deepEqual(metrics.scoreFrames(field, Array(16).fill(0), 4, 4, 0.1), {
    entropy: 0.2, variance: 0.25, spatialAutocorrelation: 0.6666666666666666, coverage: 0.5, temporalFlux: 0.5, score: 0.4566666666666667,
  });
});
contractTest(`sweep ${STAGE} contract: evidence validator positive and negative controls`, () => {
  const slug = SLUGS[0];
  const png = encodeGrayscalePng(new Float32Array(128 * 128), 128, 128, 1);
  const read = (path: string) => path.endsWith(".png") ? png : Buffer.from(`2026-10-30 ${STAGE}/${slug}.json ` + "fixture ".repeat(60));
  validate(fixture(slug), slug, read);
  for (const mutate of [
    (r: any) => { r.ranked.pop(); },
    (r: any) => { r.ranked[0].metrics.score = NaN; },
    (r: any) => { r.ranked[0].params.value = -1; },
    (r: any) => { r.references = []; },
    (r: any) => { r.finalists[0].images = []; },
    (r: any) => { r.manifest.candidates[1].id = r.manifest.candidates[0].id; },
  ]) { const bad = fixture(slug); mutate(bad); assert.throws(() => validate(bad, slug, read)); }
  assert.throws(() => validate(fixture(slug), slug, path => path.endsWith(".png") ? Buffer.from("invalid") : read(path)));
});

// AUTOMETTA-CONTRACT-END
