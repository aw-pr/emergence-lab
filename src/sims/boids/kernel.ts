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
  applyImpulse?(x: number, y: number, radius: number, strength: number): void;
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
const OBSTACLE_LAYOUTS = ["none", "breakwaters", "rocks", "reef"] as const;
type ObstacleLayout = (typeof OBSTACLE_LAYOUTS)[number];

type CircleObstacle = {
  kind: "circle";
  x: number;
  y: number;
  radius: number;
};

type CapsuleObstacle = {
  kind: "capsule";
  x: number;
  y: number;
  halfX: number;
  halfY: number;
  radius: number;
};

type Obstacle = CircleObstacle | CapsuleObstacle;

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
      info: "Static breakwaters, rocks, or a broken reef split the flock into persistent streams and heading domains. None leaves the released open field untouched. Changing it resets the flock.",
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
  private obstacles: Obstacle[] = [];

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
    this.obstacles = this.createObstacles(obstacleLayout, obstacleAmount);
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

  /**
   * Pointer poke: a predator swoop. Boids inside the brush disc have their
   * velocity kicked directly away from the point (radial repulsion with a soft
   * falloff), then clamped back to max speed, so the flock scatters from the
   * cursor. Distances use the torus metric to match the flocking rule. The grid
   * is re-rasterised so a paused frame reflects the scatter. Allocation-free.
   */
  applyImpulse(x: number, y: number, radius: number, strength: number): void {
    if (this.width === 0 || this.height === 0 || this.boidCount === 0) {
      return;
    }

    const s = clamp(Number.isFinite(strength) ? strength : 0, 0, 1);
    if (s <= 0) {
      return;
    }

    const r = Math.max(1, radius);
    const radiusSq = r * r;

    for (let i = 0; i < this.boidCount; i += 1) {
      const dx = torusDelta(x, this.x[i], this.width);
      const dy = torusDelta(y, this.y[i], this.height);
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) {
        continue;
      }

      const dist = Math.sqrt(distSq);
      let nx: number;
      let ny: number;
      if (dist > 1e-4) {
        nx = dx / dist;
        ny = dy / dist;
      } else {
        // Boid sitting on the point has no outward direction; scatter it along a
        // deterministic pseudo-random heading instead.
        const angle = hashAngle(i, this.stepCounter + 1);
        nx = Math.cos(angle);
        ny = Math.sin(angle);
      }

      const push = this.maxSpeed * (0.6 + 0.9 * (1 - dist / r)) * s;
      const limited = limitVector(
        this.vx[i] + nx * push,
        this.vy[i] + ny * push,
        this.maxSpeed,
      );
      this.vx[i] = limited[0];
      this.vy[i] = limited[1];
    }

    this.rasterise();
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
    this.obstacles = [];
  }

  private createObstacles(layout: ObstacleLayout, amount: number): Obstacle[] {
    if (layout === "none" || this.width === 0 || this.height === 0) {
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
