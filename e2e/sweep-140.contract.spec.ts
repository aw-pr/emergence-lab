// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/140-markus-sign-mix-sweep.md
import { test, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as metrics from "./harness/metrics.ts";
import { SWEEP_CONFIGS, expandSweep } from "./harness/sims.ts";
import { encodeGrayscalePng } from "./harness/report.ts";

const contractTest = process.env.SWEEP_CONTRACT === "140" ? test : test.skip;
const SLUG = "markus-lyapunov";
const ARTIFACT = "sweep-140-markus-lyapunov";
const DATA = "docs/sweeps/data/2026-10-30/140/markus-lyapunov.json";
const REPORT = "docs/sweeps/markus-lyapunov-interestingness.md";
const METHOD = "lyapunov-sign-v1";
const BASE = "14029cefb4f52f058705e68835d16213c2efb332";
const OLD_CONFIG_HASHES = {
  "gray-scott": "4b25a548c0ea63d4c4a8eac321bfba7349d97a69b2b2b45fa4cc69b50c23b5c3",
  "boids": "9eb10e40fd4cfa4b34d310c1cd57d38e2d38f6e26ffd2e1767650304774751c7",
  "lorenz-attractor": "5cbd34da3c7a92f2ef275052b281155e128183c7d0bfcf08b3cd504f6f7df605",
  "clifford-dejong-clifford": "57db11fb7192a31e5fcd6df6d62977440a5c30bc50fb1c7157bf5142a1f67190",
  "clifford-dejong-dejong": "9b2162aa8a4586a7bebb1157d2bad51e8a258ba8cde7d5a77eec71e648435a39",
  "clifford-dejong-svensson": "9f0034c0e04fae5dd8b4f2c50a5694190fe4dfc400d3bfeae950b261dfbde084",
  "lenia": "5a1fe7950c99aed8cad8afa18926552ff26765f5e6cd0fd7bc19dd485cdd38eb",
  "belousov-zhabotinsky": "16aa4207e5b7d8512027aa1f0a360b9ae77d5f15e639927c3a3a8f856563fcbc",
  "belousov-zhabotinsky-diffusion": "0a2c95a29469548c84f19e449eda61797c2c0a038869700e65c6956df67b0b51",
  "physarum": "dd1e8d76eac5e8811172be703a9bbd3eb45cfb2ffef683c16141058e786f0def",
  "swarmalators": "9c69a0d59e83b61601054af79ea1097e945465270f9dc991448ab94c3feca2f7",
  "abelian-sandpile": "441c40cc8990b0efcb9c72364c23e5b5a1a10733c8171ca67e4e543dadec6587",
  "brians-brain": "f474c472ee4e5608fe76870d12413b8e964374ba8e57943d7961e4ca7d230465",
  "cyclic-ca": "81804094cb09f141865322c4b0ff3a0fbfdab455926a8748183a5d1fbf58ac12",
  "game-of-life": "3502789b9dc8d86188c30ad2628163f7385b1cd1167e5567fd1ad86b3dbcc558",
  "ising-model": "219cda0401ae330ee9599b6ac5fa1d4db48dd6358c0aff1e55b0458453bb63d5",
  "diffusion-limited-aggregation": "0b98338f11cd44aa72e3055b3f0728718a45b6bafd06ef1d82f2fb1768d5eaf6",
  "kuramoto-oscillators": "3fedc5ebc415c3e35da6ca0895d30ecef6591f23ca0cbd6ea10c5fa20b6142ef",
  "particle-life": "32de9f79da2c28b16a6b422228715f446751ff251f84640f19e82bbe6542236a"
};
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const params = (p: any) => p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).length > 0 && Object.values(p).every(v => typeof v === "string" || typeof v === "boolean" || finite(v));

function checkEvidence(d: any, image: (path: string) => Buffer): void {
  assert.equal(d.manifest?.slug, SLUG, "manifest slug");
  assert.equal(d.manifest.methodVersion, METHOD, "method version");
  assert.ok(Number.isInteger(d.manifest.grid?.width) && d.manifest.grid.width >= 128, "grid width");
  assert.ok(Number.isInteger(d.manifest.grid?.height) && d.manifest.grid.height >= 128, "grid height");
  for (const key of ["warmupSteps", "fluxGap"]) assert.ok(Number.isInteger(d.manifest[key]) && d.manifest[key] >= 0, key);
  assert.ok(finite(d.manifest.dt) && d.manifest.dt > 0, "dt");
  assert.ok(typeof d.manifest.command === "string" && d.manifest.command.includes("sweep 140 "), "reproduction command");
  assert.ok(Array.isArray(d.manifest.priorCoverage) && d.manifest.priorCoverage.length > 0, "coverage provenance");
  for (const old of d.manifest.priorCoverage) {
    assert.ok(typeof old.source === "string" && old.source.length > 0 && !old.source.startsWith("/"), "coverage source");
    assert.ok(typeof old.description === "string" && old.description.length > 0, "coverage description");
  }
  assert.ok(Array.isArray(d.ranked) && d.ranked.length >= 48 && d.ranked.length <= 72, "candidate count");
  assert.ok(Array.isArray(d.references) && d.references.length > 0, "current references");
  assert.equal(d.manifest.candidates?.length, d.ranked.length, "manifest count");
  const planned = new Map(d.manifest.candidates.map((c: any) => [c.id, c.params]));
  assert.equal(planned.size, d.ranked.length, "duplicate planned IDs");
  const ids = new Set<string>();
  for (const c of [...d.ranked, ...d.references]) {
    assert.ok(typeof c.id === "string" && c.id.length > 0 && !ids.has(c.id), "unique candidate/reference ID");
    ids.add(c.id);
    assert.ok(typeof c.label === "string" && c.label.length > 0 && params(c.params), "candidate params/label");
    assert.ok(c.metrics && Object.keys(c.metrics).length > 0, "metrics required");
    assert.ok(Object.values(c.metrics).every(finite), "finite numeric metrics");
    assert.ok(finite(c.metrics.score) && c.metrics.score >= 0 && c.metrics.score <= 1, "score bounds");
    for (const key of ["stableFraction", "chaoticFraction", "zeroFraction", "signMix", "boundaryDensity"]) {
      assert.ok(finite(c.metrics[key]) && c.metrics[key] >= 0 && c.metrics[key] <= 1, "metric " + key);
    }
    assert.equal(c.params.rotationSpeed, 0, "no rotation in sign score");
  }
  for (let i = 0; i < d.ranked.length; i++) {
    assert.deepEqual(d.ranked[i].params, planned.get(d.ranked[i].id), "manifest/result parameters");
    if (i) assert.ok(d.ranked[i - 1].metrics.score >= d.ranked[i].metrics.score, "descending ranking");
  }
  assert.ok(Array.isArray(d.finalists) && d.finalists.length >= 1 && d.finalists.length <= 3, "1–3 evidence finalists, not compulsory promotions");
  assert.equal(new Set(d.finalists.map((x: any) => x.id)).size, d.finalists.length, "unique finalists");
  for (const f of d.finalists) {
    assert.ok(d.ranked.some((c: any) => c.id === f.id), "finalist in measured candidates");
    assert.ok(Array.isArray(f.images) && f.images.length >= 2, "candidate and reference image evidence");
    assert.equal(new Set(f.images).size, f.images.length, "distinct image paths");
    for (const path of f.images) {
      assert.ok(typeof path === "string" && path.startsWith("docs/images/sweeps-2026-10-30/") && !path.split("/").includes("..") && path.endsWith(".png"), "portable image path");
      const png = image(path);
      assert.ok(png.length > 32 && png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), "PNG signature");
      assert.equal(png.toString("ascii", 12, 16), "IHDR", "PNG IHDR");
      assert.ok(png.readUInt32BE(16) >= 128 && png.readUInt32BE(20) >= 128, "evidence image dimensions");
    }
  }
}

function fixture(): any {
  const p = {"centerX": 3, "centerY": 3, "zoom": 1, "sequence": "AB", "rotationSpeed": 0};
  const m = {"score": 0.5, "stableFraction": 0.5, "chaoticFraction": 0.5, "zeroFraction": 0.5, "signMix": 0.5, "boundaryDensity": 0.5};
  const ranked = Array.from({length:48}, (_, i) => ({id:"c"+i,label:"candidate "+i,params:{...p,centerX:i/100},metrics:{...m}}));
  return {manifest:{slug:SLUG,methodVersion:METHOD,grid:{width:128,height:128},warmupSteps:0,fluxGap:0,dt:1,command:'SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 140 "',priorCoverage:[{source:"e2e/harness/sims.ts",description:"No previous configuration"}],candidates:ranked.map(c=>({id:c.id,params:c.params}))},ranked,references:[{id:"ref",label:"Current reference",params:p,metrics:m}],finalists:[{id:"c0",images:["docs/images/sweeps-2026-10-30/candidate.png","docs/images/sweeps-2026-10-30/reference.png"]}]};
}

contractTest("140 evidence checker accepts its bounded fixture and rejects corrupt evidence", () => {
  const png = Buffer.from(encodeGrayscalePng(new Float32Array(128*128),128,128,1));
  const read = () => png;
  assert.doesNotThrow(() => checkEvidence(fixture(), read));
  for (const mutate of [
    (d: any) => d.ranked.pop(),
    (d: any) => d.ranked[0].metrics.score = NaN,
    (d: any) => d.manifest.candidates[0].params = {wrong:1},
    (d: any) => d.references = [],
    (d: any) => d.finalists[0].id = "unmeasured",
    (d: any) => d.finalists[0].images = [],
    (d: any) => d.manifest.methodVersion = "ca-score",
  ]) { const d = fixture(); mutate(d); assert.throws(() => checkEvidence(d, read)); }
  assert.throws(() => checkEvidence(fixture(), () => Buffer.from("not a PNG")));
});

contractTest("140 preserves production, protected scripts and historical scoring/configs", () => {
  const protectedPaths = ["src", "scripts/git-hooks/pre-push", "scripts/publish-sync.sh", ".autometta.local.yaml"];
  expect(execFileSync("git", ["diff", "--name-only", BASE, "--", ...protectedPaths], {encoding:"utf8"})).toBe("");
  expect(execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", "src"], {encoding:"utf8"})).toBe("");
  for (const [key, expected] of Object.entries(OLD_CONFIG_HASHES)) expect(sha(JSON.stringify(SWEEP_CONFIGS[key])), key).toBe(expected);
  expect(metrics.scoreFrames([0,0,1,1],[0,1,1,0],2,2,.1)).toEqual({entropy:.2,variance:.25,spatialAutocorrelation:0,coverage:.5,temporalFlux:.5,score:.09000000000000001});
});

contractTest("140 new config and retained sweep evidence are complete", () => {
  const config = Object.values(SWEEP_CONFIGS).find(c => c.artifactId === ARTIFACT);
  expect(config, "missing additive " + ARTIFACT + " config").toBeDefined();
  assert.equal(config!.slug, SLUG);
  const sets = expandSweep(config!);
  assert.ok(sets.length >= 48 && sets.length <= 72, "config candidate count");
  assert.ok(existsSync(DATA), "retained result JSON missing");
  const d = JSON.parse(readFileSync(DATA,"utf8"));
  checkEvidence(d, p => readFileSync(p));
  const canonical = (p: any) => JSON.stringify(Object.fromEntries(Object.entries(p).sort(([a],[b])=>a.localeCompare(b))));
  expect(d.ranked.map((c:any) => canonical(c.params)).sort()).toEqual(sets.map(canonical).sort());
  for (const key of ["gridWidth", "gridHeight", "warmupSteps", "fluxGap", "dt"] as const) {
    const actual = key === "gridWidth" ? d.manifest.grid.width : key === "gridHeight" ? d.manifest.grid.height : d.manifest[key];
    expect(actual, key).toBe(config![key]);
  }
  for (const ref of config!.references) assert.ok(d.references.some((r:any)=>r.id===ref.id && canonical(r.params)===canonical(ref.params)), "missing configured reference " + ref.id);
  const report = readFileSync(REPORT,"utf8");
  assert.ok(report.includes("140/"+SLUG+".json"), "report must link retained data");
  for (const f of d.finalists) for (const path of f.images) assert.ok(report.includes(path.replace("docs/images/", "../images/")) || report.includes(path), "report must link image");
  
});

contractTest("140 sign metrics retain both signs and reject noise-only mixing", () => {
  const fn=(metrics as any).lyapunovSignMetrics;
  expect(typeof fn,"lyapunovSignMetrics export is required").toBe("function");
  const w=8,h=8,z=new Array(64).fill(0),one=z.map(()=>1);
  const split=z.map((_,i)=>i%w<4?1:0),other=split.map(v=>1-v);
  const checker=z.map((_,i)=>(i%w+Math.floor(i/w))%2),inverse=checker.map(v=>1-v);
  const empty=fn(z,z,w,h),stable=fn(one,z,w,h),chaotic=fn(z,one,w,h),mixed=fn(split,other,w,h),noise=fn(checker,inverse,w,h);
  for(const v of [empty,stable,chaotic,mixed,noise]) for(const k of ["stableFraction","chaoticFraction","zeroFraction","signMix","boundaryDensity","score"]) expect(finite(v[k])&&v[k]>=0&&v[k]<=1,k).toBe(true);
  expect(empty.zeroFraction).toBe(1); expect(empty.signMix).toBe(0); expect(empty.score).toBe(0);
  expect(stable.stableFraction).toBe(1); expect(stable.chaoticFraction).toBe(0); expect(stable.signMix).toBe(0); expect(stable.score).toBe(0);
  expect(chaotic.chaoticFraction).toBe(1); expect(chaotic.stableFraction).toBe(0); expect(chaotic.score).toBe(0);
  expect(mixed.stableFraction).toBe(.5); expect(mixed.chaoticFraction).toBe(.5); expect(mixed.zeroFraction).toBe(0); expect(mixed.signMix).toBe(1);
  expect(mixed.boundaryDensity).toBeCloseTo(1/14,12);
  expect(noise.boundaryDensity).toBe(1); expect(noise.signMix).toBe(1);
  expect(mixed.score).toBeGreaterThan(0); expect(mixed.score).toBeGreaterThan(noise.score);
});
// AUTOMETTA-CONTRACT-END
