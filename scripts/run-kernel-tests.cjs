const { readdirSync, readFileSync, statSync, existsSync } = require("node:fs");
const { join, relative } = require("node:path");
const { spawnSync } = require("node:child_process");

const SIMS_DIR = join(process.cwd(), "src", "sims");
const APP_DIR = join(process.cwd(), "src", "app");
const HARNESS_DIR = join(process.cwd(), "e2e", "harness");

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
// The sweep harness under e2e/harness is pure numerics with no browser
// dependency, so its unit tests belong in this fast gate rather than behind
// Playwright; they require the .ts sources directly under type stripping.
const tests = [
  ...findTests(SIMS_DIR, (name) => name.endsWith(".test.cjs")),
  ...findTests(APP_DIR, (name) => name.endsWith(".test.cjs")),
  ...(statSync(HARNESS_DIR, { throwIfNoEntry: false })?.isDirectory()
    ? findTests(HARNESS_DIR, (name) => name.endsWith(".test.cjs"))
    : []),
].sort();

if (tests.length === 0) {
  console.error("No tests found under src/sims or src/app.");
  process.exit(1);
}

// Discovery is a filesystem walk, but compilation is an explicit include list
// in tsconfig.test.json. A test beside a module that nobody added to that list
// is found, run, and dies on MODULE_NOT_FOUND deep inside node:test, which
// reads as a broken test rather than an unbuilt module. Name the real cause.
const TEST_BUILD_REQUIRE = /require\(\s*["'`]([^"'`]*\.test-build\/[^"'`]+)["'`]\s*\)/g;

function missingTestBuildInputs(testFile) {
  const source = readFileSync(testFile, "utf8");
  const missing = [];

  for (const [, specifier] of source.matchAll(TEST_BUILD_REQUIRE)) {
    const emitted = specifier.slice(specifier.indexOf(".test-build/"));
    if (existsSync(join(process.cwd(), emitted))) continue;
    missing.push({
      emitted,
      source: join("src", emitted.replace(".test-build/", "")).replace(/\.js$/, ".ts"),
    });
  }

  return missing;
}

const unbuilt = tests.flatMap((testFile) =>
  missingTestBuildInputs(testFile).map((entry) => ({ testFile, ...entry })),
);

if (unbuilt.length > 0) {
  console.error("Tests require modules that npm run build:test did not emit:\n");
  for (const { testFile, emitted, source } of unbuilt) {
    console.error(`  ${relative(process.cwd(), testFile)}`);
    console.error(`    requires ${emitted}, which was not built from ${source}`);
  }
  console.error(
    '\nAdd the source path to the "include" array in tsconfig.test.json.' +
      "\nA stage card that adds a compiled src/app test must claim that file;" +
      "\nsee docs/INTERFACE.md, \"Testing a pure src/app module\".",
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
