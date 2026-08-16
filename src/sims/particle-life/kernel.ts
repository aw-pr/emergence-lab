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

const DEFAULT_PARTICLE_COUNT = 5901;
const DEFAULT_SPECIES = 5;
const DEFAULT_RMAX = 77;
const DEFAULT_RMIN = 45;
const DEFAULT_FORCE_SCALE = 108;
const DEFAULT_FRICTION = 0.8;
const DEFAULT_MATRIX_BIAS = 0.15;
/**
 * Sphere diameter in cells. Purely presentational: the kernel declares it for
 * the panel but never reads it, and the renderer draws the glyph from it. 4 was
 * the flat-square default and is too few pixels across to show the shading.
 */
/** Small by default: the native viewer draws each particle as a bare grid
 * cell, and that fine-grained starfield look is the reference. Larger sizes
 * bring back the lit-sphere rendering for anyone who wants it. */
const DEFAULT_POINT_SIZE = 3;

const MAX_PARTICLE_COUNT = 20000;
const MIN_SPECIES = 2;
const MAX_SPECIES = 8;
const CHANNEL_COUNT = 3;

/** Skip spatial binning below this count (brute force is cheaper for few particles). */
const BINNING_MIN_PARTICLES = 256;
/** Cap neighbours summed per particle so dense clusters stay O(N) and never freeze the tab. */
const NEIGHBOUR_LIMIT = 64;
/** Velocity ceiling as a multiple of rmax (units/sec). Bounds the energy of the
 *  system so a pathological force sum can never blow the integration up. */
const MAX_SPEED_FACTOR = 6;

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function numberParam(params: SimParams, key: string, fallback: number): number {
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

/** HSL -> RGB with s,l fixed for a vivid, well-separated species palette. */
function hueToRgb(hue: number): readonly [number, number, number] {
  const s = 0.82;
  const l = 0.58;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (wrap(hue, 360) / 60) % 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

export class ParticleLifeKernel implements SimKernel {
  readonly name = "Particle Life";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Red", "Green", "Blue"] as const;
  readonly channelRanges = [
    [0, 1],
    [0, 1],
    [0, 1],
  ] as const;
  readonly paramSchema = [
    {
      key: "particleCount",
      label: "Particle count",
      type: "number",
      default: DEFAULT_PARTICLE_COUNT,
      min: 100,
      max: MAX_PARTICLE_COUNT,
      step: 1,
      info: "How many particles populate the field. More particles make clusters and orbits denser and easier to read, at the cost of frame rate. Changing it resets the field with a fresh layout.",
    },
    {
      key: "species",
      label: "Species",
      type: "number",
      default: DEFAULT_SPECIES,
      min: MIN_SPECIES,
      max: MAX_SPECIES,
      step: 1,
      info: "How many distinct colour species exist, each with its own row of attraction/repulsion rules to every other species. More species gives richer, more chaotic ecosystems. Changing it resets the field and generates a new attraction matrix.",
    },
    {
      key: "rmax",
      label: "Interaction radius",
      type: "number",
      default: DEFAULT_RMAX,
      min: 10,
      max: 120,
      step: 1,
      group: "Interaction forces",
      info: "How far apart two particles can be and still feel each other. Larger values let structures form from more distant particles, producing bigger, slower-moving clusters. Changing it resets the field.",
    },
    {
      key: "rmin",
      label: "Repulsion radius",
      type: "number",
      default: DEFAULT_RMIN,
      min: 2,
      max: 60,
      step: 1,
      group: "Interaction forces",
      info: "The distance below which particles always push apart, regardless of species. Larger values keep clusters looser and prevent particles from ever quite touching; it is clamped below the interaction radius, so raising it too high has no further effect. Changing it resets the field.",
    },
    {
      key: "forceScale",
      label: "Force strength",
      type: "number",
      default: DEFAULT_FORCE_SCALE,
      min: 1,
      max: 160,
      step: 1,
      group: "Interaction forces",
      info: "Overall strength of every attraction and repulsion force. Higher values make particles react faster and more violently, often driving the whole field into constant swirling motion. Changing it resets the field.",
    },
    {
      key: "friction",
      label: "Friction",
      type: "number",
      default: DEFAULT_FRICTION,
      min: 0,
      max: 0.99,
      step: 0.01,
      group: "Interaction forces",
      info: "How quickly particle velocity decays each second. Near 1, particles glide almost frictionlessly and orbits persist; near 0, motion is heavily damped and particles settle quickly into static clumps. Changing it resets the field.",
    },
    {
      key: "matrixBias",
      label: "Matrix bias",
      type: "number",
      default: DEFAULT_MATRIX_BIAS,
      min: -0.5,
      max: 0.5,
      step: 0.01,
      group: "Interaction forces",
      info: "Shifts every entry of the random species attraction matrix toward attraction (positive) or repulsion (negative). Push it positive for clumpier, more cohesive ecosystems, or negative for ones that scatter apart. Changing it resets the field and reshuffles the matrix.",
    },
    {
      key: "pointSize",
      label: "Point size (px)",
      type: "number",
      default: DEFAULT_POINT_SIZE,
      min: 2,
      max: 16,
      step: 1,
      info: "On-screen size of each particle's rendered sphere; does not change the simulation's physics. Small values give fine star-like grains, larger ones shaded spheres. Changing it resets the field, like every other control here.",
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private x = new Float32Array(0);
  private y = new Float32Array(0);
  private vx = new Float32Array(0);
  private vy = new Float32Array(0);
  private species = new Uint8Array(0);
  private matrix = new Float32Array(0);
  private speciesColour = new Float32Array(MAX_SPECIES * 3);
  private binHead = new Int32Array(0);
  private binNext = new Int32Array(0);

  private seed = 0;
  private particleCount = DEFAULT_PARTICLE_COUNT;
  private speciesCount = DEFAULT_SPECIES;
  private rmax = DEFAULT_RMAX;
  private rmin = DEFAULT_RMIN;
  private forceScale = DEFAULT_FORCE_SCALE;
  private friction = DEFAULT_FRICTION;
  private matrixBias = DEFAULT_MATRIX_BIAS;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    this.particleCount = Math.floor(
      clamp(
        numberParam(params, "particleCount", DEFAULT_PARTICLE_COUNT),
        1,
        MAX_PARTICLE_COUNT,
      ),
    );
    this.speciesCount = Math.floor(
      clamp(numberParam(params, "species", DEFAULT_SPECIES), MIN_SPECIES, MAX_SPECIES),
    );
    this.rmax = clamp(numberParam(params, "rmax", DEFAULT_RMAX), 10, 120);
    this.rmin = clamp(numberParam(params, "rmin", DEFAULT_RMIN), 2, 60);
    // Repulsion radius must sit inside the interaction radius or the linear
    // attraction band collapses; keep the repulsion strictly smaller.
    if (this.rmin >= this.rmax) {
      this.rmin = this.rmax * 0.5;
    }
    this.forceScale = clamp(numberParam(params, "forceScale", DEFAULT_FORCE_SCALE), 1, 160);
    this.friction = clamp(numberParam(params, "friction", DEFAULT_FRICTION), 0, 0.99);
    this.matrixBias = clamp(
      numberParam(params, "matrixBias", DEFAULT_MATRIX_BIAS),
      -0.5,
      0.5,
    );
    // Optional run-to-run variety: a non-zero seed reshuffles BOTH the attraction
    // matrix and the initial particle field, so each load/reset is a fresh
    // ecosystem. Absent (0), seeding is a pure function of the configuration and
    // stays reproducible.
    this.seed = numberParam(params, "seed", 0) | 0;

    const length = this.width * this.height * CHANNEL_COUNT;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
    } else {
      this.state.fill(0);
    }

    if (this.x.length !== this.particleCount) {
      this.x = new Float32Array(this.particleCount);
      this.y = new Float32Array(this.particleCount);
      this.vx = new Float32Array(this.particleCount);
      this.vy = new Float32Array(this.particleCount);
      this.species = new Uint8Array(this.particleCount);
      this.binNext = new Int32Array(this.particleCount);
    }

    if (this.matrix.length !== this.speciesCount * this.speciesCount) {
      this.matrix = new Float32Array(this.speciesCount * this.speciesCount);
    }

    this.buildSpeciesColours();
    this.buildMatrix();
    this.seedParticles();
    this.rasterise();
  }

  step(dt: number): void {
    if (this.width === 0 || this.height === 0 || this.particleCount === 0) {
      return;
    }

    const timeStep = clamp(Number.isFinite(dt) ? dt : 1, 0, 2);

    const cols = Math.floor(this.width / this.rmax);
    const rows = Math.floor(this.height / this.rmax);
    if (this.particleCount >= BINNING_MIN_PARTICLES && cols >= 3 && rows >= 3) {
      this.computeForcesBinned(cols, rows, timeStep);
    } else {
      this.computeForcesBrute(timeStep);
    }

    this.integrate(timeStep);
    this.rasterise();
  }

  private computeForcesBrute(timeStep: number): void {
    const rmaxSq = this.rmax * this.rmax;
    for (let i = 0; i < this.particleCount; i += 1) {
      let fx = 0;
      let fy = 0;
      let neighbours = 0;
      const rowBase = this.species[i] * this.speciesCount;

      for (let j = 0; j < this.particleCount; j += 1) {
        if (i === j) {
          continue;
        }
        const dx = torusDelta(this.x[i], this.x[j], this.width);
        const dy = torusDelta(this.y[i], this.y[j], this.height);
        const distSq = dx * dx + dy * dy;
        if (distSq >= rmaxSq || distSq === 0) {
          continue;
        }
        const dist = Math.sqrt(distSq);
        const f = this.pairForce(dist, this.matrix[rowBase + this.species[j]]);
        const inv = f / dist;
        fx += dx * inv;
        fy += dy * inv;
        neighbours += 1;
        if (neighbours >= NEIGHBOUR_LIMIT) {
          break;
        }
      }

      this.applyForce(i, fx, fy, timeStep);
    }
  }

  private computeForcesBinned(cols: number, rows: number, timeStep: number): void {
    const binCount = cols * rows;
    if (this.binHead.length !== binCount) {
      this.binHead = new Int32Array(binCount);
    }
    this.binHead.fill(-1);

    const binWidth = this.width / cols;
    const binHeight = this.height / rows;
    const binNext = this.binNext;

    for (let i = 0; i < this.particleCount; i += 1) {
      const col = Math.min(cols - 1, Math.floor(this.x[i] / binWidth));
      const row = Math.min(rows - 1, Math.floor(this.y[i] / binHeight));
      const bin = row * cols + col;
      binNext[i] = this.binHead[bin];
      this.binHead[bin] = i;
    }

    const rmaxSq = this.rmax * this.rmax;

    for (let i = 0; i < this.particleCount; i += 1) {
      const col = Math.min(cols - 1, Math.floor(this.x[i] / binWidth));
      const row = Math.min(rows - 1, Math.floor(this.y[i] / binHeight));
      const rowBase = this.species[i] * this.speciesCount;

      let fx = 0;
      let fy = 0;
      let neighbours = 0;

      scan: for (let dr = -1; dr <= 1; dr += 1) {
        const nr = (row + dr + rows) % rows;
        for (let dc = -1; dc <= 1; dc += 1) {
          const nc = (col + dc + cols) % cols;
          let j = this.binHead[nr * cols + nc];
          while (j !== -1) {
            if (j !== i) {
              const dx = torusDelta(this.x[i], this.x[j], this.width);
              const dy = torusDelta(this.y[i], this.y[j], this.height);
              const distSq = dx * dx + dy * dy;
              if (distSq < rmaxSq && distSq > 0) {
                const dist = Math.sqrt(distSq);
                const f = this.pairForce(dist, this.matrix[rowBase + this.species[j]]);
                const inv = f / dist;
                fx += dx * inv;
                fy += dy * inv;
                neighbours += 1;
                if (neighbours >= NEIGHBOUR_LIMIT) {
                  break scan;
                }
              }
            }
            j = binNext[j];
          }
        }
      }

      this.applyForce(i, fx, fy, timeStep);
    }
  }

  /**
   * Pairwise interaction profile. Below rmin: a universal linear repulsion that
   * rises to full strength at contact. Between rmin and rmax: a symmetric tent
   * scaled by the (asymmetric) attraction coefficient `a`, peaking midway. A
   * negative return pushes apart, positive pulls together.
   */
  private pairForce(dist: number, a: number): number {
    if (dist < this.rmin) {
      return dist / this.rmin - 1;
    }
    const mid = (this.rmin + this.rmax) * 0.5;
    const halfWidth = (this.rmax - this.rmin) * 0.5;
    const coeff = clamp(a + this.matrixBias, -1, 1);
    return coeff * (1 - Math.abs(dist - mid) / halfWidth);
  }

  private applyForce(i: number, fx: number, fy: number, timeStep: number): void {
    const impulse = this.forceScale * timeStep;
    this.vx[i] += fx * impulse;
    this.vy[i] += fy * impulse;
  }

  private integrate(timeStep: number): void {
    // Friction as a damping fraction per unit time: 0 = frictionless glide,
    // approaching 1 = velocity fully quenched each second. Raising to timeStep
    // keeps the decay frame-rate independent.
    const retain = Math.pow(1 - this.friction, timeStep);
    const maxSpeed = this.rmax * MAX_SPEED_FACTOR;
    const maxSpeedSq = maxSpeed * maxSpeed;

    for (let i = 0; i < this.particleCount; i += 1) {
      let vx = this.vx[i] * retain;
      let vy = this.vy[i] * retain;

      const speedSq = vx * vx + vy * vy;
      if (speedSq > maxSpeedSq) {
        const scale = maxSpeed / Math.sqrt(speedSq);
        vx *= scale;
        vy *= scale;
      }

      this.vx[i] = vx;
      this.vy[i] = vy;
      this.x[i] = wrap(this.x[i] + vx * timeStep, this.width);
      this.y[i] = wrap(this.y[i] + vy * timeStep, this.height);
    }
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
    this.species = new Uint8Array(0);
    this.matrix = new Float32Array(0);
    this.binHead = new Int32Array(0);
    this.binNext = new Int32Array(0);
  }

  /** Copy of the attraction matrix; exposed for tests, not the renderer. */
  attractionMatrix(): Float32Array {
    return this.matrix.slice();
  }

  private buildSpeciesColours(): void {
    for (let s = 0; s < this.speciesCount; s += 1) {
      const [r, g, b] = hueToRgb((s / this.speciesCount) * 360);
      this.speciesColour[s * 3] = r;
      this.speciesColour[s * 3 + 1] = g;
      this.speciesColour[s * 3 + 2] = b;
    }
  }

  private buildMatrix(): void {
    const random = mulberry32(
      (Math.imul(this.seed, 0x9e3779b1) ^
        Math.imul(this.speciesCount, 0x85ebca77) ^
        0x2545f491) >>>
        0,
    );
    for (let a = 0; a < this.speciesCount; a += 1) {
      for (let b = 0; b < this.speciesCount; b += 1) {
        this.matrix[a * this.speciesCount + b] = random() * 2 - 1;
      }
    }
  }

  private seedParticles(): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }
    const random = mulberry32(
      (Math.imul(this.width, 73856093) ^
        Math.imul(this.height, 19349663) ^
        Math.imul(this.particleCount, 83492791) ^
        Math.imul(this.seed, 0xc2b2ae35)) >>>
        0,
    );

    for (let i = 0; i < this.particleCount; i += 1) {
      this.x[i] = random() * this.width;
      this.y[i] = random() * this.height;
      this.vx[i] = 0;
      this.vy[i] = 0;
      this.species[i] = Math.min(
        this.speciesCount - 1,
        Math.floor(random() * this.speciesCount),
      );
    }
  }

  private rasterise(): void {
    this.state.fill(0);
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const state = this.state;
    const colours = this.speciesColour;
    for (let i = 0; i < this.particleCount; i += 1) {
      const x = Math.floor(this.x[i]);
      const y = Math.floor(this.y[i]);
      const index = (y * this.width + x) * CHANNEL_COUNT;
      const c = this.species[i] * 3;
      state[index] += colours[c];
      state[index + 1] += colours[c + 1];
      state[index + 2] += colours[c + 2];
    }

    for (let index = 0; index < state.length; index += 1) {
      if (state[index] > 1) {
        state[index] = 1;
      }
    }
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new ParticleLifeKernel();
    kernel.init(48, 48, {});

    for (let i = 0; i < 16; i += 1) {
      kernel.step(0.1);
    }

    const state = kernel.readState();
    let occupied = 0;
    for (let index = 0; index < state.length; index += CHANNEL_COUNT) {
      if (state[index] > 0 || state[index + 1] > 0 || state[index + 2] > 0) {
        occupied += 1;
      }
    }
    return occupied > 1;
  } catch {
    return false;
  }
}
