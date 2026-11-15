const assert = require("node:assert/strict");
const test = require("node:test");

// boidsGpu.ts imports the WebGL helpers at runtime, so it cannot join the
// tsconfig.test.json build; Node's type stripping loads the source directly.
const {
  BOIDS_GPU_MAX_VISUAL_RADIUS,
  boidsBinGrid,
  boidsGpuEligible,
  hasBoidsKernelAccess,
} = require("./boidsGpu.ts");
const { BoidsKernel } = require("../../.test-build/sims/boids/kernel.js");

const OPENING = {
  requested: true,
  desktop: true,
  floatTargets: true,
  obstacleLayout: "none",
  hasObstacles: false,
  visualRadius: 14,
  boidCount: 28000,
  binningMinBoids: 256,
};

test("the opening flock steps on the GPU when asked on a desktop with float targets", () => {
  assert.equal(boidsGpuEligible(OPENING), true);
  assert.equal(boidsGpuEligible({ ...OPENING, obstacleLayout: undefined }), true);
});

test("everything else stays on the CPU kernel", () => {
  const cpu = {
    "switch absent": { requested: false },
    "tablet or phone": { desktop: false },
    "no float render targets": { floatTargets: false },
    "a preset layout": { obstacleLayout: "rocks" },
    "the custom layout": { obstacleLayout: "custom" },
    "a dropped boulder": { hasObstacles: true },
    "a radius over the limit": { visualRadius: BOIDS_GPU_MAX_VISUAL_RADIUS + 1 },
    "a radius that is not a number": { visualRadius: Number.NaN },
    "a flock the kernel steers by brute force": { boidCount: 255 },
  };
  for (const [reason, change] of Object.entries(cpu)) {
    assert.equal(boidsGpuEligible({ ...OPENING, ...change }), false, reason);
  }
  assert.equal(boidsGpuEligible({ ...OPENING, visualRadius: BOIDS_GPU_MAX_VISUAL_RADIUS }), true);
});

test("bins match the kernel's: whole visual radii per axis", () => {
  assert.deepEqual(boidsBinGrid(1707, 960, 14), { cols: 121, rows: 68 });
  assert.deepEqual(boidsBinGrid(64, 64, 16), { cols: 4, rows: 4 });
});

test("the Boids kernel offers the handover accessors; a bare object does not", () => {
  assert.equal(hasBoidsKernelAccess(new BoidsKernel()), true);
  assert.equal(hasBoidsKernelAccess({ name: "Boids" }), false);
});
