const { readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const SIMS_DIR = join(process.cwd(), "src", "sims");
const APP_DIR = join(process.cwd(), "src", "app");

function findTests(dir, isMatch) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const tests = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      tests.push(...findTests(fullPath, isMatch));
      continue;
    }

    if (entry.isFile() && isMatch(entry.name)) {
      tests.push(fullPath);
    }
  }

  return tests;
}

if (!statSync(SIMS_DIR, { throwIfNoEntry: false })?.isDirectory()) {
  console.error("No src/sims directory found.");
  process.exit(1);
}

// Kernel tests live one per sim directory; app-level unit tests (e.g. shared
// quality/device logic) live alongside the module they cover under src/app.
const tests = [
  ...findTests(SIMS_DIR, (name) => name === "kernel.test.cjs"),
  ...findTests(APP_DIR, (name) => name.endsWith(".test.cjs")),
].sort();

if (tests.length === 0) {
  console.error("No kernel tests found under src/sims/**/kernel.test.cjs.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
