const { readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const SIMS_DIR = join(process.cwd(), "src", "sims");

function findKernelTests(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const tests = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      tests.push(...findKernelTests(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name === "kernel.test.cjs") {
      tests.push(fullPath);
    }
  }

  return tests.sort();
}

if (!statSync(SIMS_DIR, { throwIfNoEntry: false })?.isDirectory()) {
  console.error("No src/sims directory found.");
  process.exit(1);
}

const tests = findKernelTests(SIMS_DIR);
if (tests.length === 0) {
  console.error("No kernel tests found under src/sims/**/kernel.test.cjs.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
