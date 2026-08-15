const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SPIKE_SCRIPT = join(REPO_ROOT, "scripts", "spike-fp32-orbit.mjs");
const STABLE_INTERIOR_REGIONS = [
  "cardioid-interior",
  "period-2-interior",
  "period-4-interior",
];

let cachedReports = null;

function runParityMeasurement() {
  const result = spawnSync(process.execPath, [SPIKE_SCRIPT], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `GPU parity emulation failed with status ${result.status}: ${result.stderr.trim()}`,
    );
  }

  const measurement = JSON.parse(result.stdout);
  const reports = {};
  for (const settings of ["production", "baker"]) {
    const comparison = measurement.results?.[settings]?.fp32VsFp64;
    if (!comparison) throw new Error(`Missing ${settings} parity measurement`);
    const interiorRegions = STABLE_INTERIOR_REGIONS.map((name) => {
      const region = comparison.regions?.[name];
      if (!region) throw new Error(`Missing parity stratum: ${name}`);
      return region;
    });
    const periodMismatches = interiorRegions.reduce(
      (total, region) => total + region.periodMismatchCount,
      0,
    );
    const escapeMismatches = interiorRegions.reduce(
      (total, region) =>
        total + (region.cells - region.comparableNonEscapedCells),
      0,
    );

    reports[settings] = {
      source: "emulated-fp32",
      fixtureSha256: null,
      corpus: {
        totalCells: comparison.cells,
        stableInteriorCells: interiorRegions.reduce(
          (total, region) => total + region.cells,
          0,
        ),
        boundaryCells: comparison.boundaryCells,
      },
      interior: {
        comparedCells: interiorRegions.reduce(
          (total, region) => total + region.comparableNonEscapedCells,
          0,
        ),
        periodMismatches,
        escapeMismatches,
        maxAbsZrDelta: Math.max(
          ...interiorRegions.map((region) => region.valueMaxAbs),
        ),
        // The spike exposes the whole-corpus maximum. It is a conservative
        // upper bound for the stable-interior subset used by the other gates.
        maxAbsMultiplierDelta: comparison.interiorMaxAbs,
      },
      boundary: {
        comparedCells: comparison.boundaryCells,
        periodMismatchFraction: comparison.boundaryPeriodMismatchFraction,
      },
    };
  }
  return reports;
}

function loadParityReport(settings) {
  if (settings !== "production" && settings !== "baker") {
    throw new TypeError(`Unknown parity settings: ${settings}`);
  }
  cachedReports ??= runParityMeasurement();
  return cachedReports[settings];
}

module.exports = { loadParityReport };
