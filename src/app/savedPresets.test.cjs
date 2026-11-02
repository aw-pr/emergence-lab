const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SavedPresetStore, PresetValidator, backupJSON, SAVED_PRESETS_KEY, MAX_IMPORT_BYTES } = require('../../.test-build/app/savedPresets.js');
const { BoidsKernel } = require('../../.test-build/sims/boids/kernel.js');

const schema = [
  { key: 'count', label: 'Count', type: 'number', min: 1, max: 100, step: 1, default: 10 },
  { key: 'mode', label: 'Mode', type: 'enum', options: ['a', 'b'], default: 'a' },
  { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
];
const models = [{ slug: 'example', variants: [{ variant: 'alternate' }], load: async () => ({ paramSchema: schema, destroy() {} }) },
  { slug: 'boids', load: async () => new BoidsKernel() },
  ...['physarum', 'particle-life'].map(slug => ({ slug, load: async () => ({ paramSchema: schema, destroy() {} }) }))];
const snapshot = () => ({ slug: 'example', params: { count: 12.345, mode: 'b', enabled: false },
  colourOptions: { preset: 'viridis', invert: true, gamma: 1.2, contrast: 0.8, steps: 3, paletteCycleReverse: true },
  displayOptions: { dotSize: 2, trailFade: 0.93, bloom: 0.35 }, resolution: 'ultra', stepsPerFrame: 1.5, autoCycle: false });
function memory() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function setup() { const storage = memory(); return { storage, store: new SavedPresetStore(models, () => storage) }; }
const envelope = (s = snapshot()) => backupJSON([{ id: 'original', name: 'Example', snapshot: s }]);

test('snapshots are complete deep copies; identity is independent of case-insensitive names', async () => {
  const { storage, store } = setup();
  const current = snapshot();
  const saved = await store.create(' First ', current);
  current.params.count = 90;
  current.colourOptions.gamma = 2;
  saved.snapshot.params.mode = 'a';
  assert.equal((await store.get(saved.id)).snapshot.params.count, 12.345);
  assert.equal((await store.get(saved.id)).snapshot.params.mode, 'b');
  assert.equal((await store.get(saved.id)).snapshot.colourOptions.gamma, 1.2);
  await assert.rejects(store.create('first', snapshot()), /already exists/);
  await store.rename(saved.id, 'Second');
  const duplicated = await store.duplicate(saved.id, 'Copy');
  assert.notEqual(duplicated.id, saved.id);
  const fresh = new SavedPresetStore(models, () => storage);
  assert.equal((await fresh.list()).length, 2);
  await fresh.delete(saved.id);
  await assert.rejects(fresh.update(saved.id, snapshot()), /no longer exists/);
  await fresh.restore({ ...saved, name: 'Second' });
  assert.equal((await fresh.get(saved.id)).name, 'Second');
});

test('invalid snapshots reject atomically, including enums, keys, prototype keys, numbers and versions', async () => {
  const { storage, store } = setup();
  await store.create('Good', snapshot());
  const stable = storage.getItem(SAVED_PRESETS_KEY);
  const mutations = [
    s => { s.slug = 'shelved-model'; }, s => { s.variant = 'missing'; },
    s => { s.params.mode = 'unknown'; }, s => { s.params.enabled = 'true'; },
    s => { s.params.count = Infinity; }, s => { s.params.count = 101; },
    s => { delete s.params.enabled; }, s => { s.params.unknown = 1; },
    s => { s.unknown = 1; }, s => { s.params.modelSource = "local-bake"; }, s => { s.colourOptions.preset = 'unknown'; },
    s => { s.displayOptions.bloom = -1; }, s => { s.params.seed = 144; },
    s => { s.colourOptions.steps = 2.5; }, s => { s.params = JSON.parse('{"count":10,"mode":"a","enabled":true,"__proto__":{"bad":true}}'); },
  ];
  for (const mutate of mutations) {
    const s = snapshot(); mutate(s);
    await assert.rejects(store.import(envelope(s)));
    assert.equal(storage.getItem(SAVED_PRESETS_KEY), stable);
  }
  for (const raw of ['{broken', envelope().replace('"version": 1', '"version": 999'), envelope().replace('"id": "original"', '"constructor": {}, "id": "original"')]) {
    await assert.rejects(store.import(raw));
    assert.equal(storage.getItem(SAVED_PRESETS_KEY), stable);
  }
  assert.equal({}.bad, undefined);
});

test('round trips merge fresh IDs and distinct names without changing exact values', async () => {
  const { store } = setup();
  await store.import(envelope()); await store.import(envelope()); await store.import(envelope());
  const entries = await store.list();
  assert.deepEqual(entries.map(p => p.name), ['Example', 'Example (copy)', 'Example (copy 2)']);
  assert.equal(new Set(entries.map(p => p.id)).size, 3);
  for (const entry of entries) assert.deepEqual(entry.snapshot, snapshot());
  const s = snapshot(); s.variant = 'alternate';
  assert.equal((await store.create('Variant', s)).snapshot.variant, 'alternate');
});

test('storage refusal retains an honest in-memory overlay through navigation reads and later recovery', async () => {
  const storage = memory(); let blocked = true;
  const store = new SavedPresetStore(models, () => ({ getItem: storage.getItem, setItem(key, value) { if (blocked) throw new Error('blocked'); storage.setItem(key, value); } }));
  const entry = await store.create('Temporary', snapshot());
  assert.match(store.warning, /until reload/);
  assert.equal((await store.list())[0].id, entry.id);
  assert.equal((await new SavedPresetStore(models, () => storage).list()).length, 0);
  blocked = false;
  await store.rename(entry.id, 'Durable');
  assert.equal(store.warning, '');
  assert.equal((await new SavedPresetStore(models, () => storage).list())[0].name, 'Durable');
});

test('malformed storage stays untouched, retains last good saves and requires explicit reset', async () => {
  const { store, storage } = setup();
  const saved = await store.create('Good', snapshot());
  storage.setItem(SAVED_PRESETS_KEY, '{broken');
  assert.equal((await store.list())[0].id, saved.id);
  assert.match(store.error, /left untouched/);
  await store.create('In memory', snapshot());
  assert.equal(storage.getItem(SAVED_PRESETS_KEY), '{broken');
  assert.match(store.warning, /until reload/);
  assert.equal((await store.list()).length, 2);
  await store.reset();
  assert.deepEqual(await store.list(), []);
  assert.equal(store.error, '');
});

test('mutations re-read storage and detect concurrent deletion without resurrecting the target', async () => {
  const { store, storage } = setup();
  const entry = await store.create('Original', snapshot());
  const tab = new SavedPresetStore(models, () => storage);
  await tab.create('Other tab', snapshot());
  await store.rename(entry.id, 'Renamed');
  assert.equal((await tab.list()).length, 2);
  await tab.delete(entry.id);
  await assert.rejects(store.update(entry.id, snapshot()), /no longer exists/);
  assert.deepEqual((await store.list()).map(p => p.name), ['Other tab']);
});

test('imports reject size and total-entry limits without a partial merge', async () => {
  const { store, storage } = setup();
  await store.create('Good', snapshot());
  const stable = storage.getItem(SAVED_PRESETS_KEY);
  await assert.rejects(store.import(' '.repeat(MAX_IMPORT_BYTES + 1)), /1 MiB/);
  const entries = Array.from({ length: 200 }, (_, i) => ({ id: String(i), name: `Item ${i}`, snapshot: snapshot() }));
  await assert.rejects(store.import(backupJSON(entries)), /200/);
  await assert.rejects(store.import(backupJSON([...entries, entries[0]])), /200/);
  assert.equal(storage.getItem(SAVED_PRESETS_KEY), stable);
});

test('Boids uses existing bounded layout validation; custom fields and explicit seeds survive', async () => {
  const validator = new PresetValidator(models);
  const kernel = new BoidsKernel();
  const s = { ...snapshot(), slug: 'boids', params: Object.fromEntries(kernel.paramSchema.map(p => [p.key, p.default])) };
  s.params.obstacleLayout = 'custom';
  await assert.rejects(validator.snapshot(s), /obstacle field/);
  s.customObstacles = JSON.stringify({ version: 1, obstacles: [{ kind: 'circle', x: 0.4, y: 0.6, radius: 0.03 }] });
  assert.equal((await validator.snapshot(s)).customObstacles, s.customObstacles);
  s.customObstacles = JSON.stringify({ version: 1, obstacles: Array(97).fill({ kind: 'circle', x: 0.4, y: 0.6, radius: 0.03 }) });
  await assert.rejects(validator.snapshot(s), /96/);
  for (const slug of ['physarum', 'particle-life']) {
    const seeded = { ...snapshot(), slug, params: { ...snapshot().params, seed: 144 } };
    assert.equal((await validator.snapshot(seeded)).params.seed, 144);
    seeded.params.seed = 1.5;
    await assert.rejects(validator.snapshot(seeded), /integer/);
  }
});


test('failed-write overlay reconciles remote names without corrupting durable saves', async () => {
  const storage = memory(); let blocked = true;
  const store = new SavedPresetStore(models, () => ({ getItem: storage.getItem, setItem(key, value) { if (blocked) throw new Error('blocked'); storage.setItem(key, value); } }));
  const local = await store.create('Same name', snapshot());
  const remote = new SavedPresetStore(models, () => storage);
  const durable = await remote.create('Same name', snapshot());
  const entries = await store.list();
  assert.equal(entries.find(entry => entry.id === local.id).name, 'Same name (copy)');
  assert.equal(entries.find(entry => entry.id === durable.id).name, 'Same name');
  blocked = false;
  await store.update(local.id, snapshot());
  assert.equal((await new SavedPresetStore(models, () => storage).list()).length, 2);
});
