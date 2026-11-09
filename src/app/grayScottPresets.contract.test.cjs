const assert = require("node:assert/strict");
const test = require("node:test");
const { createHash } = require("node:crypto");
const { readFileSync, existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "../..");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/160-gray-scott-speed-one-ultra-tuning.md
const skip = process.env.GRAY_SCOTT_SPEED !== "1" && "set GRAY_SCOTT_SPEED=1";
const presetsModule = () => require("../../.test-build/app/presets.js");
const kernelModule = () => require("../../.test-build/sims/gray-scott/kernel.js");
const sha256 = (relativePath) => createHash("sha256").update(readFileSync(join(ROOT, relativePath))).digest("hex");

const DIFFUSION = { Du: 0.2097, Dv: 0.105 };
const PRESETS = [
  { id: "mitosis", label: "Mitosis", params: { ...DIFFUSION, F: 0.0367, k: 0.0649, stepsPerFrame: 1 } },
  { id: "coral", label: "Coral", params: { ...DIFFUSION, F: 0.0545, k: 0.062, stepsPerFrame: 1 } },
  { id: "worms", label: "Worms", params: { ...DIFFUSION, F: 0.054, k: 0.063, stepsPerFrame: 1 } },
  { id: "maze", label: "Maze", params: { ...DIFFUSION, F: 0.029, k: 0.057, stepsPerFrame: 1 } },
  { id: "spots", label: "Spots", params: { ...DIFFUSION, F: 0.026, k: 0.0597, stepsPerFrame: 1 } },
  { id: "waves", label: "Waves", params: { ...DIFFUSION, F: 0.018, k: 0.0487, stepsPerFrame: 1 } },
];
const KERNEL_DEFAULTS = { stencil: "nine-point", dt: 1, stepsPerFrame: 1 };
const THUMBNAIL = "d3d21cab06bf3d874e5cd19cd20d6c0da2170adc488bfbaea524a0402706333f";
const REPORT = "docs/sweeps/2026-11-10-gray-scott-ultra-tuning.md";

test("the six Gray-Scott presets keep their F, k and diffusion and all run one step per frame", { skip }, () => {
  assert.deepEqual(presetsModule().presetsFor("gray-scott"), PRESETS);
});

test("the kernel defaults for stencil, dt and steps per frame are unchanged", { skip }, () => {
  const schema = new (kernelModule().GrayScottKernel)().paramSchema;
  for (const [key, value] of Object.entries(KERNEL_DEFAULTS)) {
    const descriptor = schema.find((d) => d.key === key);
    assert.ok(descriptor, key);
    assert.equal(descriptor.default, value, `${key} default`);
  }
});

test("the gray-scott thumbnail is byte-for-byte unchanged: it is rendered from kernel defaults, not a preset", { skip }, () => {
  assert.equal(sha256("public/thumbnails/gray-scott.png"), THUMBNAIL);
});

test("the ultra tuning report exists and covers every preset at the GPU grid", { skip }, () => {
  assert.ok(existsSync(join(ROOT, REPORT)), REPORT);
  const report = readFileSync(join(ROOT, REPORT), "utf8");
  for (const preset of PRESETS) assert.ok(report.includes(preset.label), `report lacks "${preset.label}"`);
  for (const needle of ["stepsPerFrame", "1280", "gpu-ping-pong", "seconds", "docs/UAT/uat.md"]) {
    assert.ok(report.includes(needle), `report lacks "${needle}"`);
  }
});
// AUTOMETTA-CONTRACT-END
