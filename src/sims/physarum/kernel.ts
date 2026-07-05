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

const DEFAULT_AGENT_COUNT = 32000;
const DEFAULT_SENSOR_ANGLE = 22.5;
const DEFAULT_SENSOR_DISTANCE = 9;
const DEFAULT_TURN_SPEED = 22.5;
const DEFAULT_MOVE_SPEED = 1;
const DEFAULT_DEPOSIT_AMOUNT = 0.22;
const DEFAULT_EVAPORATION = 0.9;
const DEFAULT_STEPS_PER_FRAME = 1;
// Hard cap so a runaway agentCount cannot freeze the tab. Sized for smooth
// 60fps at the balanced 640² grid where the 3×3 diffusion pass dominates.
const MAX_AGENT_COUNT = 80000;
const CHANNEL_COUNT = 1;
const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
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

function clampStepCount(value: number): number {
  const floored = Math.floor(value);
  if (floored < 1) {
    return 1;
  }
  if (floored > 8) {
    return 8;
  }
  return floored;
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

/** Deterministic unit-interval hash for the random-turn tie break; avoids a
 * stateful PRNG in the hot loop while staying reproducible per agent+step. */
function hashUnit(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(b ^ 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
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

export class PhysarumKernel implements SimKernel {
  readonly name = "Physarum";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Trail"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "agentCount",
      label: "Agent count",
      type: "number",
      default: DEFAULT_AGENT_COUNT,
      min: 1000,
      max: MAX_AGENT_COUNT,
      step: 1000,
    },
    {
      key: "sensorAngle",
      label: "Sensor angle (°)",
      type: "number",
      default: DEFAULT_SENSOR_ANGLE,
      min: 5,
      max: 90,
      step: 0.5,
    },
    {
      key: "sensorDistance",
      label: "Sensor distance",
      type: "number",
      default: DEFAULT_SENSOR_DISTANCE,
      min: 1,
      max: 32,
      step: 1,
    },
    {
      key: "turnSpeed",
      label: "Turn speed (°)",
      type: "number",
      default: DEFAULT_TURN_SPEED,
      min: 1,
      max: 90,
      step: 0.5,
    },
    {
      key: "moveSpeed",
      label: "Move speed",
      type: "number",
      default: DEFAULT_MOVE_SPEED,
      min: 0.25,
      max: 4,
      step: 0.05,
    },
    {
      key: "depositAmount",
      label: "Deposit amount",
      type: "number",
      default: DEFAULT_DEPOSIT_AMOUNT,
      min: 0.01,
      max: 1,
      step: 0.01,
    },
    {
      key: "evaporation",
      label: "Evaporation",
      type: "number",
      default: DEFAULT_EVAPORATION,
      min: 0.5,
      max: 0.995,
      step: 0.005,
    },
    {
      key: "stepsPerFrame",
      label: "Steps per frame",
      type: "number",
      default: DEFAULT_STEPS_PER_FRAME,
      min: 1,
      max: 8,
      step: 1,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private trail = new Float32Array(0);
  private scratch = new Float32Array(0);
  private ax = new Float32Array(0);
  private ay = new Float32Array(0);
  private heading = new Float32Array(0);
  private stepCounter = 0;
  private seed = 0;
  private agentCount = DEFAULT_AGENT_COUNT;
  private sensorAngle = DEFAULT_SENSOR_ANGLE * DEG_TO_RAD;
  private sensorDistance = DEFAULT_SENSOR_DISTANCE;
  private turnSpeed = DEFAULT_TURN_SPEED * DEG_TO_RAD;
  private moveSpeed = DEFAULT_MOVE_SPEED;
  private depositAmount = DEFAULT_DEPOSIT_AMOUNT;
  private evaporation = DEFAULT_EVAPORATION;
  private stepsPerFrame = DEFAULT_STEPS_PER_FRAME;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    this.agentCount = Math.floor(
      clamp(
        numberParam(params, "agentCount", DEFAULT_AGENT_COUNT),
        1,
        MAX_AGENT_COUNT,
      ),
    );
    this.sensorAngle =
      clamp(numberParam(params, "sensorAngle", DEFAULT_SENSOR_ANGLE), 5, 90) *
      DEG_TO_RAD;
    this.sensorDistance = clamp(
      numberParam(params, "sensorDistance", DEFAULT_SENSOR_DISTANCE),
      1,
      32,
    );
    this.turnSpeed =
      clamp(numberParam(params, "turnSpeed", DEFAULT_TURN_SPEED), 1, 90) *
      DEG_TO_RAD;
    this.moveSpeed = clamp(
      numberParam(params, "moveSpeed", DEFAULT_MOVE_SPEED),
      0.25,
      4,
    );
    this.depositAmount = clamp(
      numberParam(params, "depositAmount", DEFAULT_DEPOSIT_AMOUNT),
      0.01,
      1,
    );
    this.evaporation = clamp(
      numberParam(params, "evaporation", DEFAULT_EVAPORATION),
      0.5,
      0.995,
    );
    this.stepsPerFrame = clampStepCount(
      numberParam(params, "stepsPerFrame", DEFAULT_STEPS_PER_FRAME),
    );
    // Optional run-to-run variety: a non-zero seed shifts the initial scatter
    // so each load/reset differs. Absent (0), seeding is a pure function of the
    // grid size and agent count, keeping init reproducible.
    this.seed = numberParam(params, "seed", 0) | 0;

    const length = this.width * this.height * CHANNEL_COUNT;
    if (this.trail.length !== length) {
      this.trail = new Float32Array(length);
      this.scratch = new Float32Array(length);
    } else {
      this.trail.fill(0);
      this.scratch.fill(0);
    }

    if (this.ax.length !== this.agentCount) {
      this.ax = new Float32Array(this.agentCount);
      this.ay = new Float32Array(this.agentCount);
      this.heading = new Float32Array(this.agentCount);
    }

    this.stepCounter = 0;
    this.seedAgents();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0 || this.agentCount === 0) {
      return;
    }

    for (let s = 0; s < this.stepsPerFrame; s += 1) {
      this.stepCounter += 1;
      this.senseMoveDeposit();
      this.diffuseEvaporate();
    }
  }

  private senseMoveDeposit(): void {
    const width = this.width;
    const height = this.height;
    const trail = this.trail;
    const ax = this.ax;
    const ay = this.ay;
    const heading = this.heading;
    const sensorAngle = this.sensorAngle;
    const sensorDistance = this.sensorDistance;
    const turnSpeed = this.turnSpeed;
    const moveSpeed = this.moveSpeed;
    const deposit = this.depositAmount;
    const step = this.stepCounter;

    for (let i = 0; i < this.agentCount; i += 1) {
      const front = this.sampleTrail(
        ax[i] + Math.cos(heading[i]) * sensorDistance,
        ay[i] + Math.sin(heading[i]) * sensorDistance,
      );
      const left = this.sampleTrail(
        ax[i] + Math.cos(heading[i] + sensorAngle) * sensorDistance,
        ay[i] + Math.sin(heading[i] + sensorAngle) * sensorDistance,
      );
      const right = this.sampleTrail(
        ax[i] + Math.cos(heading[i] - sensorAngle) * sensorDistance,
        ay[i] + Math.sin(heading[i] - sensorAngle) * sensorDistance,
      );

      let h = heading[i];
      if (front >= left && front >= right) {
        // Strongest ahead: keep course.
      } else if (front < left && front < right) {
        // Both flanks beat the front: random veer keeps agents from stalling.
        h += hashUnit(i, step) < 0.5 ? turnSpeed : -turnSpeed;
      } else if (left > right) {
        h += turnSpeed;
      } else {
        h -= turnSpeed;
      }

      const nx = wrap(ax[i] + Math.cos(h) * moveSpeed, width);
      const ny = wrap(ay[i] + Math.sin(h) * moveSpeed, height);
      ax[i] = nx;
      ay[i] = ny;
      heading[i] = h;

      const cx = Math.floor(nx);
      const cy = Math.floor(ny);
      const index = cy * width + cx;
      trail[index] = clamp01(trail[index] + deposit);
    }
  }

  private sampleTrail(x: number, y: number): number {
    const width = this.width;
    const height = this.height;
    let cx = Math.floor(x) % width;
    if (cx < 0) {
      cx += width;
    }
    let cy = Math.floor(y) % height;
    if (cy < 0) {
      cy += height;
    }
    return this.trail[cy * width + cx];
  }

  private diffuseEvaporate(): void {
    const width = this.width;
    const height = this.height;
    const trail = this.trail;
    const scratch = this.scratch;
    const evaporation = this.evaporation;
    const norm = evaporation / 9;

    for (let y = 0; y < height; y += 1) {
      const yUp = y === 0 ? height - 1 : y - 1;
      const yDown = y === height - 1 ? 0 : y + 1;
      const rowUp = yUp * width;
      const row = y * width;
      const rowDown = yDown * width;

      for (let x = 0; x < width; x += 1) {
        const xLeft = x === 0 ? width - 1 : x - 1;
        const xRight = x === width - 1 ? 0 : x + 1;

        const sum =
          trail[rowUp + xLeft] +
          trail[rowUp + x] +
          trail[rowUp + xRight] +
          trail[row + xLeft] +
          trail[row + x] +
          trail[row + xRight] +
          trail[rowDown + xLeft] +
          trail[rowDown + x] +
          trail[rowDown + xRight];

        scratch[row + x] = sum * norm;
      }
    }

    trail.set(scratch);
  }

  readState(): Float32Array {
    return this.trail;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.trail = new Float32Array(0);
    this.scratch = new Float32Array(0);
    this.ax = new Float32Array(0);
    this.ay = new Float32Array(0);
    this.heading = new Float32Array(0);
  }

  private seedAgents(): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const seed =
      (Math.imul(this.width, 73856093) ^
        Math.imul(this.height, 19349663) ^
        Math.imul(this.agentCount, 83492791) ^
        Math.imul(this.seed, 0x9e3779b1)) >>>
      0;
    const random = mulberry32(seed);

    // Full-field uniform scatter with random headings: the classic Jones
    // configuration that reticulates into a spanning vein network.
    for (let i = 0; i < this.agentCount; i += 1) {
      this.ax[i] = random() * this.width;
      this.ay[i] = random() * this.height;
      this.heading[i] = random() * TWO_PI;
    }
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new PhysarumKernel();
    kernel.init(48, 48, {});

    for (let i = 0; i < 24; i += 1) {
      kernel.step(1);
    }

    const state = kernel.readState();
    let deposited = 0;
    for (let index = 0; index < state.length; index += 1) {
      if (state[index] > 0) {
        deposited += 1;
      }
    }

    return deposited > 1;
  } catch {
    return false;
  }
}
