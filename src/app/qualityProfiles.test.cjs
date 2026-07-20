const assert = require("node:assert/strict");
const test = require("node:test");

const {
  classifyDeviceTier,
  qualityProfileFor,
} = require("../../.test-build/app/qualityProfiles.js");

test("classifyDeviceTier: fine pointer is always desktop", () => {
  assert.equal(classifyDeviceTier(false, 320), "desktop");
  assert.equal(classifyDeviceTier(false, 2560), "desktop");
});

test("classifyDeviceTier: coarse pointer below 768 is phone, at or above is tablet", () => {
  assert.equal(classifyDeviceTier(true, 767), "phone");
  assert.equal(classifyDeviceTier(true, 768), "tablet");
  assert.equal(classifyDeviceTier(true, 1024), "tablet");
});

test("qualityProfileFor: logistic-mandelbrot defaults to extreme on desktop", () => {
  const profile = qualityProfileFor("logistic-mandelbrot", "fractal", "desktop");
  assert.equal(profile.defaultPreset, "extreme");
});

test("qualityProfileFor: logistic-mandelbrot caps to balanced on tablet", () => {
  const profile = qualityProfileFor("logistic-mandelbrot", "fractal", "tablet");
  assert.equal(profile.defaultPreset, "balanced");
});

test("qualityProfileFor: logistic-mandelbrot is forced to performance on phone", () => {
  const profile = qualityProfileFor("logistic-mandelbrot", "fractal", "phone");
  assert.equal(profile.defaultPreset, "performance");
});

test("qualityProfileFor: an ULTRA_DEFAULTS sim caps to balanced on tablet", () => {
  const profile = qualityProfileFor("boids", "grid", "tablet");
  assert.equal(profile.defaultPreset, "balanced");
});

test("qualityProfileFor: an ULTRA_DEFAULTS sim stays ultra on desktop", () => {
  const profile = qualityProfileFor("boids", "grid", "desktop");
  assert.equal(profile.defaultPreset, "ultra");
});

test("qualityProfileFor: lenia's performance default is untouched by the tablet cap", () => {
  const profile = qualityProfileFor("lenia", "grid", "tablet");
  assert.equal(profile.defaultPreset, "performance");
});

test("qualityProfileFor: heavy sims force down to performance on phone even from high", () => {
  const profile = qualityProfileFor("gray-scott", "grid", "phone");
  assert.equal(profile.defaultPreset, "performance");
});

test("qualityProfileFor: a balanced-default sim is unaffected by any tier", () => {
  for (const tier of ["desktop", "tablet", "phone"]) {
    const profile = qualityProfileFor("julia-set", "grid", tier);
    assert.equal(profile.defaultPreset, "balanced");
  }
});
