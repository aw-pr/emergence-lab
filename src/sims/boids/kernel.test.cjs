const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BoidsKernel,
  CUSTOM_OBSTACLE_DRAG_THRESHOLD,
  MAX_CUSTOM_OBSTACLES,
  OBSTACLE_RENDER_MARGIN,
  selfTest,
} = require("../../../.test-build/sims/boids/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 12) {
  const kernel = new BoidsKernel();
  kernel.init(32, 24, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

function initOnlyState(params = {}) {
  const kernel = new BoidsKernel();
  kernel.init(32, 24, params);
  return Array.from(kernel.readState());
}

test("metadata matches the renderer contract", () => {
  const kernel = new BoidsKernel();

  assert.equal(kernel.name, "Boids");
  assert.equal(kernel.channelCount, 4);
  assert.deepEqual(kernel.channelLabels, [
    "Density",
    "Speed",
    "Velocity X",
    "Velocity Y",
  ]);
  assert.deepEqual(kernel.channelRanges, [
    [0, 1],
    [0, 1],
    [-1, 1],
    [-1, 1],
  ]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "obstacleLayout",
      "obstacleAmount",
      "boidCount",
      "initialFlocks",
      "visualRadius",
      "separationRadius",
      "maxSpeed",
      "alignment",
      "cohesion",
      "separation",
      "pointSize",
    ],
  );

  const pointSize = kernel.paramSchema.find(
    (descriptor) => descriptor.key === "pointSize",
  );
  assert.equal(pointSize.label, "Point size (px)");
  assert.equal(pointSize.default, 4);
  assert.equal(pointSize.min, 4);

  const boidCount = kernel.paramSchema.find(
    (descriptor) => descriptor.key === "boidCount",
  );
  assert.equal(boidCount.default, 17777);
  assert.equal(boidCount.max, 28000);

  const maxSpeed = kernel.paramSchema.find(
    (descriptor) => descriptor.key === "maxSpeed",
  );
  assert.equal(maxSpeed.default, 36);
  assert.equal(maxSpeed.max, 40);

  const obstacleLayout = kernel.paramSchema.find(
    (descriptor) => descriptor.key === "obstacleLayout",
  );
  assert.equal(obstacleLayout.type, "enum");
  assert.equal(obstacleLayout.default, "reef");
  assert.deepEqual(obstacleLayout.options, [
    "none",
    "breakwaters",
    "rocks",
    "reef",
    "custom",
  ]);

  const obstacleAmount = kernel.paramSchema.find(
    (descriptor) => descriptor.key === "obstacleAmount",
  );
  assert.equal(obstacleAmount.type, "number");
  assert.equal(obstacleAmount.default, 0.5);
  assert.equal(obstacleAmount.min, 0.1);
  assert.equal(obstacleAmount.max, 1);
  assert.equal(obstacleAmount.step, 0.05);

  for (const descriptor of kernel.paramSchema.filter(
    (candidate) => candidate.type === "number",
  )) {
    assert.equal(descriptor.type, "number");
    assert.equal(typeof descriptor.default, "number");
    assert.equal(typeof descriptor.min, "number");
    assert.equal(typeof descriptor.max, "number");
    assert.equal(typeof descriptor.step, "number");
    assert.ok(descriptor.min <= descriptor.default);
    assert.ok(descriptor.default <= descriptor.max);
  }
});

test("obstacle layout none is byte-identical to the released kernel fixture", () => {
  const releasedFixture = Buffer.from(
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA/sRZwPug2QL6P3A8+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgD+ojUs+2xdLvvHeWrwAAAAAAAAAAAAAAAAAAAAAAACAP+f9ez4AC1C+ozAOPgAAAAAAAAAAAAAAAAAAAAAAAIA/cJe/PoBTv76YSqG8AAAAAAAAAAAAAAAAAAAAAAAAgD/VVIQ+sfp4vtGBsz0AAIA/fAcWPzlZ5b7DesE+AACAP5F+Xz63dV6+ONarPAAAgD/DqaY+cSCiviZ7mj0AAAAAAAAAAAAAAAAAAAAAAACAP9agjz4wVIW+kaLVPQAAAAAAAAAAAAAAAAAAAAAAAIA/F+7BPvubj77QU4I+AACAP7/OHT7h0gq+LBWWvQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgD9vpZk+xOA3vs80dj4AAAAAAAAAAAAAAAAAAAAAAACAP+NLaD6jKVu+PQGaPQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgD8FaHw+RFgtvtR3Nz4AAIA/JKZNPqmlR75sSEW9AAAAAAAAAAAAAAAAAAAAAAAAgD/lQlg+EYhUvin3Hz0AAAAAAAAAAAAAAAAAAAAAAACAP9ygdz45iEy+/5cLPgAAgD9GRck92ImrvamQUj0AAIA/q2SiPtmSlr5NSPM9AACAP7TCST68wiu+g7bTPQAAAAAAAAAAAAAAAAAAAAAAAIA/fH53PnzpYL4sks49AAAAAAAAAAAAAAAAAAAAAAAAgD/qSZc+JJQ2vstIcT4AAAAAAAAAAAAAAAAAAAAAAACAP/UYcD4jYVa+fDnYPQAAgD/Yd0A+LJsevp0Q2j0AAAAAAAAAAAAAAAAAAAAA",
    "base64",
  );
  const kernel = new BoidsKernel();
  kernel.init(8, 6, {
    boidCount: 24,
    initialFlocks: 6,
    visualRadius: 5,
    separationRadius: 2,
    maxSpeed: 0.75,
    alignment: 0.08,
    cohesion: 0.01,
    separation: 0.22,
    seed: 4242,
    obstacleLayout: "none",
    obstacleAmount: 1,
  });
  for (let index = 0; index < 320; index += 1) {
    kernel.step(1);
  }

  const state = kernel.readState();
  const actual = Buffer.from(state.buffer, state.byteOffset, state.byteLength);
  assert.equal(state.length, 192);
  assert.equal(Buffer.compare(actual, releasedFixture), 0);
});

test("init creates the expected state shape and readState reference is stable", () => {
  const kernel = new BoidsKernel();
  kernel.init(16, 12, {});

  const first = kernel.readState();
  const second = kernel.readState();

  assert.ok(first instanceof Float32Array);
  assert.equal(first.length, 16 * 12 * kernel.channelCount);
  assert.equal(first, second);

  kernel.step(1);
  assert.equal(kernel.readState(), first);
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new BoidsKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ boidCount: defaults.boidCount, maxSpeed: defaults.maxSpeed }),
    runKernel(defaults),
  );
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = {
    boidCount: 64,
    visualRadius: 10,
    separationRadius: 4,
    maxSpeed: 1.6,
    alignment: 0.08,
    cohesion: 0.01,
    separation: 0.22,
  };

  assert.deepEqual(runKernel(params, 24), runKernel(params, 24));
});

test("seeded random initial flock is deterministic", () => {
  const params = {
    boidCount: 96,
    maxSpeed: 2.4,
  };
  assert.deepEqual(initOnlyState(params), initOnlyState(params));
});

test("seed param varies the initial flock but stays deterministic per seed", () => {
  const base = { boidCount: 96, maxSpeed: 2.4 };

  assert.deepEqual(
    initOnlyState({ ...base, seed: 1234 }),
    initOnlyState({ ...base, seed: 1234 }),
  );
  assert.notDeepEqual(
    initOnlyState({ ...base, seed: 1234 }),
    initOnlyState({ ...base, seed: 5678 }),
  );
  assert.deepEqual(
    initOnlyState({ ...base, seed: 0 }),
    initOnlyState(base),
  );
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("stepping populates bounded density, speed, and velocity channels", () => {
  const kernel = new BoidsKernel();
  kernel.init(32, 32, {});
  kernel.step(1);

  const state = kernel.readState();
  let densityCells = 0;
  let speedCells = 0;

  for (let index = 0; index < state.length; index += kernel.channelCount) {
    const density = state[index];
    const speed = state[index + 1];
    const velocityX = state[index + 2];
    const velocityY = state[index + 3];

    assert.ok(density >= 0);
    assert.ok(density <= 1);
    assert.ok(speed >= 0);
    assert.ok(speed <= 1);
    assert.ok(velocityX >= -1);
    assert.ok(velocityX <= 1);
    assert.ok(velocityY >= -1);
    assert.ok(velocityY <= 1);

    if (density > 0) {
      densityCells += 1;
      assert.ok(Math.hypot(velocityX, velocityY) > 0);
    }
    if (speed > 0) {
      speedCells += 1;
    }
  }

  assert.ok(densityCells > 1);
  assert.ok(speedCells > 1);
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({});
  const changed = runKernel({
    boidCount: 80,
    visualRadius: 18,
    separationRadius: 8,
    alignment: 0.15,
    cohesion: 0.02,
    separation: 0.45,
  });

  assert.notDeepEqual(changed, baseline);
});

function torusDeltaForTest(from, to, limit) {
  let delta = to - from;
  const half = limit / 2;
  if (delta > half) delta -= limit;
  if (delta < -half) delta += limit;
  return delta;
}

function obstacleSignedDistance(obstacle, x, y, width, height) {
  let offsetX = torusDeltaForTest(obstacle.x, x, width);
  let offsetY = torusDeltaForTest(obstacle.y, y, height);
  if (obstacle.kind === "capsule") {
    const halfLengthSq =
      obstacle.halfX * obstacle.halfX + obstacle.halfY * obstacle.halfY;
    const rawProjection =
      (offsetX * obstacle.halfX + offsetY * obstacle.halfY) / halfLengthSq;
    const projection = Math.max(-1, Math.min(1, rawProjection));
    offsetX -= obstacle.halfX * projection;
    offsetY -= obstacle.halfY * projection;
  }
  return Math.hypot(offsetX, offsetY) - obstacle.radius;
}

function placeFixedAdjacentScenario(kernel, obstacle) {
  let normalX = 1;
  let normalY = 0;
  let tangentX = 0;
  let tangentY = 1;
  if (obstacle.kind === "capsule") {
    const halfLength = Math.hypot(obstacle.halfX, obstacle.halfY);
    tangentX = obstacle.halfX / halfLength;
    tangentY = obstacle.halfY / halfLength;
    normalX = -tangentY;
    normalY = tangentX;
  }

  for (let index = 0; index < kernel.x.length; index += 1) {
    const tangentOffset = (index - 1.5) * 0.8;
    const surfaceOffset = obstacle.radius + 1 + index * 0.3;
    kernel.x[index] = obstacle.x + normalX * surfaceOffset + tangentX * tangentOffset;
    kernel.y[index] = obstacle.y + normalY * surfaceOffset + tangentY * tangentOffset;
    kernel.vx[index] = -normalX * 1.5;
    kernel.vy[index] = -normalY * 1.5;
  }
}

function syntheticObstacleRun(layout) {
  const params = {
    boidCount: 4,
    initialFlocks: 0,
    visualRadius: 1,
    separationRadius: 1,
    maxSpeed: 2,
    alignment: 0,
    cohesion: 0,
    separation: 0,
    obstacleLayout: layout,
    obstacleAmount: 0.5,
  };
  const kernel = new BoidsKernel();
  kernel.init(160, 120, params);
  return { kernel, params };
}

test("obstacle placement and adjacent steering are deterministic", () => {
  const first = syntheticObstacleRun("breakwaters");
  const second = syntheticObstacleRun("breakwaters");
  assert.deepEqual(first.kernel.obstacles, second.kernel.obstacles);
  assert.ok(first.kernel.obstacles.length > 0);

  const obstacle = first.kernel.obstacles[0];
  placeFixedAdjacentScenario(first.kernel, obstacle);
  placeFixedAdjacentScenario(second.kernel, obstacle);
  for (let index = 0; index < 24; index += 1) {
    first.kernel.step(1);
    second.kernel.step(1);
  }
  assert.deepEqual(Array.from(first.kernel.x), Array.from(second.kernel.x));
  assert.deepEqual(Array.from(first.kernel.y), Array.from(second.kernel.y));
  assert.deepEqual(Array.from(first.kernel.vx), Array.from(second.kernel.vx));
  assert.deepEqual(Array.from(first.kernel.vy), Array.from(second.kernel.vy));

  const open = syntheticObstacleRun("none");
  placeFixedAdjacentScenario(open.kernel, obstacle);
  for (let index = 0; index < 24; index += 1) {
    open.kernel.step(1);
  }
  assert.notDeepEqual(Array.from(first.kernel.x), Array.from(open.kernel.x));
});

test("obstacle rasterisation is deterministic for identical layout params", () => {
  for (const layout of ["breakwaters", "rocks", "reef"]) {
    const params = {
      boidCount: 48,
      initialFlocks: 0,
      obstacleLayout: layout,
      obstacleAmount: 0.75,
      seed: 991,
    };
    const first = new BoidsKernel();
    const second = new BoidsKernel();
    first.init(240, 180, params);
    second.init(240, 180, params);

    assert.ok(first.obstacleCells.length > 0, `${layout} raster is non-empty`);
    assert.deepEqual(
      Array.from(first.obstacleRaster),
      Array.from(second.obstacleRaster),
      `${layout} mask is deterministic`,
    );
    assert.deepEqual(
      Array.from(first.obstacleNormalX),
      Array.from(second.obstacleNormalX),
      `${layout} crest normals are deterministic`,
    );
    assert.deepEqual(
      Array.from(first.obstacleNormalY),
      Array.from(second.obstacleNormalY),
      `${layout} crest normals are deterministic`,
    );
    assert.deepEqual(
      Array.from(first.readState()),
      Array.from(second.readState()),
      `${layout} published state is deterministic`,
    );
  }
});

test("rendered obstacle silhouettes stay inside the collision surface margin", () => {
  const width = 240;
  const height = 180;
  const rasterTolerance = Math.SQRT2;

  for (const layout of ["breakwaters", "rocks", "reef"]) {
    const kernel = new BoidsKernel();
    kernel.init(width, height, {
      boidCount: 24,
      initialFlocks: 0,
      obstacleLayout: layout,
      obstacleAmount: 0.9,
    });

    let boundaryCells = 0;
    for (let cell = 0; cell < kernel.obstacleRaster.length; cell += 1) {
      if (kernel.obstacleRaster[cell] === 0) continue;
      const x = cell % width;
      const y = Math.floor(cell / width);
      const distance = Math.min(
        ...kernel.obstacles.map((obstacle) =>
          obstacleSignedDistance(obstacle, x + 0.5, y + 0.5, width, height),
        ),
      );
      assert.ok(distance <= 0, `${layout} rendered outside collision surface`);

      const neighbours = [
        x === 0 ? -1 : cell - 1,
        x === width - 1 ? -1 : cell + 1,
        y === 0 ? -1 : cell - width,
        y === height - 1 ? -1 : cell + width,
      ];
      if (neighbours.some((neighbour) =>
        neighbour < 0 || kernel.obstacleRaster[neighbour] === 0
      )) {
        boundaryCells += 1;
        assert.ok(
          distance >= -(OBSTACLE_RENDER_MARGIN + rasterTolerance),
          `${layout} silhouette exceeded its inset margin`,
        );
      }
    }
    assert.ok(boundaryCells > 0, `${layout} has a rendered boundary`);
  }
});

function rockSilhouetteSignature(kernel, obstacle, width, height) {
  const radialSamples = [];
  for (let sample = 0; sample < 72; sample += 1) {
    const angle = (sample / 72) * Math.PI * 2;
    let furthest = 0;
    for (let radius = 0; radius <= obstacle.radius + 1; radius += 0.25) {
      const x = Math.floor(
        ((obstacle.x + Math.cos(angle) * radius) % width + width) % width,
      );
      const y = Math.floor(
        ((obstacle.y + Math.sin(angle) * radius) % height + height) % height,
      );
      if (kernel.obstacleRaster[y * width + x] > 0) {
        furthest = radius;
      }
    }
    radialSamples.push(Math.round((furthest / obstacle.radius) * 64));
  }
  return radialSamples.join(",");
}

test("default rocks have individually varied silhouettes", () => {
  const width = 640;
  const height = 480;
  const kernel = new BoidsKernel();
  kernel.init(width, height, {
    boidCount: 24,
    initialFlocks: 0,
    obstacleLayout: "rocks",
    obstacleAmount: 0.5,
  });

  assert.ok(kernel.obstacles.length > 1);
  assert.ok(kernel.obstacles.every((obstacle) => obstacle.kind === "circle"));
  const signatures = kernel.obstacles.map((obstacle) =>
    rockSilhouetteSignature(kernel, obstacle, width, height)
  );
  assert.equal(
    new Set(signatures).size,
    signatures.length,
    "no two default rocks share an identical normalised silhouette",
  );
});

test("obstacle depth tones preserve channel ranges and stay below flock brightness", () => {
  const ranges = [
    [0, 1],
    [0, 1],
    [-1, 1],
    [-1, 1],
  ];

  for (const layout of ["breakwaters", "rocks", "reef"]) {
    const kernel = new BoidsKernel();
    kernel.init(240, 180, {
      boidCount: 48,
      initialFlocks: 0,
      obstacleLayout: layout,
      obstacleAmount: 0.8,
    });
    kernel.step(1);

    const tones = new Set();
    for (const cell of kernel.obstacleCells) {
      tones.add(kernel.obstacleRaster[cell]);
      const offset = cell * kernel.channelCount;
      for (let channel = 0; channel < kernel.channelCount; channel += 1) {
        const [min, max] = ranges[channel];
        assert.ok(kernel.readState()[offset + channel] >= min);
        assert.ok(kernel.readState()[offset + channel] <= max);
      }
      assert.ok(kernel.readState()[offset] < 1, `${layout} stays below flock density`);
      assert.ok(kernel.readState()[offset + 1] <= 0.42 + 1e-6);
    }
    assert.ok(tones.size >= 4, `${layout} publishes a visible depth gradient`);
    assert.ok(Math.min(...tones) >= 1);
    assert.ok(Math.max(...tones) <= 8);
  }
});

test("crest bias responds more strongly to incoming than departing flow", () => {
  const width = 160;
  const height = 120;
  const kernel = new BoidsKernel();
  kernel.init(width, height, {
    boidCount: 24,
    initialFlocks: 0,
    obstacleLayout: "rocks",
    obstacleAmount: 0.5,
  });

  const obstacleCellIndex = Array.from(kernel.obstacleNormalX).findIndex(
    (normalX, index) => Math.hypot(normalX, kernel.obstacleNormalY[index]) > 120,
  );
  assert.ok(obstacleCellIndex >= 0);
  const cell = kernel.obstacleCells[obstacleCellIndex];
  const cellX = cell % width;
  const cellY = Math.floor(cell / width);
  const normalX = kernel.obstacleNormalX[obstacleCellIndex] / 127;
  const normalY = kernel.obstacleNormalY[obstacleCellIndex] / 127;
  const sampleX = Math.floor(((cellX + normalX * 6) % width + width) % width);
  const sampleY = Math.floor(((cellY + normalY * 6) % height + height) % height);
  const offset = (sampleY * width + sampleX) * kernel.channelCount;

  kernel.state.fill(0);
  kernel.state[offset] = 1;
  kernel.state[offset + 2] = -normalX;
  kernel.state[offset + 3] = -normalY;
  const incoming = kernel.sampleObstacleArrival(obstacleCellIndex);

  kernel.state[offset + 2] = normalX;
  kernel.state[offset + 3] = normalY;
  const departing = kernel.sampleObstacleArrival(obstacleCellIndex);

  assert.ok(incoming > 0.95);
  assert.equal(departing, 0.3);
});

for (const layout of ["breakwaters", "rocks", "reef"]) {
  test(`${layout} keeps every boid outside obstacle surfaces`, () => {
    const width = 160;
    const height = 120;
    const kernel = new BoidsKernel();
    kernel.init(width, height, {
      boidCount: 320,
      initialFlocks: 6,
      visualRadius: 18,
      separationRadius: 6,
      maxSpeed: 4,
      obstacleLayout: layout,
      obstacleAmount: 0.75,
    });
    assert.ok(kernel.obstacles.length > 0);

    for (let step = 0; step < 320; step += 1) {
      kernel.step(1);
      for (let boid = 0; boid < kernel.x.length; boid += 1) {
        for (const obstacle of kernel.obstacles) {
          assert.ok(
            obstacleSignedDistance(
              obstacle,
              kernel.x[boid],
              kernel.y[boid],
              width,
              height,
            ) >= -1e-4,
            `${layout} boid ${boid} penetrated an obstacle at step ${step}`,
          );
        }
      }
    }
  });
}

function customKernel(params = {}) {
  const kernel = new BoidsKernel();
  kernel.init(160, 120, {
    boidCount: 24,
    initialFlocks: 0,
    obstacleLayout: "custom",
    obstacleAmount: 0.5,
    ...params,
  });
  return kernel;
}

test("short custom drags place rocks instead of sliver capsules", () => {
  const kernel = customKernel();

  assert.equal(
    kernel.placeCustomCapsule(
      30,
      40,
      30 + CUSTOM_OBSTACLE_DRAG_THRESHOLD - 0.01,
      40,
    ),
    true,
  );
  assert.equal(kernel.obstacles[0].kind, "circle");

  assert.equal(
    kernel.placeCustomCapsule(
      60,
      40,
      60 + CUSTOM_OBSTACLE_DRAG_THRESHOLD,
      40,
    ),
    true,
  );
  assert.equal(kernel.obstacles[1].kind, "capsule");
});

test("custom edit API places deterministic rocks and drag capsules", () => {
  const first = customKernel();
  const second = customKernel();

  assert.equal(first.obstacles.length, 0);
  assert.equal(first.placeCustomRock(30, 40), true);
  assert.equal(first.placeCustomCapsule(70, 30, 110, 70), true);
  second.placeCustomRock(30, 40);
  second.placeCustomCapsule(70, 30, 110, 70);

  assert.deepEqual(first.obstacles, second.obstacles);
  assert.equal(first.obstacles[0].kind, "circle");
  assert.equal(first.obstacles[0].x, 30);
  assert.equal(first.obstacles[0].y, 40);
  assert.equal(first.obstacles[1].kind, "capsule");
  assert.equal(first.obstacles[1].x, 90);
  assert.equal(first.obstacles[1].y, 50);
  assert.equal(first.obstacles[1].halfX, 20);
  assert.equal(first.obstacles[1].halfY, 20);
  assert.ok(Math.abs(first.obstacles[1].radius - 1.68) < 1e-9);
  assert.ok(first.obstacleCells.length > 0);
  assert.deepEqual(
    Array.from(first.obstacleRaster),
    Array.from(second.obstacleRaster),
  );

  const small = customKernel({ obstacleAmount: 0.1 });
  const large = customKernel({ obstacleAmount: 1 });
  small.placeCustomRock(30, 40);
  large.placeCustomRock(30, 40);
  assert.ok(large.obstacles[0].radius > small.obstacles[0].radius);
});

test("custom edit API removes the clicked obstacle and clears the field", () => {
  const kernel = customKernel();
  kernel.placeCustomRock(30, 40);
  kernel.placeCustomCapsule(70, 30, 110, 70);

  assert.equal(kernel.removeCustomObstacleAt(30, 40), true);
  assert.equal(kernel.obstacles.length, 1);
  assert.equal(kernel.obstacles[0].kind, "capsule");
  assert.equal(kernel.removeCustomObstacleAt(5, 5), false);
  assert.equal(kernel.clearCustomObstacles(), true);
  assert.equal(kernel.obstacles.length, 0);
  assert.equal(kernel.obstacleCells.length, 0);

  kernel.init(160, 120, {
    boidCount: 30,
    initialFlocks: 0,
    obstacleLayout: "custom",
    obstacleAmount: 0.5,
  });
  assert.equal(kernel.obstacles.length, 0);
});

test("custom obstacle snapshots survive flock-resetting parameter changes", () => {
  const kernel = customKernel();
  kernel.placeCustomRock(25, 35);
  kernel.placeCustomCapsule(60, 20, 100, 50);
  const snapshot = kernel.getCustomObstacles();

  kernel.init(160, 120, {
    boidCount: 48,
    initialFlocks: 0,
    visualRadius: 32,
    separationRadius: 12,
    obstacleLayout: "custom",
    obstacleAmount: 0.5,
  });
  assert.deepEqual(kernel.obstacles, snapshot);

  const reloaded = customKernel({ boidCount: 48, visualRadius: 32 });
  assert.equal(reloaded.restoreCustomObstacles(snapshot), true);
  assert.deepEqual(reloaded.obstacles, snapshot);

  snapshot[0].x = 120;
  assert.notEqual(reloaded.obstacles[0].x, snapshot[0].x);
});

test("custom obstacle bound replaces the oldest obstacle first", () => {
  const kernel = customKernel();
  for (let index = 0; index < MAX_CUSTOM_OBSTACLES + 2; index += 1) {
    kernel.placeCustomRock(5 + index, 20 + (index % 4) * 20);
  }

  assert.equal(kernel.obstacles.length, MAX_CUSTOM_OBSTACLES);
  assert.equal(kernel.obstacles[0].x, 7);
  assert.equal(
    kernel.obstacles[MAX_CUSTOM_OBSTACLES - 1].x,
    5 + MAX_CUSTOM_OBSTACLES + 1,
  );
});

test("live custom edits preserve boid arrays except collision resolution", () => {
  const kernel = customKernel({ boidCount: 4 });
  kernel.x.set([50, 10, 130, 140]);
  kernel.y.set([50, 10, 90, 20]);
  kernel.vx.set([1, 0.5, -0.5, 0.25]);
  kernel.vy.set([0, -0.25, 0.75, -1]);
  const x = kernel.x;
  const y = kernel.y;
  const vx = kernel.vx;
  const vy = kernel.vy;
  const before = {
    x: Array.from(x),
    y: Array.from(y),
    vx: Array.from(vx),
    vy: Array.from(vy),
  };

  kernel.placeCustomRock(50, 50);

  assert.equal(kernel.x, x);
  assert.equal(kernel.y, y);
  assert.equal(kernel.vx, vx);
  assert.equal(kernel.vy, vy);
  assert.notDeepEqual([kernel.x[0], kernel.y[0]], [before.x[0], before.y[0]]);
  assert.deepEqual(Array.from(kernel.x).slice(1), before.x.slice(1));
  assert.deepEqual(Array.from(kernel.y).slice(1), before.y.slice(1));
  assert.deepEqual(Array.from(kernel.vx).slice(1), before.vx.slice(1));
  assert.deepEqual(Array.from(kernel.vy).slice(1), before.vy.slice(1));
});

test("the dropped-obstacle overlay survives layout and flock resets", () => {
  const kernel = new BoidsKernel();
  kernel.init(160, 120, {
    boidCount: 24,
    initialFlocks: 0,
    obstacleLayout: "reef",
    obstacleAmount: 0.5,
  });
  kernel.placeCustomRock(25, 35);
  kernel.placeCustomCapsule(60, 20, 100, 50);
  const overlay = kernel.getCustomObstacles();

  kernel.init(160, 120, {
    boidCount: 48,
    initialFlocks: 0,
    obstacleLayout: "rocks",
    obstacleAmount: 0.5,
  });
  assert.deepEqual(kernel.getCustomObstacles(), overlay);
  assert.deepEqual(kernel.obstacles.slice(-overlay.length), overlay);

  kernel.init(160, 120, {
    boidCount: 30,
    initialFlocks: 0,
    obstacleLayout: "reef",
    obstacleAmount: 0.5,
  });
  assert.deepEqual(kernel.getCustomObstacles(), overlay);
  assert.deepEqual(kernel.obstacles.slice(-overlay.length), overlay);
});

test("preset generation stays deterministic beneath a non-empty overlay", () => {
  const params = {
    boidCount: 24,
    initialFlocks: 0,
    obstacleLayout: "rocks",
    obstacleAmount: 0.75,
  };
  const edited = new BoidsKernel();
  edited.init(160, 120, params);
  edited.placeCustomRock(25, 35);
  edited.placeCustomCapsule(60, 20, 100, 50);
  const overlay = edited.getCustomObstacles();

  edited.init(160, 120, params);
  const clean = new BoidsKernel();
  clean.init(160, 120, params);

  assert.deepEqual(edited.presetObstacles, clean.presetObstacles);
  assert.deepEqual(
    edited.obstacles.slice(0, edited.presetObstacles.length),
    clean.presetObstacles,
  );
  assert.deepEqual(edited.obstacles.slice(-overlay.length), overlay);
});

test("removal and clear affect overlay obstacles only", () => {
  const kernel = new BoidsKernel();
  kernel.init(160, 120, {
    boidCount: 24,
    initialFlocks: 0,
    obstacleLayout: "rocks",
    obstacleAmount: 0.5,
  });
  const preset = structuredClone(kernel.presetObstacles);
  const presetRock = preset[0];

  assert.equal(
    kernel.removeCustomObstacleAt(presetRock.x, presetRock.y),
    false,
  );
  assert.deepEqual(kernel.presetObstacles, preset);

  assert.equal(kernel.placeCustomRock(presetRock.x, presetRock.y), true);
  assert.equal(kernel.removeCustomObstacleAt(presetRock.x, presetRock.y), true);
  assert.deepEqual(kernel.presetObstacles, preset);
  assert.deepEqual(kernel.obstacles, preset);

  kernel.placeCustomRock(5, 5);
  assert.equal(kernel.clearCustomObstacles(), true);
  assert.deepEqual(kernel.presetObstacles, preset);
  assert.deepEqual(kernel.obstacles, preset);
});

test("the composed obstacle bound keeps presets and replaces oldest overlay entries", () => {
  const kernel = customKernel();
  for (let index = 0; index < MAX_CUSTOM_OBSTACLES; index += 1) {
    kernel.placeCustomRock(5 + index, 20 + (index % 4) * 20);
  }
  const fullOverlay = kernel.getCustomObstacles();

  kernel.init(160, 120, {
    boidCount: 24,
    initialFlocks: 0,
    obstacleLayout: "rocks",
    obstacleAmount: 1,
  });
  const preset = structuredClone(kernel.presetObstacles);
  const overlayLimit = MAX_CUSTOM_OBSTACLES - preset.length;
  assert.deepEqual(kernel.getCustomObstacles(), fullOverlay);
  assert.equal(kernel.obstacles.length, MAX_CUSTOM_OBSTACLES);
  assert.deepEqual(kernel.obstacles.slice(0, preset.length), preset);
  assert.deepEqual(
    kernel.obstacles.slice(preset.length),
    fullOverlay.slice(-overlayLimit),
  );

  assert.equal(kernel.placeCustomRock(140, 110), true);
  assert.equal(kernel.getCustomObstacles().length, overlayLimit);
  assert.deepEqual(
    kernel.getCustomObstacles()[0],
    fullOverlay[fullOverlay.length - overlayLimit + 1],
  );
  assert.equal(kernel.getCustomObstacles().at(-1).x, 140);
  assert.deepEqual(kernel.obstacles.slice(0, preset.length), preset);
  assert.equal(kernel.obstacles.length, MAX_CUSTOM_OBSTACLES);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new BoidsKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
