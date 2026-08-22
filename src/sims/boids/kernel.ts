export {
  removeObstacleLayoutSlot,
  upsertObstacleLayoutSlot,
  type CustomObstacleLayoutSlot,
} from "./layoutStore.js";

type ParamDescriptor = {
  key: string;
  label: string;
  type: "number" | "boolean" | "enum";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  info?: string;
  group?: string;
};

type SimParams = Record<string, number | boolean | string>;

interface SimKernel {
  init(width: number, height: number, params: SimParams): void;
  step(dt: number): void;
  readState(): Float32Array;
  readonly channelCount: number;
  readonly channelRanges: readonly (readonly [number, number])[];
  readonly name: string;
  readonly channelLabels: readonly string[];
  readonly paramSchema: readonly ParamDescriptor[];
  destroy(): void;
}

const DEFAULT_BOID_COUNT = 17777;
const DEFAULT_VISUAL_RADIUS = 25;
const DEFAULT_SEPARATION_RADIUS = 8;
const DEFAULT_MAX_SPEED = 36;
const DEFAULT_ALIGNMENT = 0.09;
const DEFAULT_COHESION = 0.011;
const DEFAULT_SEPARATION = 0.22;
const DEFAULT_POINT_SIZE = 4;
/** Matches the native viewer's spec: six ring-arranged flocks at load, so the
 * first frames read as flocking rather than a uniform speckle. */
const DEFAULT_INITIAL_FLOCKS = 6;
const MAX_BOID_COUNT = 40000;
/** Per-step random heading nudge as a fraction of max speed; a little keeps flocks
 * from freezing into rigid crystalline order, but too much washes the flocking
 * out into uniform noise — kept low so alignment/cohesion can actually organise. */
const WANDER_STRENGTH = 0.05;
/** Skip spatial binning below this count (brute force is cheaper for small flocks). */
const BINNING_MIN_BOIDS = 256;
/** Cap neighbours considered per boid so huge flocks stay O(N) and never freeze the tab. */
const NEIGHBOUR_LIMIT = 48;
const CHANNEL_COUNT = 4;
const TWO_PI = Math.PI * 2;
export const OBSTACLE_RENDER_MARGIN = 3;
const OBSTACLE_CELL_GUARD = Math.SQRT1_2;
const OBSTACLE_DEPTH_LEVELS = 8;
const OBSTACLE_CORE = [0.82, 0.04, -0.5, 0] as const;
const OBSTACLE_CREST = [0.89, 0.42, -0.36, 0] as const;
const REEF_CORE = [0.8, 0.08, -0.43, 0.04] as const;
const REEF_CREST = [0.88, 0.39, -0.24, 0.11] as const;
const OBSTACLE_WASH = [0.94, 0.48, -0.2, 0.1] as const;
const OBSTACLE_ARRIVAL_DISTANCES = [6, 16, 28] as const;
const OBSTACLE_ARRIVAL_LATERAL = [-4, 0, 4] as const;
const OBSTACLE_LAYOUTS = ["none", "breakwaters", "rocks", "reef", "custom"] as const;
type ObstacleLayout = (typeof OBSTACLE_LAYOUTS)[number];

/** Composed fields stay bounded so live raster rebuilds cannot grow without limit. */
export const MAX_CUSTOM_OBSTACLES = 96;
/** Shorter drags are treated as taps, avoiding near-zero breakwater slivers. */
export const CUSTOM_OBSTACLE_DRAG_THRESHOLD = 8;

export type CircleObstacle = {
  kind: "circle";
  x: number;
  y: number;
  radius: number;
};

export type CapsuleObstacle = {
  kind: "capsule";
  x: number;
  y: number;
  halfX: number;
  halfY: number;
  radius: number;
};

export type Obstacle = CircleObstacle | CapsuleObstacle;

export const OBSTACLE_LAYOUT_FORMAT_VERSION = 1;

export type ObstacleLayoutDecodeResult =
  | { ok: true; obstacles: Obstacle[] }
  | { ok: false; error: string };

function isFiniteRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNormalised(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1;
}

function isNormalisedOffset(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -1 &&
    value <= 1;
}

/** Encode editable obstacles without canvas-size assumptions or whitespace. */
export function encodeObstacleLayout(
  obstacles: readonly Obstacle[],
  width: number,
  height: number,
): string {
  if (width <= 0 || height <= 0) {
    throw new Error("Obstacle layouts need a positive canvas size");
  }
  const scale = Math.min(width, height);
  return JSON.stringify({
    version: OBSTACLE_LAYOUT_FORMAT_VERSION,
    obstacles: obstacles.map((obstacle) =>
      obstacle.kind === "circle"
        ? {
            kind: obstacle.kind,
            x: obstacle.x / width,
            y: obstacle.y / height,
            radius: obstacle.radius / scale,
          }
        : {
            kind: obstacle.kind,
            x: obstacle.x / width,
            y: obstacle.y / height,
            halfX: obstacle.halfX / width,
            halfY: obstacle.halfY / height,
            radius: obstacle.radius / scale,
          }
    ),
  });
}

/** Decode a v1 layout, ignoring unknown fields so additive changes stay readable. */
export function decodeObstacleLayout(
  serialised: string,
  width: number,
  height: number,
): ObstacleLayoutDecodeResult {
  if (width <= 0 || height <= 0) {
    return { ok: false, error: "The canvas is not ready yet." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialised);
  } catch {
    return { ok: false, error: "That is not valid JSON." };
  }
  if (!isFiniteRecord(parsed)) {
    return { ok: false, error: "A layout must be a JSON object." };
  }
  if (parsed.version !== OBSTACLE_LAYOUT_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Unsupported layout version: ${String(parsed.version)}.`,
    };
  }
  if (!Array.isArray(parsed.obstacles)) {
    return { ok: false, error: "The layout has no obstacles array." };
  }
  if (parsed.obstacles.length > MAX_CUSTOM_OBSTACLES) {
    return {
      ok: false,
      error: `A layout can contain at most ${MAX_CUSTOM_OBSTACLES} obstacles.`,
    };
  }

  const scale = Math.min(width, height);
  const obstacles: Obstacle[] = [];
  for (let index = 0; index < parsed.obstacles.length; index += 1) {
    const candidate = parsed.obstacles[index];
    if (!isFiniteRecord(candidate)) {
      return { ok: false, error: `Obstacle ${index + 1} is not an object.` };
    }
    if (
      (candidate.kind !== "circle" && candidate.kind !== "capsule") ||
      !isNormalised(candidate.x) ||
      !isNormalised(candidate.y) ||
      !isNormalised(candidate.radius) ||
      candidate.radius <= 0
    ) {
      return { ok: false, error: `Obstacle ${index + 1} has invalid geometry.` };
    }

    const base = {
      x: candidate.x * width,
      y: candidate.y * height,
      radius: candidate.radius * scale,
    };
    if (candidate.kind === "circle") {
      obstacles.push({ kind: candidate.kind, ...base });
      continue;
    }
    if (
      !isNormalisedOffset(candidate.halfX) ||
      !isNormalisedOffset(candidate.halfY) ||
      (candidate.halfX === 0 && candidate.halfY === 0)
    ) {
      return { ok: false, error: `Obstacle ${index + 1} has invalid geometry.` };
    }
    obstacles.push({
      kind: candidate.kind,
      ...base,
      halfX: candidate.halfX * width,
      halfY: candidate.halfY * height,
    });
  }
  return { ok: true, obstacles };
}

function hashAngle(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(b ^ 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return ((h >>> 0) / 0x100000000) * TWO_PI;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function numberParam(
  params: SimParams,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function obstacleLayoutParam(params: SimParams): ObstacleLayout {
  const value = params.obstacleLayout;
  return typeof value === "string" &&
    (OBSTACLE_LAYOUTS as readonly string[]).includes(value)
    ? (value as ObstacleLayout)
    : "reef";
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
}

function valueNoiseHash(x: number, y: number, seed: number): number {
  let hash = seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

function mixSeed(seed: number, value: number): number {
  let mixed = seed ^ Math.imul(value | 0, 0x9e3779b1);
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function smoothNoiseStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function valueNoise2d(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothNoiseStep(x - x0);
  const ty = smoothNoiseStep(y - y0);
  const top =
    valueNoiseHash(x0, y0, seed) * (1 - tx) +
    valueNoiseHash(x0 + 1, y0, seed) * tx;
  const bottom =
    valueNoiseHash(x0, y0 + 1, seed) * (1 - tx) +
    valueNoiseHash(x0 + 1, y0 + 1, seed) * tx;
  return top * (1 - ty) + bottom * ty;
}

function fractalValueNoise(
  x: number,
  y: number,
  scale: number,
  seed: number,
): number {
  let amplitude = 0.56;
  let frequency = 1 / scale;
  let value = 0;
  let weight = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    value += valueNoise2d(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    weight += amplitude;
    amplitude *= 0.52;
    frequency *= 2.07;
  }
  return value / weight;
}

function wrap(value: number, limit: number): number {
  if (limit <= 0) {
    return 0;
  }

  let wrapped = value % limit;
  if (wrapped < 0) {
    wrapped += limit;
  }
  return wrapped;
}

function torusDelta(from: number, to: number, limit: number): number {
  let delta = to - from;
  const half = limit / 2;

  if (delta > half) {
    delta -= limit;
  } else if (delta < -half) {
    delta += limit;
  }

  return delta;
}

function limitVector(
  x: number,
  y: number,
  maxLength: number,
): readonly [number, number] {
  const length = Math.hypot(x, y);
  if (length === 0 || length <= maxLength) {
    return [x, y];
  }

  const scale = maxLength / length;
  return [x * scale, y * scale];
}

export class BoidsKernel implements SimKernel {
  readonly name = "Boids";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Density", "Speed", "Velocity X", "Velocity Y"] as const;
  readonly channelRanges = [
    [0, 1],
    [0, 1],
    [-1, 1],
    [-1, 1],
  ] as const;
  readonly paramSchema = [
    {
      key: "obstacleLayout",
      label: "Obstacle layout",
      type: "enum",
      default: "reef",
      options: OBSTACLE_LAYOUTS,
      info: "Static breakwaters, rocks, or a broken reef split the flock into persistent streams and heading domains. Dropped boulders sit over every layout and survive layout changes. Custom provides an empty preset beneath them, while None leaves only the dropped boulders. Changing the layout resets the flock.",
    },
    {
      key: "obstacleAmount",
      label: "Obstacle amount",
      type: "number",
      default: 0.5,
      min: 0.1,
      max: 1,
      step: 0.05,
      info: "How much of the field the chosen obstacles occupy. Higher values add more obstacles and make each one larger, creating stronger breaks in the flow. Changing it resets the flock.",
    },
    {
      key: "boidCount",
      label: "Boid count",
      type: "number",
      default: DEFAULT_BOID_COUNT,
      min: 1,
      max: 28000,
      step: 1,
      info: "How many boids fly in the flock. More boids make the flow denser and the emergent shapes richer, at the cost of frame rate. Changing it resets the flock.",
    },
    {
      key: "initialFlocks",
      label: "Initial flocks",
      type: "number",
      default: DEFAULT_INITIAL_FLOCKS,
      min: 0,
      max: 12,
      step: 1,
      info: "How many coherent flocks the boids start in, arranged on a ring and already heading together, so the opening frames read as flocking rather than static. Zero (or one) scatters every boid uniformly at random and lets flocks assemble on their own. Changing it resets the flock.",
    },
    {
      key: "visualRadius",
      label: "Visual radius",
      type: "number",
      default: DEFAULT_VISUAL_RADIUS,
      min: 1,
      max: 64,
      step: 1,
      info: "How far each boid can see its neighbours. A larger radius pulls more of the flock into each boid's alignment and cohesion averaging, producing bigger, calmer schools; a small radius fragments the flock into many small clusters. Changing it resets the flock.",
    },
    {
      key: "separationRadius",
      label: "Separation radius",
      type: "number",
      default: DEFAULT_SEPARATION_RADIUS,
      min: 1,
      max: 32,
      step: 1,
      info: "How close two boids must get before they push apart. Larger values keep boids more spread out within the flock; it only has an effect while smaller than the visual radius. Changing it resets the flock.",
    },
    {
      key: "maxSpeed",
      label: "Max speed",
      type: "number",
      default: DEFAULT_MAX_SPEED,
      min: 0.25,
      max: 40,
      step: 0.05,
      info: "Top speed a boid can travel. Raising it makes the whole flock dart and streak faster across the field; lowering it produces a slow, drifting swarm. Changing it resets the flock.",
    },
    {
      key: "alignment",
      label: "Alignment",
      type: "number",
      default: DEFAULT_ALIGNMENT,
      min: 0,
      max: 0.25,
      step: 0.001,
      group: "Flocking rules",
      info: "How strongly a boid steers to match its neighbours' heading. Higher values make the flock move in tight, unified streams; near zero, boids ignore each other's direction and the flock looks like scattered traffic. Changing it resets the flock.",
    },
    {
      key: "cohesion",
      label: "Cohesion",
      type: "number",
      default: DEFAULT_COHESION,
      min: 0,
      max: 0.05,
      step: 0.001,
      group: "Flocking rules",
      info: "How strongly a boid steers toward the centre of its local neighbours. Higher values pull the flock into a single tight cluster; near zero, boids drift apart into loose, independent groups. Changing it resets the flock.",
    },
    {
      key: "separation",
      label: "Separation",
      type: "number",
      default: DEFAULT_SEPARATION,
      min: 0,
      max: 1,
      step: 0.001,
      group: "Flocking rules",
      info: "How strongly a boid pushes away from neighbours that stray inside its separation radius. Higher values keep individual boids from overlapping, giving the flock a looser, more granular texture. Changing it resets the flock.",
    },
    {
      key: "pointSize",
      label: "Point size (px)",
      type: "number",
      default: DEFAULT_POINT_SIZE,
      min: 4,
      max: 16,
      step: 1,
      info: "On-screen size of each boid marker; does not change flocking behaviour. Changing it resets the flock, like every other control here.",
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private x = new Float32Array(0);
  private y = new Float32Array(0);
  private vx = new Float32Array(0);
  private vy = new Float32Array(0);
  private nextVx = new Float32Array(0);
  private nextVy = new Float32Array(0);
  private binHead = new Int32Array(0);
  private binNext = new Int32Array(0);
  private stepCounter = 0;
  private seed = 0;
  private initialFlocks = DEFAULT_INITIAL_FLOCKS;
  private boidCount = DEFAULT_BOID_COUNT;
  private visualRadius = DEFAULT_VISUAL_RADIUS;
  private separationRadius = DEFAULT_SEPARATION_RADIUS;
  private maxSpeed = DEFAULT_MAX_SPEED;
  private alignment = DEFAULT_ALIGNMENT;
  private cohesion = DEFAULT_COHESION;
  private separation = DEFAULT_SEPARATION;
  private obstacleLayout: ObstacleLayout = "reef";
  private obstacleAmount = 0.5;
  private presetObstacles: Obstacle[] = [];
  private obstacles: Obstacle[] = [];
  private customObstacles: Obstacle[] = [];
  private obstacleRaster = new Uint8Array(0);
  private obstacleCells = new Uint32Array(0);
  private obstacleNormalX = new Int8Array(0);
  private obstacleNormalY = new Int8Array(0);
  private obstacleArrival = new Float32Array(0);
  private obstacleOwner = new Uint16Array(0);
  private obstacleTexture = new Int8Array(0);
  private obstacleFleck = new Uint8Array(0);
  private obstacleWashRing = new Uint8Array(0);
  private obstacleFamily = new Uint8Array(0);
  private obstacleTextureSeeds = new Uint32Array(0);

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    this.boidCount = Math.floor(
      clamp(
        numberParam(params, "boidCount", DEFAULT_BOID_COUNT),
        1,
        MAX_BOID_COUNT,
      ),
    );
    this.visualRadius = clamp(
      numberParam(params, "visualRadius", DEFAULT_VISUAL_RADIUS),
      1,
      64,
    );
    this.separationRadius = clamp(
      numberParam(params, "separationRadius", DEFAULT_SEPARATION_RADIUS),
      1,
      32,
    );
    this.maxSpeed = clamp(
      numberParam(params, "maxSpeed", DEFAULT_MAX_SPEED),
      0.25,
      40,
    );
    this.alignment = clamp(
      numberParam(params, "alignment", DEFAULT_ALIGNMENT),
      0,
      0.25,
    );
    this.cohesion = clamp(
      numberParam(params, "cohesion", DEFAULT_COHESION),
      0,
      0.05,
    );
    this.separation = clamp(
      numberParam(params, "separation", DEFAULT_SEPARATION),
      0,
      1,
    );
    this.initialFlocks = Math.floor(
      clamp(numberParam(params, "initialFlocks", DEFAULT_INITIAL_FLOCKS), 0, 12),
    );
    const obstacleLayout = obstacleLayoutParam(params);
    const obstacleAmount = clamp(numberParam(params, "obstacleAmount", 0.5), 0.1, 1);
    this.obstacleLayout = obstacleLayout;
    this.obstacleAmount = obstacleAmount;
    this.presetObstacles = this.createObstacles(obstacleLayout, obstacleAmount);
    this.composeObstacles();
    // Optional run-to-run variety: a non-zero seed shifts the initial flock so
    // each load/reset differs. Absent (0), seeding stays a pure function of the
    // grid size and boid count, keeping init reproducible.
    this.seed = numberParam(params, "seed", 0) | 0;

    const length = this.width * this.height * this.channelCount;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
    } else {
      this.state.fill(0);
    }
    this.buildObstacleRaster(obstacleLayout, obstacleAmount);

    if (this.x.length !== this.boidCount) {
      this.x = new Float32Array(this.boidCount);
      this.y = new Float32Array(this.boidCount);
      this.vx = new Float32Array(this.boidCount);
      this.vy = new Float32Array(this.boidCount);
      this.nextVx = new Float32Array(this.boidCount);
      this.nextVy = new Float32Array(this.boidCount);
      this.binNext = new Int32Array(this.boidCount);
    }

    this.stepCounter = 0;
    this.seedBoids();
    if (this.obstacles.length > 0) {
      for (let i = 0; i < this.boidCount; i += 1) {
        this.resolveObstaclePenetration(i);
      }
    }
    this.rasterise();
  }

  step(dt: number): void {
    if (this.width === 0 || this.height === 0 || this.boidCount === 0) {
      return;
    }

    const timeStep = clamp(Number.isFinite(dt) ? dt : 1, 0, 2);
    this.stepCounter += 1;

    const cols = Math.floor(this.width / this.visualRadius);
    const rows = Math.floor(this.height / this.visualRadius);
    if (this.boidCount >= BINNING_MIN_BOIDS && cols >= 3 && rows >= 3) {
      this.computeForcesBinned(cols, rows);
    } else {
      this.computeForcesBrute();
    }

    const nextVx = this.nextVx;
    const nextVy = this.nextVy;
    if (this.obstacles.length === 0) {
      for (let i = 0; i < this.boidCount; i += 1) {
        this.vx[i] = nextVx[i];
        this.vy[i] = nextVy[i];
        this.x[i] = wrap(this.x[i] + this.vx[i] * timeStep, this.width);
        this.y[i] = wrap(this.y[i] + this.vy[i] * timeStep, this.height);
      }
    } else {
      for (let i = 0; i < this.boidCount; i += 1) {
        this.vx[i] = nextVx[i];
        this.vy[i] = nextVy[i];
        this.x[i] = wrap(this.x[i] + this.vx[i] * timeStep, this.width);
        this.y[i] = wrap(this.y[i] + this.vy[i] * timeStep, this.height);
        this.resolveObstaclePenetration(i);
      }
    }

    this.rasterise();
  }

  private computeForcesBrute(): void {
    const visualRadiusSq = this.visualRadius * this.visualRadius;
    const separationRadiusSq = this.separationRadius * this.separationRadius;

    for (let i = 0; i < this.boidCount; i += 1) {
      let neighborCount = 0;
      let avgVx = 0;
      let avgVy = 0;
      let centerX = 0;
      let centerY = 0;
      let repelX = 0;
      let repelY = 0;

      for (let j = 0; j < this.boidCount; j += 1) {
        if (i === j) {
          continue;
        }

        const dx = torusDelta(this.x[i], this.x[j], this.width);
        const dy = torusDelta(this.y[i], this.y[j], this.height);
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > visualRadiusSq) {
          continue;
        }

        neighborCount += 1;
        avgVx += this.vx[j];
        avgVy += this.vy[j];
        centerX += dx;
        centerY += dy;

        if (distanceSq < separationRadiusSq && distanceSq > 0) {
          const distance = Math.sqrt(distanceSq);
          const strength = (this.separationRadius - distance) / distance;
          repelX -= dx * strength;
          repelY -= dy * strength;
        }

        if (neighborCount >= NEIGHBOUR_LIMIT) {
          break;
        }
      }

      this.applySteer(
        i,
        neighborCount,
        avgVx,
        avgVy,
        centerX,
        centerY,
        repelX,
        repelY,
      );
    }
  }

  private computeForcesBinned(cols: number, rows: number): void {
    const binCount = cols * rows;
    if (this.binHead.length !== binCount) {
      this.binHead = new Int32Array(binCount);
    }
    this.binHead.fill(-1);

    const binWidth = this.width / cols;
    const binHeight = this.height / rows;
    const binNext = this.binNext;

    for (let i = 0; i < this.boidCount; i += 1) {
      const col = Math.min(cols - 1, Math.floor(this.x[i] / binWidth));
      const row = Math.min(rows - 1, Math.floor(this.y[i] / binHeight));
      const bin = row * cols + col;
      binNext[i] = this.binHead[bin];
      this.binHead[bin] = i;
    }

    const visualRadiusSq = this.visualRadius * this.visualRadius;
    const separationRadiusSq = this.separationRadius * this.separationRadius;

    for (let i = 0; i < this.boidCount; i += 1) {
      const col = Math.min(cols - 1, Math.floor(this.x[i] / binWidth));
      const row = Math.min(rows - 1, Math.floor(this.y[i] / binHeight));

      let neighborCount = 0;
      let avgVx = 0;
      let avgVy = 0;
      let centerX = 0;
      let centerY = 0;
      let repelX = 0;
      let repelY = 0;

      neighbours: for (let dr = -1; dr <= 1; dr += 1) {
        const nr = (row + dr + rows) % rows;
        for (let dc = -1; dc <= 1; dc += 1) {
          const nc = (col + dc + cols) % cols;
          let j = this.binHead[nr * cols + nc];
          while (j !== -1) {
            if (j !== i) {
              const dx = torusDelta(this.x[i], this.x[j], this.width);
              const dy = torusDelta(this.y[i], this.y[j], this.height);
              const distanceSq = dx * dx + dy * dy;
              if (distanceSq <= visualRadiusSq) {
                neighborCount += 1;
                avgVx += this.vx[j];
                avgVy += this.vy[j];
                centerX += dx;
                centerY += dy;

                if (distanceSq < separationRadiusSq && distanceSq > 0) {
                  const distance = Math.sqrt(distanceSq);
                  const strength = (this.separationRadius - distance) / distance;
                  repelX -= dx * strength;
                  repelY -= dy * strength;
                }

                if (neighborCount >= NEIGHBOUR_LIMIT) {
                  break neighbours;
                }
              }
            }
            j = binNext[j];
          }
        }
      }

      this.applySteer(
        i,
        neighborCount,
        avgVx,
        avgVy,
        centerX,
        centerY,
        repelX,
        repelY,
      );
    }
  }

  private applySteer(
    i: number,
    neighborCount: number,
    avgVx: number,
    avgVy: number,
    centerX: number,
    centerY: number,
    repelX: number,
    repelY: number,
  ): void {
    let velocityX = this.vx[i];
    let velocityY = this.vy[i];

    if (neighborCount > 0) {
      const invCount = 1 / neighborCount;
      avgVx *= invCount;
      avgVy *= invCount;
      centerX *= invCount;
      centerY *= invCount;

      velocityX += (avgVx - velocityX) * this.alignment;
      velocityY += (avgVy - velocityY) * this.alignment;
      velocityX += centerX * this.cohesion;
      velocityY += centerY * this.cohesion;
    }

    velocityX += repelX * this.separation;
    velocityY += repelY * this.separation;

    const angle = hashAngle(i, this.stepCounter);
    const wander = this.maxSpeed * WANDER_STRENGTH;
    velocityX += Math.cos(angle) * wander;
    velocityY += Math.sin(angle) * wander;

    if (this.obstacles.length > 0) {
      const steered = this.obstacleSteer(i, velocityX, velocityY);
      velocityX = steered[0];
      velocityY = steered[1];
    }

    const limited = limitVector(velocityX, velocityY, this.maxSpeed);
    this.nextVx[i] = limited[0];
    this.nextVy[i] = limited[1];
  }

  readState(): Float32Array {
    return this.state;
  }

  getObstacleEditBounds(): readonly [number, number] {
    return [this.width, this.height];
  }

  getCustomObstacles(): readonly Obstacle[] {
    return this.customObstacles.map((obstacle) => ({ ...obstacle }));
  }

  exportCustomObstacleLayout(): string {
    return encodeObstacleLayout(this.customObstacles, this.width, this.height);
  }

  importCustomObstacleLayout(serialised: string): ObstacleLayoutDecodeResult {
    const decoded = decodeObstacleLayout(serialised, this.width, this.height);
    if (!decoded.ok) {
      return decoded;
    }
    this.customObstacles = decoded.obstacles;
    this.rebuildObstacleComposition(true);
    return decoded;
  }

  restoreCustomObstacles(snapshot: readonly unknown[]): boolean {
    if (!Array.isArray(snapshot) || this.width === 0 || this.height === 0) {
      return false;
    }

    const restored: Obstacle[] = [];
    const first = Math.max(0, snapshot.length - MAX_CUSTOM_OBSTACLES);
    for (let index = first; index < snapshot.length; index += 1) {
      const candidate = snapshot[index];
      if (!isFiniteRecord(candidate)) {
        return false;
      }

      const { kind, x, y, radius } = candidate;
      if (
        (kind !== "circle" && kind !== "capsule") ||
        typeof x !== "number" ||
        !Number.isFinite(x) ||
        typeof y !== "number" ||
        !Number.isFinite(y) ||
        typeof radius !== "number" ||
        !Number.isFinite(radius) ||
        radius <= 0
      ) {
        return false;
      }

      const base = {
        x: clamp(x, 0, Math.max(0, this.width - 1e-6)),
        y: clamp(y, 0, Math.max(0, this.height - 1e-6)),
        radius: clamp(radius, 0.25, Math.max(this.width, this.height)),
      };
      if (kind === "circle") {
        restored.push({ kind, ...base });
        continue;
      }

      const { halfX, halfY } = candidate;
      if (
        typeof halfX !== "number" ||
        !Number.isFinite(halfX) ||
        typeof halfY !== "number" ||
        !Number.isFinite(halfY) ||
        Math.hypot(halfX, halfY) <= 0
      ) {
        return false;
      }
      restored.push({ kind, ...base, halfX, halfY });
    }

    this.customObstacles = restored;
    this.rebuildObstacleComposition(true);
    return true;
  }

  /**
   * Grid-unit spacing between successive rocks in a pointer-drawn boulder
   * line: close enough to read as one arc, open enough that a full-width
   * drag stays well inside the composed obstacle cap.
   */
  customRockTrailSpacing(): number {
    return this.customRockRadius() * 1.6;
  }

  private customRockRadius(): number {
    return Math.min(this.width, this.height) *
      (0.012 + this.obstacleAmount * 0.018);
  }

  placeCustomRock(x: number, y: number): boolean {
    if (!this.canEditCustomObstacles(x, y)) {
      return false;
    }

    const radius = this.customRockRadius();
    return this.appendCustomObstacle({
      kind: "circle",
      x: clamp(x, 0, Math.max(0, this.width - 1e-6)),
      y: clamp(y, 0, Math.max(0, this.height - 1e-6)),
      radius,
    });
  }

  placeCustomCapsule(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): boolean {
    if (
      !this.canEditCustomObstacles(startX, startY) ||
      !Number.isFinite(endX) ||
      !Number.isFinite(endY)
    ) {
      return false;
    }

    const x1 = clamp(startX, 0, Math.max(0, this.width - 1e-6));
    const y1 = clamp(startY, 0, Math.max(0, this.height - 1e-6));
    const x2 = clamp(endX, 0, Math.max(0, this.width - 1e-6));
    const y2 = clamp(endY, 0, Math.max(0, this.height - 1e-6));
    const deltaX = x2 - x1;
    const deltaY = y2 - y1;
    if (Math.hypot(deltaX, deltaY) < CUSTOM_OBSTACLE_DRAG_THRESHOLD) {
      return this.placeCustomRock(x1, y1);
    }

    const halfX = deltaX * 0.5;
    const halfY = deltaY * 0.5;

    const radius = Math.min(this.width, this.height) *
      (0.008 + this.obstacleAmount * 0.012);
    return this.appendCustomObstacle({
      kind: "capsule",
      x: x1 + halfX,
      y: y1 + halfY,
      halfX,
      halfY,
      radius,
    });
  }

  removeCustomObstacleAt(x: number, y: number): boolean {
    if (!this.canEditCustomObstacles(x, y)) {
      return false;
    }

    for (let index = this.customObstacles.length - 1; index >= 0; index -= 1) {
      if (this.obstacleSurface(this.customObstacles[index], x, y, 0)[0] <= 0) {
        this.customObstacles.splice(index, 1);
        this.rebuildObstacleComposition(false);
        return true;
      }
    }
    return false;
  }

  clearCustomObstacles(): boolean {
    if (this.width === 0 || this.height === 0) {
      return false;
    }
    if (this.customObstacles.length === 0) {
      return true;
    }

    this.customObstacles.length = 0;
    this.rebuildObstacleComposition(false);
    return true;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.x = new Float32Array(0);
    this.y = new Float32Array(0);
    this.vx = new Float32Array(0);
    this.vy = new Float32Array(0);
    this.nextVx = new Float32Array(0);
    this.nextVy = new Float32Array(0);
    this.binHead = new Int32Array(0);
    this.binNext = new Int32Array(0);
    this.presetObstacles = [];
    this.obstacles = [];
    this.obstacleRaster = new Uint8Array(0);
    this.obstacleCells = new Uint32Array(0);
    this.obstacleNormalX = new Int8Array(0);
    this.obstacleNormalY = new Int8Array(0);
    this.obstacleArrival = new Float32Array(0);
    this.obstacleOwner = new Uint16Array(0);
    this.obstacleTexture = new Int8Array(0);
    this.obstacleFleck = new Uint8Array(0);
    this.obstacleWashRing = new Uint8Array(0);
    this.obstacleFamily = new Uint8Array(0);
    this.obstacleTextureSeeds = new Uint32Array(0);
  }

  private createObstacles(layout: ObstacleLayout, amount: number): Obstacle[] {
    if (
      layout === "none" ||
      layout === "custom" ||
      this.width === 0 ||
      this.height === 0
    ) {
      return [];
    }

    const obstacles: Obstacle[] = [];
    const minDimension = Math.min(this.width, this.height);

    if (layout === "breakwaters") {
      const count = 3 + Math.floor(amount * 5);
      const halfLength = minDimension * (0.055 + amount * 0.06);
      const radius = minDimension * (0.012 + amount * 0.018);
      const directionLength = Math.hypot(this.width, this.height);
      const halfX = (this.width / directionLength) * halfLength;
      const halfY = (this.height / directionLength) * halfLength;

      for (let index = 0; index < count; index += 1) {
        const progress = (index + 1) / (count + 1);
        const stagger = (index % 2 === 0 ? -1 : 1) * minDimension * 0.045;
        obstacles.push({
          kind: "capsule",
          x: this.width * (0.1 + progress * 0.8) + stagger,
          y: this.height * (0.86 - progress * 0.72) + stagger,
          halfX,
          halfY,
          radius,
        });
      }
      return obstacles;
    }

    if (layout === "rocks") {
      const count = 5 + Math.floor(amount * 11);
      const baseRadius = minDimension * (0.012 + amount * 0.018);
      for (let index = 0; index < count; index += 1) {
        const xUnit = (0.19 + index * 0.61803398875) % 1;
        const yUnit = (0.31 + index * 0.41421356237) % 1;
        const variation = 0.72 + 0.38 * (0.5 + 0.5 * Math.sin(index * 2.17));
        obstacles.push({
          kind: "circle",
          x: this.width * (0.08 + xUnit * 0.84),
          y: this.height * (0.08 + yUnit * 0.84),
          radius: baseRadius * variation,
        });
      }
      return obstacles;
    }

    const count = 5 + Math.floor(amount * 8);
    const arcRadius = minDimension * 0.3;
    const centreX = this.width * 0.5;
    const centreY = this.height * 0.52;
    const obstacleRadius = minDimension * (0.01 + amount * 0.014);
    const capsuleHalfLength = minDimension * (0.035 + amount * 0.035);
    for (let index = 0; index < count; index += 1) {
      const progress = index / Math.max(1, count - 1);
      const angle = Math.PI * (0.18 + progress * 1.34);
      const brokenOffset = (index % 2 === 0 ? -1 : 1) * minDimension * 0.018;
      const x = centreX + Math.cos(angle) * (arcRadius + brokenOffset);
      const y = centreY + Math.sin(angle) * (arcRadius + brokenOffset);
      if (index % 3 === 1) {
        obstacles.push({
          kind: "capsule",
          x,
          y,
          halfX: -Math.sin(angle) * capsuleHalfLength,
          halfY: Math.cos(angle) * capsuleHalfLength,
          radius: obstacleRadius * 0.8,
        });
      } else {
        obstacles.push({
          kind: "circle",
          x,
          y,
          radius: obstacleRadius * (0.82 + (index % 4) * 0.09),
        });
      }
    }
    return obstacles;
  }

  private canEditCustomObstacles(x: number, y: number): boolean {
    return this.width > 0 &&
      this.height > 0 &&
      Number.isFinite(x) &&
      Number.isFinite(y);
  }

  private appendCustomObstacle(obstacle: Obstacle): boolean {
    const overlayLimit = MAX_CUSTOM_OBSTACLES - this.presetObstacles.length;
    if (overlayLimit <= 0) {
      return false;
    }
    while (this.customObstacles.length >= overlayLimit) {
      this.customObstacles.shift();
    }
    this.customObstacles.push(obstacle);
    this.rebuildObstacleComposition(true);
    return true;
  }

  private composeObstacles(): void {
    const overlayLimit = Math.max(
      0,
      MAX_CUSTOM_OBSTACLES - this.presetObstacles.length,
    );
    const overlayStart = Math.max(
      0,
      this.customObstacles.length - overlayLimit,
    );
    this.obstacles = this.presetObstacles.concat(
      this.customObstacles.slice(overlayStart),
    );
  }

  private rebuildObstacleComposition(resolvePenetration: boolean): void {
    this.composeObstacles();
    this.buildObstacleRaster(this.obstacleLayout, this.obstacleAmount);
    if (resolvePenetration) {
      for (let index = 0; index < this.boidCount; index += 1) {
        this.resolveObstaclePenetration(index);
      }
    }
    this.rasterise();
  }

  private buildObstacleRaster(layout: ObstacleLayout, amount: number): void {
    if (this.obstacles.length === 0 || this.width === 0 || this.height === 0) {
      this.obstacleRaster = new Uint8Array(0);
      this.obstacleCells = new Uint32Array(0);
      this.obstacleNormalX = new Int8Array(0);
      this.obstacleNormalY = new Int8Array(0);
      this.obstacleArrival = new Float32Array(0);
      this.obstacleOwner = new Uint16Array(0);
      this.obstacleTexture = new Int8Array(0);
      this.obstacleFleck = new Uint8Array(0);
      this.obstacleWashRing = new Uint8Array(0);
      this.obstacleFamily = new Uint8Array(0);
      this.obstacleTextureSeeds = new Uint32Array(0);
      return;
    }

    const raster = new Uint8Array(this.width * this.height);
    const cells: number[] = [];
    const normalX: number[] = [];
    const normalY: number[] = [];
    const owners: number[] = [];
    const textures: number[] = [];
    const flecks: number[] = [];
    const washRings: number[] = [];
    const families: number[] = [];
    const layoutCode = OBSTACLE_LAYOUTS.indexOf(layout);
    const baseSeed =
      Math.imul(this.width, 0x45d9f3b) ^
      Math.imul(this.height, 0x119de1f3) ^
      Math.imul(Math.round(amount * 1000), 0x3449f5) ^
      Math.imul(layoutCode + 1, 0x27d4eb2d);
    const textureSeeds = Uint32Array.from(
      this.obstacles.map((obstacle, index) =>
        this.obstacleTextureSeed(obstacle, index, baseSeed)
      ),
    );

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const pointX = x + 0.5;
        const pointY = y + 0.5;
        let nearestDistance = Number.POSITIVE_INFINITY;
        let nearestIndex = 0;
        let nearestNormalX = 0;
        let nearestNormalY = 0;

        for (let index = 0; index < this.obstacles.length; index += 1) {
          const surface = this.obstacleSurface(
            this.obstacles[index],
            pointX,
            pointY,
            0,
          );
          if (surface[0] < nearestDistance) {
            nearestDistance = surface[0];
            nearestIndex = index;
            nearestNormalX = surface[1];
            nearestNormalY = surface[2];
          }
        }

        if (nearestDistance > -OBSTACLE_CELL_GUARD) {
          continue;
        }

        const obstacle = this.obstacles[nearestIndex];
        const insetRatio = layout === "breakwaters" ? 0.26 : 0.42;
        const maximumInset = Math.max(
          OBSTACLE_CELL_GUARD,
          Math.min(OBSTACLE_RENDER_MARGIN, obstacle.radius * insetRatio),
        );
        const inset = this.obstacleRenderInset(
          layout,
          obstacle,
          nearestIndex,
          pointX,
          pointY,
          maximumInset,
          baseSeed,
        );
        const renderedDistance = nearestDistance + inset;
        if (renderedDistance > 0) {
          continue;
        }

        const cell = y * this.width + x;
        const depth = clamp(
          -renderedDistance / Math.max(2.5, obstacle.radius * 0.72),
          0,
          1,
        );
        const tone = 1 + Math.round((1 - depth) * (OBSTACLE_DEPTH_LEVELS - 1));
        const depthCrest = (tone - 1) / (OBSTACLE_DEPTH_LEVELS - 1);
        const texture = this.obstacleTextureAt(
          layout,
          obstacle,
          nearestIndex,
          pointX,
          pointY,
          depthCrest,
          textureSeeds[nearestIndex],
          baseSeed,
        );
        raster[cell] = tone;
        cells.push(cell);
        normalX.push(Math.round(nearestNormalX * 127));
        normalY.push(Math.round(nearestNormalY * 127));
        owners.push(nearestIndex);
        textures.push(texture[0]);
        flecks.push(texture[1]);
        washRings.push(texture[2]);
        families.push(
          layout === "reef" && nearestIndex < this.presetObstacles.length ? 1 : 0,
        );
      }
    }

    this.obstacleRaster = raster;
    this.obstacleCells = Uint32Array.from(cells);
    this.obstacleNormalX = Int8Array.from(normalX);
    this.obstacleNormalY = Int8Array.from(normalY);
    this.obstacleArrival = new Float32Array(cells.length);
    this.obstacleOwner = Uint16Array.from(owners);
    this.obstacleTexture = Int8Array.from(textures);
    this.obstacleFleck = Uint8Array.from(flecks);
    this.obstacleWashRing = Uint8Array.from(washRings);
    this.obstacleFamily = Uint8Array.from(families);
    this.obstacleTextureSeeds = textureSeeds;
  }

  private obstacleTextureSeed(
    obstacle: Obstacle,
    obstacleIndex: number,
    baseSeed: number,
  ): number {
    const preset = obstacleIndex < this.presetObstacles.length;
    const localIndex = preset
      ? obstacleIndex
      : obstacleIndex - this.presetObstacles.length;
    let seed = preset
      ? mixSeed(baseSeed, localIndex + 1)
      : mixSeed(
          mixSeed(Math.imul(this.width, 0x45d9f3b), this.height),
          0x6a09e667 ^ (localIndex + 1),
        );
    seed = mixSeed(seed, obstacle.kind === "circle" ? 1 : 2);
    seed = mixSeed(seed, Math.round(obstacle.x * 256));
    seed = mixSeed(seed, Math.round(obstacle.y * 256));
    seed = mixSeed(seed, Math.round(obstacle.radius * 256));
    if (obstacle.kind === "capsule") {
      seed = mixSeed(seed, Math.round(obstacle.halfX * 256));
      seed = mixSeed(seed, Math.round(obstacle.halfY * 256));
    }
    return seed;
  }

  private obstacleTextureAt(
    layout: ObstacleLayout,
    obstacle: Obstacle,
    obstacleIndex: number,
    pointX: number,
    pointY: number,
    depthCrest: number,
    seed: number,
    baseSeed: number,
  ): readonly [number, number, number] {
    const relativeX = torusDelta(obstacle.x, pointX, this.width);
    const relativeY = torusDelta(obstacle.y, pointY, this.height);
    let tangentX: number;
    let tangentY: number;
    if (obstacle.kind === "capsule") {
      const halfLength = Math.hypot(obstacle.halfX, obstacle.halfY);
      tangentX = obstacle.halfX / halfLength;
      tangentY = obstacle.halfY / halfLength;
    } else {
      const axis = hashAngle(seed, 0x243f6a88);
      tangentX = Math.cos(axis);
      tangentY = Math.sin(axis);
    }
    const along = relativeX * tangentX + relativeY * tangentY;
    const across = -relativeX * tangentY + relativeY * tangentX;
    const scale = Math.max(2.5, obstacle.radius);
    const grain = fractalValueNoise(
      pointX,
      pointY,
      Math.max(1.8, scale * 0.34),
      seed ^ 0x13198a2e,
    );
    const bandCount = 2.8 + ((seed >>> 4) & 7) * 0.34;
    const bandPhase = hashAngle(seed, 0x9e3779b9);
    const striation = Math.sin(
      (across / scale) * Math.PI * bandCount +
        bandPhase +
        (grain - 0.5) * 1.7 +
        Math.sin((along / scale) * Math.PI * 0.7 + bandPhase) * 0.3,
    );
    const pitNoise = fractalValueNoise(
      pointX,
      pointY,
      Math.max(1.25, scale * 0.18),
      seed ^ 0xa4093822,
    );
    const pit = pitNoise > 0.67
      ? -0.52 * clamp((pitNoise - 0.67) / 0.23, 0, 1)
      : 0;
    const reefPreset = layout === "reef" && obstacleIndex < this.presetObstacles.length;
    const shared = reefPreset
      ? fractalValueNoise(
          pointX,
          pointY,
          Math.max(9, Math.min(this.width, this.height) * 0.065),
          baseSeed ^ 0x517cc1b7,
        ) - 0.5
      : 0;
    const texture = clamp(
      striation * (reefPreset ? 0.34 : 0.44) +
        (grain - 0.5) * 0.72 +
        shared * 0.58 +
        pit,
      -1,
      1,
    );
    const fleckCellX = Math.floor(pointX * 0.5);
    const fleckCellY = Math.floor(pointY * 0.5);
    const fleckNoise = valueNoiseHash(
      fleckCellX,
      fleckCellY,
      seed ^ 0x082efa98,
    );
    const fleckCluster = fractalValueNoise(
      pointX,
      pointY,
      Math.max(2, scale * 0.3),
      seed ^ 0xec4e6c89,
    );
    const fleck = fleckNoise > (reefPreset ? 0.9 : 0.935) && fleckCluster > 0.48
      ? Math.round(clamp(0.35 + fleckNoise * 0.65, 0, 1) * 255)
      : 0;
    const ring = smoothNoiseStep(clamp((depthCrest - 0.58) / 0.42, 0, 1));
    return [
      Math.round(texture * 127),
      fleck,
      Math.round(ring * 255),
    ];
  }

  private obstacleRenderInset(
    layout: ObstacleLayout,
    obstacle: Obstacle,
    obstacleIndex: number,
    pointX: number,
    pointY: number,
    maximumInset: number,
    baseSeed: number,
  ): number {
    const range = maximumInset - OBSTACLE_CELL_GUARD;
    if (range <= 0) {
      return OBSTACLE_CELL_GUARD;
    }

    const relativeX = torusDelta(obstacle.x, pointX, this.width);
    const relativeY = torusDelta(obstacle.y, pointY, this.height);
    const phase = hashAngle(baseSeed, obstacleIndex + 31);

    if (obstacle.kind === "capsule") {
      const halfLength = Math.hypot(obstacle.halfX, obstacle.halfY);
      const tangentX = obstacle.halfX / halfLength;
      const tangentY = obstacle.halfY / halfLength;
      const along = relativeX * tangentX + relativeY * tangentY;
      const wavelength = Math.max(8, halfLength * (layout === "reef" ? 1.1 : 1.65));
      const longWave = 0.5 + 0.5 * Math.sin((along / wavelength) * TWO_PI + phase);
      const roughness = fractalValueNoise(
        pointX,
        pointY,
        Math.max(5, obstacle.radius * (layout === "reef" ? 1.05 : 1.45)),
        layout === "reef"
          ? baseSeed ^ 0x517cc1b7
          : baseSeed ^ Math.imul(obstacleIndex + 1, 0x9e3779b1),
      );
      const profile = layout === "reef"
        ? longWave * 0.62 + roughness * 0.38
        : longWave * 0.82 + roughness * 0.18;
      const amplitude = layout === "reef" ? 0.72 : 0.46;
      return OBSTACLE_CELL_GUARD + range * amplitude * profile;
    }

    const angle = Math.atan2(relativeY, relativeX);
    const lobeCount = 3 + ((obstacleIndex * 5 + 2) % 6);
    const lobes = 0.5 + 0.5 * Math.sin(angle * lobeCount + phase);
    const roughness = fractalValueNoise(
      pointX,
      pointY,
      Math.max(2.2, obstacle.radius * 0.58),
      layout === "reef"
        ? baseSeed ^ 0x517cc1b7
        : baseSeed ^ Math.imul(obstacleIndex + 1, 0x9e3779b1),
    );
    let profile = lobes * 0.64 + roughness * 0.36;
    if (layout === "reef") {
      const formationAngle = Math.atan2(
        pointY - this.height * 0.52,
        pointX - this.width * 0.5,
      );
      const formation = 0.5 + 0.5 * Math.sin(formationAngle * 4 + phase * 0.25);
      profile = profile * 0.68 + formation * 0.32;
    }
    const amplitude = 0.58 + ((obstacleIndex * 7) % 5) * 0.095;
    return OBSTACLE_CELL_GUARD + range * amplitude * profile;
  }

  private obstacleSurface(
    obstacle: Obstacle,
    pointX: number,
    pointY: number,
    fallbackAngle: number,
  ): readonly [number, number, number] {
    const relativeX = torusDelta(obstacle.x, pointX, this.width);
    const relativeY = torusDelta(obstacle.y, pointY, this.height);
    let offsetX = relativeX;
    let offsetY = relativeY;

    if (obstacle.kind === "capsule") {
      const halfLengthSq = obstacle.halfX * obstacle.halfX + obstacle.halfY * obstacle.halfY;
      const projection = clamp(
        (relativeX * obstacle.halfX + relativeY * obstacle.halfY) / halfLengthSq,
        -1,
        1,
      );
      offsetX -= obstacle.halfX * projection;
      offsetY -= obstacle.halfY * projection;
    }

    const distance = Math.hypot(offsetX, offsetY);
    if (distance > 1e-6) {
      return [distance - obstacle.radius, offsetX / distance, offsetY / distance];
    }
    return [
      -obstacle.radius,
      Math.cos(fallbackAngle),
      Math.sin(fallbackAngle),
    ];
  }

  private obstacleSteer(
    boidIndex: number,
    velocityX: number,
    velocityY: number,
  ): readonly [number, number] {
    const avoidanceRadius = Math.max(10, this.maxSpeed * 0.9);
    let steerX = 0;
    let steerY = 0;

    for (let index = 0; index < this.obstacles.length; index += 1) {
      const surface = this.obstacleSurface(
        this.obstacles[index],
        this.x[boidIndex],
        this.y[boidIndex],
        hashAngle(boidIndex, index + 17),
      );
      if (surface[0] >= avoidanceRadius) {
        continue;
      }

      const ramp = clamp(1 - surface[0] / avoidanceRadius, 0, 1.35);
      const repulsion = this.maxSpeed * 0.38 * ramp * ramp;
      let tangentX = -surface[2];
      let tangentY = surface[1];
      const tangentVelocity = velocityX * tangentX + velocityY * tangentY;
      if (
        tangentVelocity < 0 ||
        (Math.abs(tangentVelocity) < 1e-6 && hashAngle(boidIndex, index) > Math.PI)
      ) {
        tangentX = -tangentX;
        tangentY = -tangentY;
      }
      const deflection = this.maxSpeed * 0.18 * ramp;
      steerX += surface[1] * repulsion + tangentX * deflection;
      steerY += surface[2] * repulsion + tangentY * deflection;
    }

    return [velocityX + steerX, velocityY + steerY];
  }

  private resolveObstaclePenetration(boidIndex: number): void {
    for (let pass = 0; pass < 4; pass += 1) {
      let moved = false;
      for (let index = 0; index < this.obstacles.length; index += 1) {
        const surface = this.obstacleSurface(
          this.obstacles[index],
          this.x[boidIndex],
          this.y[boidIndex],
          hashAngle(boidIndex, index + 101),
        );
        if (surface[0] >= 0) {
          continue;
        }

        const correction = -surface[0] + 0.05;
        this.x[boidIndex] = wrap(
          this.x[boidIndex] + surface[1] * correction,
          this.width,
        );
        this.y[boidIndex] = wrap(
          this.y[boidIndex] + surface[2] * correction,
          this.height,
        );

        const inwardVelocity = this.vx[boidIndex] * surface[1] + this.vy[boidIndex] * surface[2];
        if (inwardVelocity < 0) {
          this.vx[boidIndex] -= surface[1] * inwardVelocity;
          this.vy[boidIndex] -= surface[2] * inwardVelocity;
        }
        moved = true;
      }
      if (!moved) {
        return;
      }
    }
  }

  private seedBoids(): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const seed =
      (Math.imul(this.width, 73856093) ^
        Math.imul(this.height, 19349663) ^
        Math.imul(this.boidCount, 83492791) ^
        Math.imul(this.seed, 0x9e3779b1)) >>>
      0;
    const random = mulberry32(seed);

    if (this.initialFlocks >= 2) {
      this.seedClusteredBoids(random);
      return;
    }

    for (let i = 0; i < this.boidCount; i += 1) {
      this.x[i] = random() * this.width;
      this.y[i] = random() * this.height;

      const velocityAngle = random() * TWO_PI;
      const speed = this.maxSpeed * (0.45 + random() * 0.55);
      this.vx[i] = Math.cos(velocityAngle) * speed;
      this.vy[i] = Math.sin(velocityAngle) * speed;
    }
  }

  /** Ported from the native viewer's seedClusteredBoids: flocks start as
   * tight discs on a ring about the centre, each already heading tangentially,
   * so heading-hue colour reads as coherent lanes from the first frame. */
  private seedClusteredBoids(random: () => number): void {
    const count = this.initialFlocks;
    const centreX = this.width * 0.5;
    const centreY = this.height * 0.5;
    const ringX = this.width * 0.31;
    const ringY = this.height * 0.29;
    const spread = Math.min(this.width, this.height) * 0.085;
    const centresX = new Float64Array(count);
    const centresY = new Float64Array(count);
    const headings = new Float64Array(count);

    for (let flock = 0; flock < count; flock += 1) {
      const ringAngle =
        (TWO_PI * flock) / count + (random() - 0.5) * 0.16;
      centresX[flock] = centreX + Math.cos(ringAngle) * ringX;
      centresY[flock] = centreY + Math.sin(ringAngle) * ringY;
      headings[flock] = ringAngle + Math.PI / 2 + (random() - 0.5) * 0.35;
    }

    for (let i = 0; i < this.boidCount; i += 1) {
      const flock = i % count;
      const offsetAngle = random() * TWO_PI;
      const offsetRadius = spread * Math.sqrt(random());
      this.x[i] = wrap(
        centresX[flock] + Math.cos(offsetAngle) * offsetRadius,
        this.width,
      );
      this.y[i] = wrap(
        centresY[flock] + Math.sin(offsetAngle) * offsetRadius,
        this.height,
      );

      const velocityAngle = headings[flock] + (random() - 0.5) * 0.55;
      const speed = this.maxSpeed * (0.55 + random() * 0.35);
      this.vx[i] = Math.cos(velocityAngle) * speed;
      this.vy[i] = Math.sin(velocityAngle) * speed;
    }
  }

  private rasterise(): void {
    this.state.fill(0);

    if (this.width === 0 || this.height === 0) {
      return;
    }

    for (let i = 0; i < this.boidCount; i += 1) {
      const x = Math.floor(this.x[i]);
      const y = Math.floor(this.y[i]);
      const index = (y * this.width + x) * CHANNEL_COUNT;
      const speed = Math.hypot(this.vx[i], this.vy[i]);

      this.state[index] += 1;
      this.state[index + 1] += clamp(speed / this.maxSpeed, 0, 1);
      this.state[index + 2] += clamp(this.vx[i] / this.maxSpeed, -1, 1);
      this.state[index + 3] += clamp(this.vy[i] / this.maxSpeed, -1, 1);
    }

    for (let index = 0; index < this.state.length; index += CHANNEL_COUNT) {
      const count = this.state[index];
      if (count > 0) {
        this.state[index] = clamp(count, 0, 1);
        this.state[index + 1] = clamp(this.state[index + 1] / count, 0, 1);
        this.state[index + 2] = clamp(this.state[index + 2] / count, -1, 1);
        this.state[index + 3] = clamp(this.state[index + 3] / count, -1, 1);
      }
    }

    for (let index = 0; index < this.obstacleCells.length; index += 1) {
      this.obstacleArrival[index] = this.sampleObstacleArrival(index);
    }

    for (let index = 0; index < this.obstacleCells.length; index += 1) {
      const cell = this.obstacleCells[index];
      const offset = cell * CHANNEL_COUNT;
      const depthCrest =
        (this.obstacleRaster[cell] - 1) / (OBSTACLE_DEPTH_LEVELS - 1);
      const arrival = this.obstacleArrival[index];
      const texture = this.obstacleTexture[index] / 127;
      const fleck = this.obstacleFleck[index] / 255;
      const reef = this.obstacleFamily[index] === 1;
      const textureSeed = this.obstacleTextureSeeds[this.obstacleOwner[index]];
      const mineralVariation = ((textureSeed >>> 24) / 255 - 0.5) * 0.025;
      const core = reef ? REEF_CORE : OBSTACLE_CORE;
      const crestTone = reef ? REEF_CREST : OBSTACLE_CREST;
      const crest = clamp(
        depthCrest * (0.5 + arrival * 0.34) +
          texture * (0.08 + depthCrest * 0.13) +
          fleck * 0.12,
        0,
        1,
      );
      const wash = (this.obstacleWashRing[index] / 255) * arrival * 0.38;
      const accentSpeed = fleck * (reef ? 0.075 : 0.045);
      const accentWarmth = fleck * ((reef ? 0.09 : 0.04) + mineralVariation);
      const bodyDensity = lerp(core[0], crestTone[0], crest);
      const bodySpeed = clamp(
        lerp(core[1], crestTone[1], crest) + accentSpeed,
        0,
        1,
      );
      const bodyVelocityX = clamp(
        lerp(core[2], crestTone[2], crest) + accentWarmth,
        -1,
        1,
      );
      const bodyVelocityY = clamp(
        lerp(core[3], crestTone[3], crest) + accentWarmth * 0.45,
        -1,
        1,
      );
      this.state[offset] = lerp(bodyDensity, OBSTACLE_WASH[0], wash);
      this.state[offset + 1] = lerp(bodySpeed, OBSTACLE_WASH[1], wash);
      this.state[offset + 2] = lerp(bodyVelocityX, OBSTACLE_WASH[2], wash);
      this.state[offset + 3] = lerp(bodyVelocityY, OBSTACLE_WASH[3], wash);
    }
  }

  private sampleObstacleArrival(obstacleCellIndex: number): number {
    const cell = this.obstacleCells[obstacleCellIndex];
    const cellX = cell % this.width;
    const cellY = Math.floor(cell / this.width);
    const normalX = this.obstacleNormalX[obstacleCellIndex] / 127;
    const normalY = this.obstacleNormalY[obstacleCellIndex] / 127;
    const tangentX = -normalY;
    const tangentY = normalX;
    let arrival = 0;

    for (const distance of OBSTACLE_ARRIVAL_DISTANCES) {
      for (const lateral of OBSTACLE_ARRIVAL_LATERAL) {
        const sampleX = Math.floor(wrap(
          cellX + normalX * distance + tangentX * lateral,
          this.width,
        ));
        const sampleY = Math.floor(wrap(
          cellY + normalY * distance + tangentY * lateral,
          this.height,
        ));
        const offset = (sampleY * this.width + sampleX) * CHANNEL_COUNT;
        const density = this.state[offset];
        if (density <= 0) {
          continue;
        }
        const inwardHeading = clamp(
          -(this.state[offset + 2] * normalX + this.state[offset + 3] * normalY),
          0,
          1,
        );
        arrival = Math.max(arrival, density * (0.08 + inwardHeading * 0.92));
      }
    }

    return arrival;
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new BoidsKernel();
    kernel.init(32, 32, {});

    for (let i = 0; i < 16; i += 1) {
      kernel.step(1);
    }

    const state = kernel.readState();
    let occupiedCells = 0;
    for (let index = 0; index < state.length; index += CHANNEL_COUNT) {
      if (state[index] > 0) {
        occupiedCells += 1;
      }
    }

    return occupiedCells > 1;
  } catch {
    return false;
  }
}
