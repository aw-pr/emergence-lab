const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

const ROOT = resolve(__dirname, "..");

function compileSource(path) {
  // build:test emits kernels but excludes the browser entry points. Compile
  // their declarations in memory so this also works on the unmodified base.
  return ts.transpileModule(readFileSync(resolve(ROOT, path), "utf8"), {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: false,
    },
  }).outputText;
}

function readConstant(compiled, name) {
  const source = ts.createSourceFile(
    "simView.js", compiled, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS,
  );
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) {
        continue;
      }
      if (!declaration.initializer) throw new Error(`${name} has no initializer`);
      // Evaluate only the compiled constant, never simView's browser imports.
      return JSON.parse(runInNewContext(
        `JSON.stringify(${declaration.initializer.getText(source)})`,
      ));
    }
  }
  return undefined;
}

async function loadKernels() {
  const compiled = compileSource("src/app/registry.ts");
  const requireBuilt = createRequire(resolve(ROOT, ".test-build/app/registry.js"));
  const catalogue = new Function("require", "exports", `${compiled}\nreturn CATALOGUE;`)(
    (specifier) => requireBuilt(specifier.replace(/\.ts$/, ".js")),
    {},
  );
  // Include shelved entries too, so a visibility toggle cannot conceal drift.
  const kernels = {};
  for (const entry of [...catalogue].sort((a, b) =>
    a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0,
  )) {
    if (Object.hasOwn(kernels, entry.slug)) {
      throw new Error(`Duplicate registry slug: ${entry.slug}`);
    }
    kernels[entry.slug] = await entry.load();
  }
  return kernels;
}

function deriveGrouping(schema, viewKeys = [], tableGroups = []) {
  const grouped = new Set(viewKeys);
  const view = schema.filter((descriptor) => grouped.has(descriptor.key))
    .map((descriptor) => descriptor.key);
  const sections = [];

  for (const group of tableGroups) {
    const members = schema.filter((descriptor) =>
      group.keys.includes(descriptor.key) && !grouped.has(descriptor.key),
    );
    if (members.length === 0) continue;
    sections.push({ label: group.label, keys: members.map(({ key }) => key) });
    for (const { key } of members) grouped.add(key);
  }

  const schemaGroupOrder = [];
  for (const descriptor of schema) {
    if (grouped.has(descriptor.key) || !descriptor.group) continue;
    if (!schemaGroupOrder.includes(descriptor.group)) {
      schemaGroupOrder.push(descriptor.group);
    }
  }
  for (const label of schemaGroupOrder) {
    const members = schema.filter((descriptor) =>
      descriptor.group === label && !grouped.has(descriptor.key),
    );
    if (members.length === 0) continue;
    sections.push({ label, keys: members.map(({ key }) => key) });
    for (const { key } of members) grouped.add(key);
  }

  const ungrouped = schema.filter((descriptor) => !grouped.has(descriptor.key))
    .map((descriptor) => descriptor.key);
  return { sections, ungrouped, view };
}

async function snapshot() {
  const compiled = compileSource("src/app/simView.ts");
  const viewKeys = readConstant(compiled, "VIEW_PARAM_KEYS");
  if (!viewKeys) throw new Error("VIEW_PARAM_KEYS declaration not found");
  const table = readConstant(compiled, "PARAM_GROUPS") ?? {};
  const kernels = await loadKernels();
  const result = {};
  for (const [slug, kernel] of Object.entries(kernels)) {
    result[slug] = deriveGrouping(
      kernel.paramSchema, viewKeys[slug], table[slug],
    );
  }
  return result;
}

function stableJson(value) {
  return JSON.stringify(value, (_key, entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]]));
  }, 2) + "\n";
}

module.exports = { deriveGrouping, loadKernels, snapshot, stableJson };

if (require.main === module) {
  snapshot().then((result) => process.stdout.write(stableJson(result))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
