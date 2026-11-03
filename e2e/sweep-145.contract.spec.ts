import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SWEEP_CONFIGS } from "./harness/sims.ts";
import { scoreFrames } from "./harness/metrics.ts";

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/145-phase-missed-regimes.md
const STAGE = 145;
const contractTest = process.env.SWEEP_CONTRACT === String(STAGE) ? test : test.skip;
const SLUGS = ["kuramoto-oscillators"]; // Swarmalators deferred by operator decision 2026-11-03 (re-brief 2); its pilot evidence stays retained
const MINIMUM = 64;
const MAXIMUM = 80;
const OLD_KEYS = ["gray-scott", "boids", "lorenz-attractor", "clifford-dejong-clifford", "clifford-dejong-dejong", "clifford-dejong-svensson", "lenia", "belousov-zhabotinsky", "belousov-zhabotinsky-diffusion", "physarum", "swarmalators", "abelian-sandpile", "brians-brain", "cyclic-ca", "game-of-life", "ising-model", "diffusion-limited-aggregation", "kuramoto-oscillators", "particle-life"];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: sweep ${STAGE}: ${message}`);
}
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function nonempty(value: any): boolean { return typeof value === "string" && value.trim().length > 0; }
function finiteTree(v: any): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (v && typeof v === "object") return Object.values(v).every(finiteTree);
  return true;
}
function params(value: any): boolean {
  return value && !Array.isArray(value) && typeof value === "object" && Object.keys(value).length > 0
    && Object.values(value).every(v => typeof v === "boolean" || (typeof v === "string" && v.length > 0) || (typeof v === "number" && Number.isFinite(v)));
}
function record(value: any, slug: string): void {
  const m = value?.manifest;
  check(m?.slug === slug && nonempty(m.methodVersion), `${slug}: manifest identity/method`);
  check(Number.isInteger(m.grid?.width) && m.grid.width >= 16 && Number.isInteger(m.grid?.height) && m.grid.height >= 16, `${slug}: grid`);
  check(Number.isInteger(m.warmupSteps) && m.warmupSteps >= 0 && Number.isInteger(m.fluxGap) && m.fluxGap >= 0 && Number.isFinite(m.dt) && m.dt > 0, `${slug}: timing`);
  check(nonempty(m.command) && m.command.includes(`sweep ${STAGE} `), `${slug}: reproduction command`);
  check(Array.isArray(m.priorCoverage) && m.priorCoverage.length > 0 && m.priorCoverage.every((p: any) => nonempty(p.source) && nonempty(p.description)), `${slug}: prior coverage citations`);
  check(Array.isArray(m.candidates) && m.candidates.length >= MINIMUM && m.candidates.length <= MAXIMUM, `${slug}: candidate count ${MINIMUM}..${MAXIMUM}`);
  check(m.candidates.every((c: any) => nonempty(c.id) && params(c.params)), `${slug}: candidate identity/params`);
  check(new Set(m.candidates.map((c: any) => c.id)).size === m.candidates.length, `${slug}: duplicate candidate id`);
  check(new Set(m.candidates.map((c: any) => canonical(c.params))).size === m.candidates.length, `${slug}: duplicate candidate parameters`);
  check(Array.isArray(value.ranked) && value.ranked.length === m.candidates.length, `${slug}: missing ranked candidates`);
  check(Array.isArray(value.references) && value.references.length > 0, `${slug}: missing references`);
  const ids = new Set<string>();
  for (const c of [...value.ranked, ...value.references]) {
    check(nonempty(c.id) && !ids.has(c.id) && nonempty(c.label) && params(c.params), `${slug}: result identity/params`); ids.add(c.id);
    check(c.metrics && Number.isFinite(c.metrics.score) && finiteTree(c.metrics), `${slug}: non-finite score/metric`);
  }
  check(value.ranked.every((c: any, i: number, a: any[]) => i === 0 || a[i - 1].metrics.score >= c.metrics.score), `${slug}: rank order`);
  const byId = new Map(value.ranked.map((c: any) => [c.id, c]));
  check(m.candidates.every((c: any) => canonical((byId.get(c.id) as any)?.params) === canonical(c.params)), `${slug}: manifest/result mismatch`);
  check(Array.isArray(value.finalists) && value.finalists.length >= 1 && value.finalists.length <= 3, `${slug}: finalist evidence count`);
  check(new Set(value.finalists.map((f: any) => f.id)).size === value.finalists.length, `${slug}: duplicate finalist`);
  for (const f of value.finalists) {
    check(byId.has(f.id) && Array.isArray(f.images) && f.images.length >= 3, `${slug}: finalist/time-strip evidence`);
    check(new Set(f.images).size === f.images.length, `${slug}: duplicate image path`);
    check(f.images.every((p: any) => typeof p === "string" && p.startsWith("docs/images/sweeps-2026-10-30/") && p.endsWith(".png") && !p.split("/").includes("..")), `${slug}: image path`);
  }
}
function fixture(): any {
  const candidates = Array.from({ length: MINIMUM }, (_, i) => ({ id: `candidate-${i}`, params: { testParameter: i, seed: 7 } }));
  return {
    manifest: { slug: SLUGS[0], methodVersion: "fixture-v1", grid: { width: 128, height: 128 }, warmupSteps: 120, fluxGap: 4, dt: 1,
      command: `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep ${STAGE} "`, candidates,
      priorCoverage: [{ source: "docs/sweeps/example.md", description: "synthetic shape proof only" }] },
    ranked: candidates.map(c => ({ ...c, label: c.id, metrics: { score: 0.5, temporalFlux: 0.01 } })),
    references: [{ id: "reference", label: "Reference", params: { testParameter: -1, seed: 7 }, metrics: { score: 0.4 } }],
    finalists: [{ id: candidates[0].id, images: [0,1,2].map(i => `docs/images/sweeps-2026-10-30/fixture-${i}.png`) }],
  };
}

contractTest(`sweep ${STAGE} oracle accepts complete shape and rejects defective evidence`, () => {
  expect(() => record(fixture(), SLUGS[0])).not.toThrow();
  const cases: [string, (v: any) => void][] = [
    ["missing ranked candidates", v => v.ranked.pop()],
    ["duplicate candidate id", v => v.manifest.candidates[1].id = v.manifest.candidates[0].id],
    ["duplicate candidate parameters", v => v.manifest.candidates[1].params = v.manifest.candidates[0].params],
    ["manifest/result mismatch", v => v.ranked[0].params = { testParameter: 10000 }],
    ["non-finite score/metric", v => v.ranked[0].metrics.score = NaN],
    ["missing references", v => v.references = []],
    ["finalist/time-strip evidence", v => v.finalists[0].images.pop()],
    ["image path", v => v.finalists[0].images[0] = "../outside.png"],
    ["prior coverage citations", v => v.manifest.priorCoverage = []],
  ];
  for (const [message, mutate] of cases) { const v = fixture(); mutate(v); expect(() => record(v, SLUGS[0])).toThrow(message); }
});

contractTest(`sweep ${STAGE} preserves production source, guard scripts and historical configurations`, () => {
  // Production source and the guard scripts must equal the branch point on dev: a fixed hash would
  // break the moment any later card lands (card 150 did), so compare trees instead.
  expect(execFileSync("git", ["status", "--porcelain", "--", "src", "scripts/git-hooks/pre-push", "scripts/publish-sync.sh"], { cwd: ROOT, encoding: "utf8" }).trim()).toBe("");
  const branchPoint = execFileSync("git", ["merge-base", "HEAD", "dev"], { cwd: ROOT, encoding: "utf8" }).trim();
  for (const path of ["src", "scripts/git-hooks/pre-push", "scripts/publish-sync.sh"]) {
    const tree = (rev: string) => execFileSync("git", ["rev-parse", `${rev}:${path}`], { cwd: ROOT, encoding: "utf8" }).trim();
    expect(tree("HEAD"), `${path} differs from the branch point on dev`).toBe(tree(branchPoint));
  }
  expect(scoreFrames([0,0,1,1], [0,1,0,1], 2, 2, 0.5)).toEqual({ entropy: 0.2, variance: 0.25, spatialAutocorrelation: 0, coverage: 0.5, temporalFlux: 0.5, score: 0.09000000000000001 });
  const old = Object.fromEntries(OLD_KEYS.map(k => [k, SWEEP_CONFIGS[k]]));
  expect(createHash("sha256").update(JSON.stringify(old)).digest("hex")).toBe("edfe7b93e982768fe779ae462e7b3319a958af3e86e3fa6f7a9770064951a33f");
});

contractTest(`sweep ${STAGE} delivers each novel configuration and complete retained evidence`, () => {
  for (const slug of SLUGS) {
    const artifactId = `sweep-${STAGE}-${slug}`;
    const configs = Object.values(SWEEP_CONFIGS).filter(c => c.artifactId === artifactId);
    check(configs.length === 1, `${slug}: expected one new configuration ${artifactId}`);
    const config = configs[0];
    check(config.phase?.channel !== undefined, `${slug}: circular phase path required`);
    if (slug === "swarmalators") check(config.phase?.occupancy !== undefined, `${slug}: phase occupancy mask required`);
    check(config.slug === (slug.startsWith("clifford-dejong-") ? "clifford-dejong" : slug), `${slug}: wrong kernel`);
    const planned = config.sets ? config.sets.map(p => ({ ...config.baseParams, ...p })) : config.axes.reduce<any[]>((sets, axis) => sets.flatMap(p => axis.values.map(v => ({ ...p, [axis.key]: v }))), [{ ...config.baseParams }]);
    const novelAxes: Record<string, string[]> = {"kuramoto-oscillators": ["noise", "initialPattern"], "swarmalators": ["frequencySpread", "noise"]};
    for (const axis of novelAxes[slug]) check(new Set(planned.map(p => p[axis])).size >= 2 && planned.every(p => p[axis] !== undefined), `${slug}: missing pair interaction ${axis}`);
    check(planned.length >= MINIMUM && planned.length <= MAXIMUM, `${slug}: configuration count`);
    const rel = `docs/sweeps/data/2026-10-30/${STAGE}/${slug}.json`;
    check(existsSync(resolve(ROOT, rel)), `${slug}: missing retained result ${rel}`);
    const v = JSON.parse(readFileSync(resolve(ROOT, rel), "utf8")); record(v, slug);
    expect(v.manifest.grid).toEqual({ width: config.gridWidth, height: config.gridHeight });
    expect([v.manifest.warmupSteps, v.manifest.fluxGap, v.manifest.dt]).toEqual([config.warmupSteps, config.fluxGap, config.dt]);
    expect(v.manifest.candidates.map((c: any) => canonical(c.params)).sort()).toEqual(planned.map(canonical).sort());
    expect(v.references.map((c: any) => [c.id, canonical(c.params)]).sort()).toEqual(config.references.map(c => [c.id, canonical(c.params)]).sort());
    const reportSlug = slug.startsWith("clifford-dejong-") ? "clifford-dejong" : slug;
    const report = readFileSync(resolve(ROOT, `docs/sweeps/${reportSlug}-interestingness.md`), "utf8");
    check(report.includes(`2026-10-30/${STAGE}/${slug}.json`), `${slug}: report must link retained results`);
    for (const prior of v.manifest.priorCoverage) {
      check(!prior.source.startsWith("/") && !prior.source.split("/").includes("..") && existsSync(resolve(ROOT, prior.source)), `${slug}: unavailable prior-coverage source`);
    }
    for (const f of v.finalists) for (const p of f.images) {
      const bytes = readFileSync(resolve(ROOT, p));
      check(bytes.length > 32 && bytes.subarray(0,8).equals(PNG_SIGNATURE) && bytes.toString("ascii",12,16) === "IHDR", `${slug}: not a PNG ${p}`);
      check(bytes.readUInt32BE(16) >= 64 && bytes.readUInt32BE(20) >= 64, `${slug}: screenshot too small ${p}`);
      check(report.includes(p.slice("docs/".length)) || report.includes(p.split("/").at(-1)!), `${slug}: report must link finalist image`);
    }
  }
});
// AUTOMETTA-CONTRACT-END
