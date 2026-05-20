type ParamDescriptor = {
  key: string;
  label: string;
  type: "number" | "boolean" | "enum";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
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

const DEFAULT_BOID_COUNT = 80;
const DEFAULT_VISUAL_RADIUS = 12;
const DEFAULT_SEPARATION_RADIUS = 4;
const DEFAULT_MAX_SPEED = 2;
const DEFAULT_ALIGNMENT = 0.05;
const DEFAULT_COHESION = 0.008;
const DEFAULT_SEPARATION = 0.18;
const CHANNEL_COUNT = 2;
const TWO_PI = Math.PI * 2;

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
  readonly channelLabels = ["Density", "Speed"] as const;
  readonly channelRanges = [
    [0, 1],
    [0, 1],
  ] as const;
  readonly paramSchema = [
    {
      key: "boidCount",
      label: "Boid count",
      type: "number",
      default: DEFAULT_BOID_COUNT,
      min: 1,
      max: 400,
      step: 1,
    },
    {
      key: "visualRadius",
      label: "Visual radius",
      type: "number",
      default: DEFAULT_VISUAL_RADIUS,
      min: 1,
      max: 64,
      step: 1,
    },
    {
      key: "separationRadius",
      label: "Separation radius",
      type: "number",
      default: DEFAULT_SEPARATION_RADIUS,
      min: 1,
      max: 32,
      step: 1,
    },
    {
      key: "maxSpeed",
      label: "Max speed",
      type: "number",
      default: DEFAULT_MAX_SPEED,
      min: 0.25,
      max: 8,
      step: 0.05,
    },
    {
      key: "alignment",
      label: "Alignment",
      type: "number",
      default: DEFAULT_ALIGNMENT,
      min: 0,
      max: 0.25,
      step: 0.001,
    },
    {
      key: "cohesion",
      label: "Cohesion",
      type: "number",
      default: DEFAULT_COHESION,
      min: 0,
      max: 0.05,
      step: 0.001,
    },
    {
      key: "separation",
      label: "Separation",
      type: "number",
      default: DEFAULT_SEPARATION,
      min: 0,
      max: 1,
      step: 0.001,
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
  private boidCount = DEFAULT_BOID_COUNT;
  private visualRadius = DEFAULT_VISUAL_RADIUS;
  private separationRadius = DEFAULT_SEPARATION_RADIUS;
  private maxSpeed = DEFAULT_MAX_SPEED;
  private alignment = DEFAULT_ALIGNMENT;
  private cohesion = DEFAULT_COHESION;
  private separation = DEFAULT_SEPARATION;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    this.boidCount = Math.floor(
      clamp(numberParam(params, "boidCount", DEFAULT_BOID_COUNT), 1, 400),
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
      8,
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
    }

    this.seedBoids();
    this.rasterise();
  }

  step(dt: number): void {
    if (this.width === 0 || this.height === 0 || this.boidCount === 0) {
      return;
    }

    const timeStep = clamp(Number.isFinite(dt) ? dt : 1, 0, 2);
    const nextVx = this.nextVx;
    const nextVy = this.nextVy;
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
      }

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

      const limited = limitVector(velocityX, velocityY, this.maxSpeed);
      nextVx[i] = limited[0];
      nextVy[i] = limited[1];
    }

    for (let i = 0; i < this.boidCount; i += 1) {
      this.vx[i] = nextVx[i];
      this.vy[i] = nextVy[i];
      this.x[i] = wrap(this.x[i] + this.vx[i] * timeStep, this.width);
      this.y[i] = wrap(this.y[i] + this.vy[i] * timeStep, this.height);
    }

    this.rasterise();
  }

  readState(): Float32Array {
    return this.state;
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
  }

  private seedBoids(): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const seed =
      (Math.imul(this.width, 73856093) ^
        Math.imul(this.height, 19349663) ^
        Math.imul(this.boidCount, 83492791)) >>>
      0;
    const random = mulberry32(seed);

    for (let i = 0; i < this.boidCount; i += 1) {
      this.x[i] = random() * this.width;
      this.y[i] = random() * this.height;

      const velocityAngle = random() * TWO_PI;
      const speed = this.maxSpeed * (0.45 + random() * 0.55);
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
    }

    for (let index = 0; index < this.state.length; index += CHANNEL_COUNT) {
      const count = this.state[index];
      if (count > 0) {
        this.state[index] = clamp(count, 0, 1);
        this.state[index + 1] = clamp(this.state[index + 1] / count, 0, 1);
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
