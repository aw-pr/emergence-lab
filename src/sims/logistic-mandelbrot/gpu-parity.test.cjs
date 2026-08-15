// Frozen GPU-parity contract test for stage 36. The assertion block between
// the AUTOMETTA-CONTRACT markers was written by the orchestrator from stage
// 35's verified measurements (state/verifiers/35-logistic-mandelbrot-gpu-sampler.json)
// and must not be edited; see docs/stages/36-logistic-mandelbrot-gpu-parity-fallback.md.
//
// The worker implements ./gpu-parity-harness.cjs with a single export:
//
//   loadParityReport(settings) -> Promise<report> | report
//
// where settings is "production" (warmup 1500, 8 samples) or "baker"
// (warmup 20000, 64 samples). The report measures the GPU sampling path
// (captured fixture or the emulated split-double path — worker's choice,
// stated in the handoff) against the fp64 CPU oracle
// (src/sims/logistic-mandelbrot/model.ts sampleAttractorCell) over stage
// 34's exact seeded corpus (scripts/spike-fp32-orbit.mjs, SEED 0x34f032:
// 12,288 cells, of which 3,072 CPU-classified stable interior and 9,216
// boundary-classified). Report shape consumed by the frozen block:
//
//   {
//     source: "gpu-fixture" | "emulated-fp32",
//     fixtureSha256: <64-hex string, or null when source is "emulated-fp32">,
//     corpus: { totalCells, stableInteriorCells, boundaryCells },
//     interior: {           // stable-interior cells only — the gated scope
//       comparedCells, periodMismatches, escapeMismatches,
//       maxAbsZrDelta, maxAbsMultiplierDelta,
//     },
//     boundary: { comparedCells, periodMismatchFraction },  // reported, sanity-capped
//   }
//
// Discovery: scripts/run-kernel-tests.cjs must pick this file up; a parity
// test that never runs is vacuous, which is this stage's primary failure mode.

const assert = require("node:assert/strict");
const test = require("node:test");

const { loadParityReport } = require("./gpu-parity-harness.cjs");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/36-logistic-mandelbrot-gpu-parity-fallback.md
// Gates are stage 34's recommendation (docs/spikes/2026-08-14-fp32-orbit-precision.md:144-151),
// scoped — as that document scopes them — to CPU-classified stable-interior
// cells: absolute sampled-value tolerance 2e-6 per zr, period-mismatch
// fraction at most 0.05% of gated cells. They are deliberately NOT applied
// full-field: on the boundary band a positive Lyapunov exponent saturates any
// finite-precision disagreement (stage 35 measured ~1.71% there at production
// settings, indistinguishable from plain fp32), and the spike pre-commits
// against relaxing the gates to encode that as success. The boundary band is
// therefore reported and sanity-capped, not gated at interior tolerances.
for (const settings of ["production", "baker"]) {
  test(`GPU parity vs fp64 CPU oracle, stable-interior scope (${settings})`, async () => {
    const report = await loadParityReport(settings);

    // Corpus identity: stage 34's seeded strata, not a substitute corpus.
    assert.equal(report.corpus.totalCells, 12288);
    assert.equal(report.corpus.stableInteriorCells, 3072);
    assert.equal(report.corpus.boundaryCells, 9216);

    // Provenance: a fixture must be pinned by hash; the emulated path needs none.
    assert.ok(["gpu-fixture", "emulated-fp32"].includes(report.source));
    if (report.source === "gpu-fixture") {
      assert.match(report.fixtureSha256, /^[0-9a-f]{64}$/);
    }

    // Non-vacuity: every stable-interior cell is actually compared, and the
    // comparison shows real finite-precision daylight (identical outputs mean
    // the GPU path was not what got measured).
    assert.equal(report.interior.comparedCells, 3072);
    assert.ok(Number.isFinite(report.interior.maxAbsZrDelta));
    assert.ok(report.interior.maxAbsZrDelta > 0);

    // The two stage-34 gates, at both settings.
    assert.ok(report.interior.maxAbsZrDelta <= 2e-6);
    assert.ok(report.interior.periodMismatches / 3072 <= 0.0005);

    // A stable-interior cell that escapes on one path but not the other is a
    // classification bug, not a precision artefact.
    assert.equal(report.interior.escapeMismatches, 0);

    // Attracting-cycle multiplier drift (drives colour, not geometry).
    // Stage 35 measured 0.0197 production / 7.309e-4 baker; bounds carry
    // headroom but catch an order-of-magnitude regression.
    const multiplierBound = settings === "production" ? 0.05 : 0.01;
    assert.ok(report.interior.maxAbsMultiplierDelta <= multiplierBound);

    // Boundary band: reported separately, capped only against catastrophe.
    // Stage 35 measured 1.7144% production / 0.2496% baker.
    assert.equal(report.boundary.comparedCells, 9216);
    const boundaryCap = settings === "production" ? 0.05 : 0.01;
    assert.ok(Number.isFinite(report.boundary.periodMismatchFraction));
    assert.ok(report.boundary.periodMismatchFraction <= boundaryCap);
  });
}
// AUTOMETTA-CONTRACT-END
