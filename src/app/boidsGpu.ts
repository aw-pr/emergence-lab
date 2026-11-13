import { createProgram, createQuadVao, mustCreate } from "./webglHelpers.ts";

/**
 * Largest visual radius, in cells, the GPU engine steps. The neighbour pass
 * reads every cell inside the radius, so its cost grows with the square of it:
 * about 4 ms a step at 14 and 12 ms at 25 on an M2 Max.
 */
export const BOIDS_GPU_MAX_VISUAL_RADIUS = 16;

/** Boids per row of the state texture; one texel a boid. */
const STATE_WIDTH = 256;
/** Depth slots for the cell-lookup passes; must exceed the largest flock. */
const DEPTH_SLOTS = 65536;
/** Queued steps between flushes, so a long synchronous advance() reaches the GPU in pieces. */
const FLUSH_EVERY_STEPS = 32;

const STATE_UNIT = 4;
const CELLS_UNIT = 5;
const BINS_UNIT = 6;

/** The kernel's own latched steering values, read through its steeringConfig() accessor. */
export interface BoidsSteering {
  width: number;
  height: number;
  boidCount: number;
  visualRadius: number;
  separationRadius: number;
  maxSpeed: number;
  alignment: number;
  cohesion: number;
  separation: number;
  wanderStrength: number;
  minSpeedFraction: number;
  neighbourCandidates: number;
  binningMinBoids: number;
  seed: number;
  step: number;
}

/** What a Boids kernel offers so its flock can be stepped on the GPU and handed back. */
export interface BoidsKernelAccess {
  steeringConfig(): BoidsSteering;
  hasObstacles(): boolean;
  exportBoids(): Float32Array;
  importBoids(boids: Float32Array): boolean;
}

export function hasBoidsKernelAccess(kernel: unknown): kernel is BoidsKernelAccess {
  const candidate = kernel as Partial<Record<keyof BoidsKernelAccess, unknown>>;
  return (
    typeof candidate.steeringConfig === "function" &&
    typeof candidate.hasObstacles === "function" &&
    typeof candidate.exportBoids === "function" &&
    typeof candidate.importBoids === "function"
  );
}

/** Test handle on the canvas while the GPU engine steps the flock. */
export interface BoidsGpuHandle {
  readonly count: number;
  /** Engine steps since it was last seeded. */
  readonly steps: number;
  /** x, y, vx, vy per boid, in grid cells and cells a second. */
  read(): Float32Array;
  /** Step synchronously without presenting. */
  advance(steps: number, dt: number): void;
  /** While on, the page's frame loop presents but does not step the engine. */
  hold(on: boolean): void;
}

export interface BoidsGpuDiagnosticCanvas extends HTMLCanvasElement {
  boidsGpu?: BoidsGpuHandle;
}

export interface BoidsGpuConditions {
  /** `?simulationRenderer=gpu` is present. */
  requested: boolean;
  desktop: boolean;
  floatTargets: boolean;
  obstacleLayout: unknown;
  hasObstacles: boolean;
  visualRadius: number;
  boidCount: number;
  binningMinBoids: number;
}

/**
 * Whether the flock may step on the GPU. Everything else steps on the CPU
 * kernel: tablets and phones (they keep up), obstacle layouts and dropped
 * boulders (obstacle steering stays on the CPU), radii whose neighbour pass
 * would cost more than a frame, and flocks small enough that the kernel steers
 * them by brute force rather than through its bins.
 */
export function boidsGpuEligible(conditions: BoidsGpuConditions): boolean {
  const layout = conditions.obstacleLayout;
  return (
    conditions.requested &&
    conditions.desktop &&
    conditions.floatTargets &&
    (layout === undefined || layout === "none") &&
    !conditions.hasObstacles &&
    Number.isFinite(conditions.visualRadius) &&
    conditions.visualRadius <= BOIDS_GPU_MAX_VISUAL_RADIUS &&
    conditions.boidCount >= conditions.binningMinBoids
  );
}

/**
 * Bins per axis exactly as the kernel bins its flock: as many visual-radius
 * wide columns as fit, stretched to fill the grid.
 */
export function boidsBinGrid(
  width: number,
  height: number,
  visualRadius: number,
): { cols: number; rows: number } {
  return {
    cols: Math.floor(width / visualRadius),
    rows: Math.floor(height / visualRadius),
  };
}

function glslFloat(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

const PASS_VERTEX_SHADER = `#version 300 es
in vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// One point per boid, placed on its cell. Depth orders boids by index, so a
// LESS pass keeps the lowest index in a cell and a GREATER pass the highest:
// two boids sharing a cell are both seen.
const CELL_POINT_VERTEX_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_state;
uniform vec2 u_grid;

flat out uint v_index;

void main() {
  int i = gl_VertexID;
  vec2 position = texelFetch(u_state, ivec2(i % ${STATE_WIDTH}, i / ${STATE_WIDTH}), 0).xy;
  vec2 cell = min(floor(position), u_grid - 1.0) + 0.5;
  float depth = (float(i) + 0.5) / ${glslFloat(DEPTH_SLOTS)};
  gl_Position = vec4(cell / u_grid * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  gl_PointSize = 1.0;
  v_index = uint(i + 1);
}
`;

const CELL_POINT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

flat in uint v_index;
layout(location = 0) out uvec4 outIndex;

void main() {
  outIndex = uvec4(v_index);
}
`;

// One point per boid on the kernel's bin, added up: the candidate count the
// kernel samples its 72 from.
const BIN_POINT_VERTEX_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_state;
uniform vec2 u_binSize;
uniform vec2 u_bins;

void main() {
  int i = gl_VertexID;
  vec2 position = texelFetch(u_state, ivec2(i % ${STATE_WIDTH}, i / ${STATE_WIDTH}), 0).xy;
  vec2 bin = min(floor(position / u_binSize), u_bins - 1.0) + 0.5;
  gl_Position = vec4(bin / u_bins * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;

const BIN_POINT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

layout(location = 0) out vec4 outCount;

void main() {
  outCount = vec4(1.0, 0.0, 0.0, 0.0);
}
`;

// The kernel's computeForcesBinned + applySteer + speed floor + integration
// for one boid. The kernel draws up to 72 candidates from the nine bins around
// a boid, each with probability min(1, 72 / candidates); this pass visits
// every boid within the visual radius and keeps each with that same
// probability, so the separation push (a sum, not an average) has the same
// strength.
const STEP_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;

uniform sampler2D u_state;
uniform usampler2D u_cells;
uniform sampler2D u_binCounts;
uniform vec2 u_grid;
uniform ivec2 u_gridSize;
uniform vec2 u_binSize;
uniform ivec2 u_bins;
uniform int u_count;
uniform uint u_step;
uniform uint u_salt;
uniform float u_visualRadius;
uniform float u_separationRadius;
uniform float u_maxSpeed;
uniform float u_alignment;
uniform float u_cohesion;
uniform float u_separation;
uniform float u_wander;
uniform float u_minSpeed;
uniform float u_candidates;
uniform float u_dt;

layout(location = 0) out vec4 outState;

const float TAU = 6.283185307179586;

float hashAngle(uint a, uint b) {
  uint h = (a ^ 0x9e3779b9u) * 0x85ebca6bu;
  h ^= (b ^ 0x27d4eb2fu) * 0xc2b2ae35u;
  h ^= h >> 15u;
  h *= 0x846ca68bu;
  h ^= h >> 16u;
  return float(h) * (TAU / 4294967296.0);
}

uint mixBits(uint x) {
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

float torusDelta(float from, float to, float limit) {
  float delta = to - from;
  if (delta > limit * 0.5) delta -= limit;
  else if (delta < -limit * 0.5) delta += limit;
  return delta;
}

int wrapIndex(int value, int limit) {
  if (value < 0) return value + limit;
  if (value >= limit) return value - limit;
  return value;
}

float wrapPosition(float value, float limit) {
  if (value < 0.0) value += limit;
  else if (value >= limit) value -= limit;
  // A tiny negative plus the limit rounds to the limit in float32.
  if (value >= limit || value < 0.0) value = 0.0;
  return value;
}

vec4 boid(uint index) {
  int i = int(index);
  return texelFetch(u_state, ivec2(i % ${STATE_WIDTH}, i / ${STATE_WIDTH}), 0);
}

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  int i = texel.y * ${STATE_WIDTH} + texel.x;
  if (i >= u_count) {
    outState = vec4(0.0);
    return;
  }
  vec4 self = texelFetch(u_state, texel, 0);
  uint selfIndex = uint(i);

  ivec2 bin = min(ivec2(floor(self.xy / u_binSize)), u_bins - 1);
  float candidates = 0.0;
  for (int dr = -1; dr <= 1; dr += 1) {
    for (int dc = -1; dc <= 1; dc += 1) {
      ivec2 neighbour = ivec2(wrapIndex(bin.x + dc, u_bins.x), wrapIndex(bin.y + dr, u_bins.y));
      candidates += texelFetch(u_binCounts, neighbour, 0).r;
    }
  }
  float keep = candidates > u_candidates ? u_candidates / candidates : 1.0;
  uint threshold = keep >= 1.0 ? 0xffffffffu : uint(keep * 4294967040.0);
  uint salt = mixBits(selfIndex * 0x9e3779b1u ^ u_salt);

  float radius = u_visualRadius;
  float radiusSq = radius * radius;
  float separationSq = u_separationRadius * u_separationRadius;
  float neighbours = 0.0;
  vec2 sumVelocity = vec2(0.0);
  vec2 centre = vec2(0.0);
  vec2 repel = vec2(0.0);

  int rowFirst = int(floor(self.y - radius));
  int rowLast = int(floor(self.y + radius));
  for (int row = rowFirst; row <= rowLast; row += 1) {
    float below = float(row) - self.y;
    float above = self.y - float(row + 1);
    float gap = max(0.0, max(below, above));
    if (gap > radius) continue;
    float reach = sqrt(radiusSq - gap * gap);
    int columnFirst = int(floor(self.x - reach));
    int columnLast = int(floor(self.x + reach));
    int cellRow = wrapIndex(row, u_gridSize.y);
    for (int column = columnFirst; column <= columnLast; column += 1) {
      uvec2 ids = texelFetch(u_cells, ivec2(wrapIndex(column, u_gridSize.x), cellRow), 0).rg;
      if (ids.x == 0u) continue;
      for (int slot = 0; slot < 2; slot += 1) {
        uint id = slot == 0 ? ids.x : ids.y;
        if (slot == 1 && id == ids.x) break;
        uint j = id - 1u;
        if (j == selfIndex) continue;
        if (threshold != 0xffffffffu && mixBits(j ^ salt) > threshold) continue;
        vec4 other = boid(j);
        float dx = torusDelta(self.x, other.x, u_grid.x);
        float dy = torusDelta(self.y, other.y, u_grid.y);
        float distanceSq = dx * dx + dy * dy;
        if (distanceSq > radiusSq) continue;
        neighbours += 1.0;
        sumVelocity += other.zw;
        centre += vec2(dx, dy);
        if (distanceSq < separationSq && distanceSq > 0.0) {
          float distance = sqrt(distanceSq);
          float strength = (u_separationRadius - distance) / distance;
          repel -= vec2(dx, dy) * strength;
        }
      }
    }
  }

  vec2 velocity = self.zw;
  if (neighbours > 0.0) {
    float inverse = 1.0 / neighbours;
    vec2 average = sumVelocity * inverse;
    velocity += (average - velocity) * u_alignment;
    velocity += centre * inverse * u_cohesion;
  }
  velocity += repel * u_separation;
  float angle = hashAngle(selfIndex, u_step);
  velocity += vec2(cos(angle), sin(angle)) * (u_maxSpeed * u_wander);

  float speed = length(velocity);
  if (speed > u_maxSpeed) {
    velocity *= u_maxSpeed / speed;
    speed = u_maxSpeed;
  }
  if (speed > 0.0 && speed < u_minSpeed) {
    velocity *= u_minSpeed / speed;
  }

  vec2 position = vec2(
    wrapPosition(self.x + velocity.x * u_dt, u_grid.x),
    wrapPosition(self.y + velocity.y * u_dt, u_grid.y)
  );
  outState = vec4(position, velocity);
}
`;

// The kernel's rasterise(): an occupied cell reads density 1 and the mean of
// its boids' clamped speed and velocity, all in units of the max speed.
const PRESENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;

uniform sampler2D u_state;
uniform usampler2D u_cells;
uniform float u_maxSpeed;

layout(location = 0) out vec4 outCell;

vec4 channels(uint id) {
  int i = int(id - 1u);
  vec2 velocity = texelFetch(u_state, ivec2(i % ${STATE_WIDTH}, i / ${STATE_WIDTH}), 0).zw;
  return vec4(
    1.0,
    clamp(length(velocity) / u_maxSpeed, 0.0, 1.0),
    clamp(velocity / u_maxSpeed, -1.0, 1.0)
  );
}

void main() {
  uvec2 ids = texelFetch(u_cells, ivec2(gl_FragCoord.xy), 0).rg;
  if (ids.x == 0u) {
    outCell = vec4(0.0);
    return;
  }
  vec4 sum = channels(ids.x);
  if (ids.y != ids.x) sum = (sum + channels(ids.y)) * 0.5;
  outCell = vec4(1.0, clamp(sum.y, 0.0, 1.0), clamp(sum.zw, -1.0, 1.0));
}
`;

// Sum of every boid's clamped velocity, row by row and then over the rows:
// the flock heading the glyph shader brightens aligned boids against.
const HEADING_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_source;
uniform int u_count;
uniform int u_length;
uniform bool u_rows;
uniform float u_maxSpeed;

layout(location = 0) out vec4 outSum;

void main() {
  int line = int(gl_FragCoord.x);
  vec2 sum = vec2(0.0);
  for (int k = 0; k < u_length; k += 1) {
    if (u_rows) {
      int i = line * ${STATE_WIDTH} + k;
      if (i >= u_count) break;
      sum += clamp(texelFetch(u_source, ivec2(k, line), 0).zw / u_maxSpeed, -1.0, 1.0);
    } else {
      sum += texelFetch(u_source, ivec2(k, 0), 0).xy;
    }
  }
  outSum = vec4(sum, 0.0, 0.0);
}
`;

interface Target {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
}

interface StepUniforms {
  grid: WebGLUniformLocation;
  gridSize: WebGLUniformLocation;
  binSize: WebGLUniformLocation;
  bins: WebGLUniformLocation;
  count: WebGLUniformLocation;
  step: WebGLUniformLocation;
  salt: WebGLUniformLocation;
  visualRadius: WebGLUniformLocation;
  separationRadius: WebGLUniformLocation;
  maxSpeed: WebGLUniformLocation;
  alignment: WebGLUniformLocation;
  cohesion: WebGLUniformLocation;
  separation: WebGLUniformLocation;
  wander: WebGLUniformLocation;
  minSpeed: WebGLUniformLocation;
  candidates: WebGLUniformLocation;
  dt: WebGLUniformLocation;
}

interface HeadingUniforms {
  count: WebGLUniformLocation;
  length: WebGLUniformLocation;
  rows: WebGLUniformLocation;
  maxSpeed: WebGLUniformLocation;
}

function mix32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * The Boids flock stepped GPU-resident: positions and velocities in a pair of
 * RGBA32F textures, one texel a boid. Each step writes every boid's index onto
 * the compute grid (two per cell), counts boids per kernel bin, then steers
 * and integrates every boid in one pass. A presented grid in the kernel's
 * readState() layout is rebuilt only when the flock has moved since it was
 * last shown. Needs EXT_color_buffer_float.
 */
export class GpuBoidsSimulation {
  private readonly gl: WebGL2RenderingContext;
  private readonly cellProgram: WebGLProgram;
  private readonly binProgram: WebGLProgram;
  private readonly stepProgram: WebGLProgram;
  private readonly presentProgram: WebGLProgram;
  private readonly headingProgram: WebGLProgram;
  private readonly pointVao: WebGLVertexArrayObject;
  private readonly stepVao: WebGLVertexArrayObject;
  private readonly presentVao: WebGLVertexArrayObject;
  private readonly headingVao: WebGLVertexArrayObject;
  private readonly cellGrid: WebGLUniformLocation;
  private readonly binSize: WebGLUniformLocation;
  private readonly binGrid: WebGLUniformLocation;
  private readonly presentMaxSpeed: WebGLUniformLocation;
  private readonly stepUniforms: StepUniforms;
  private readonly headingUniforms: HeadingUniforms;
  private states: [Target, Target] | null = null;
  private cells: Target | null = null;
  private cellDepth: WebGLRenderbuffer | null = null;
  private bins: Target | null = null;
  private present: Target | null = null;
  private headingRows: Target | null = null;
  private headingTotal: Target | null = null;
  private headingBuffer: WebGLBuffer | null = null;
  private headingFence: WebGLSync | null = null;
  private readonly headingSum = new Float32Array(4);
  private heading: [number, number] = [0, 0];
  private steering: BoidsSteering | null = null;
  private stateRows = 0;
  private binCols = 0;
  private binRows = 0;
  private activeIndex = 0;
  private kernelStep = 0;
  private stepsSinceSeed = 0;
  private cellsFresh = false;
  private presentFresh = false;
  private setupFailed = false;

  constructor(gl: WebGL2RenderingContext, quadBuffer: WebGLBuffer) {
    this.gl = gl;
    this.cellProgram = createProgram(gl, CELL_POINT_VERTEX_SHADER, CELL_POINT_FRAGMENT_SHADER);
    this.binProgram = createProgram(gl, BIN_POINT_VERTEX_SHADER, BIN_POINT_FRAGMENT_SHADER);
    this.stepProgram = createProgram(gl, PASS_VERTEX_SHADER, STEP_SHADER);
    this.presentProgram = createProgram(gl, PASS_VERTEX_SHADER, PRESENT_SHADER);
    this.headingProgram = createProgram(gl, PASS_VERTEX_SHADER, HEADING_SHADER);
    this.pointVao = mustCreate(gl.createVertexArray(), "boids point vertex array");
    this.stepVao = createQuadVao(gl, this.stepProgram, quadBuffer);
    this.presentVao = createQuadVao(gl, this.presentProgram, quadBuffer);
    this.headingVao = createQuadVao(gl, this.headingProgram, quadBuffer);

    const uniform = (program: WebGLProgram, name: string): WebGLUniformLocation =>
      mustCreate(gl.getUniformLocation(program, name), `boids ${name} uniform`);

    gl.useProgram(this.cellProgram);
    gl.uniform1i(uniform(this.cellProgram, "u_state"), STATE_UNIT);
    this.cellGrid = uniform(this.cellProgram, "u_grid");

    gl.useProgram(this.binProgram);
    gl.uniform1i(uniform(this.binProgram, "u_state"), STATE_UNIT);
    this.binSize = uniform(this.binProgram, "u_binSize");
    this.binGrid = uniform(this.binProgram, "u_bins");

    const step = (name: string): WebGLUniformLocation => uniform(this.stepProgram, name);
    gl.useProgram(this.stepProgram);
    gl.uniform1i(step("u_state"), STATE_UNIT);
    gl.uniform1i(step("u_cells"), CELLS_UNIT);
    gl.uniform1i(step("u_binCounts"), BINS_UNIT);
    this.stepUniforms = {
      grid: step("u_grid"),
      gridSize: step("u_gridSize"),
      binSize: step("u_binSize"),
      bins: step("u_bins"),
      count: step("u_count"),
      step: step("u_step"),
      salt: step("u_salt"),
      visualRadius: step("u_visualRadius"),
      separationRadius: step("u_separationRadius"),
      maxSpeed: step("u_maxSpeed"),
      alignment: step("u_alignment"),
      cohesion: step("u_cohesion"),
      separation: step("u_separation"),
      wander: step("u_wander"),
      minSpeed: step("u_minSpeed"),
      candidates: step("u_candidates"),
      dt: step("u_dt"),
    };

    gl.useProgram(this.presentProgram);
    gl.uniform1i(uniform(this.presentProgram, "u_state"), STATE_UNIT);
    gl.uniform1i(uniform(this.presentProgram, "u_cells"), CELLS_UNIT);
    this.presentMaxSpeed = uniform(this.presentProgram, "u_maxSpeed");

    const heading = (name: string): WebGLUniformLocation => uniform(this.headingProgram, name);
    gl.useProgram(this.headingProgram);
    gl.uniform1i(heading("u_source"), STATE_UNIT);
    this.headingUniforms = {
      count: heading("u_count"),
      length: heading("u_length"),
      rows: heading("u_rows"),
      maxSpeed: heading("u_maxSpeed"),
    };
  }

  /** Set once state setup fails for a reason other than a lost context. */
  get failed(): boolean {
    return this.setupFailed;
  }

  get ready(): boolean {
    return this.states !== null && this.steering !== null;
  }

  get count(): number {
    return this.steering?.boidCount ?? 0;
  }

  get steps(): number {
    return this.stepsSinceSeed;
  }

  /** Unit flock heading, a frame or two behind the presented flock. */
  get meanDirection(): readonly [number, number] {
    return this.heading;
  }

  /**
   * Take over the flock from the CPU kernel: its steering values and its
   * boids as x, y, vx, vy. Returns false, leaving no state, when setup fails.
   */
  seed(steering: BoidsSteering, boids: Float32Array): boolean {
    if (this.setupFailed) return false;
    const gl = this.gl;
    const { cols, rows } = boidsBinGrid(steering.width, steering.height, steering.visualRadius);
    if (
      steering.boidCount < 1 ||
      steering.boidCount >= DEPTH_SLOTS ||
      boids.length !== steering.boidCount * 4 ||
      cols < 3 ||
      rows < 3
    ) {
      return false;
    }
    try {
      let staleErrors = 0;
      while (staleErrors < 16 && gl.getError() !== gl.NO_ERROR) staleErrors += 1;
      const stateRows = Math.ceil(steering.boidCount / STATE_WIDTH);
      const previous = this.steering;
      if (
        !this.states ||
        !previous ||
        previous.width !== steering.width ||
        previous.height !== steering.height ||
        this.stateRows !== stateRows ||
        this.binCols !== cols ||
        this.binRows !== rows
      ) {
        this.releaseState();
        this.stateRows = stateRows;
        this.binCols = cols;
        this.binRows = rows;
        this.allocate(steering.width, steering.height);
      }
      const padded = new Float32Array(STATE_WIDTH * stateRows * 4);
      padded.set(boids);
      const states = this.states;
      if (!states) throw new Error("boids state textures missing after allocation");
      this.activeIndex = 0;
      gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, states[0].texture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, STATE_WIDTH, stateRows, gl.RGBA, gl.FLOAT, padded);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) {
        throw new Error(`WebGL error 0x${error.toString(16)} while seeding boids state.`);
      }
      this.steering = { ...steering };
      this.kernelStep = steering.step;
      this.stepsSinceSeed = 0;
      this.cellsFresh = false;
      this.presentFresh = false;
      this.heading = headingOf(boids, steering.maxSpeed);
      this.dropHeadingRead();
      return true;
    } catch (error) {
      this.releaseState();
      if (!gl.isContextLost()) {
        this.setupFailed = true;
        console.error("boids: GPU state setup failed; using the CPU kernel", error);
      }
      return false;
    } finally {
      gl.activeTexture(gl.TEXTURE0);
    }
  }

  /** One kernel step at time step dt, clamped as the kernel clamps it. */
  step(dt: number): boolean {
    const steering = this.steering;
    const states = this.states;
    if (!steering || !states || !this.cells || !this.bins) return false;
    if (this.gl.isContextLost()) {
      this.releaseState();
      return false;
    }
    const timeStep = Math.min(2, Math.max(0, Number.isFinite(dt) ? dt : 1));
    const gl = this.gl;
    this.buildLookups();
    this.kernelStep += 1;
    this.stepsSinceSeed += 1;

    const target = states[1 - this.activeIndex];
    const u = this.stepUniforms;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, STATE_WIDTH, this.stateRows);
    gl.useProgram(this.stepProgram);
    gl.uniform2f(u.grid, steering.width, steering.height);
    gl.uniform2i(u.gridSize, steering.width, steering.height);
    gl.uniform2f(u.binSize, steering.width / this.binCols, steering.height / this.binRows);
    gl.uniform2i(u.bins, this.binCols, this.binRows);
    gl.uniform1i(u.count, steering.boidCount);
    gl.uniform1ui(u.step, this.kernelStep >>> 0);
    gl.uniform1ui(u.salt, mix32(Math.imul(this.kernelStep, 0x9e3779b1) ^ mix32(steering.seed)));
    gl.uniform1f(u.visualRadius, steering.visualRadius);
    gl.uniform1f(u.separationRadius, steering.separationRadius);
    gl.uniform1f(u.maxSpeed, steering.maxSpeed);
    gl.uniform1f(u.alignment, steering.alignment);
    gl.uniform1f(u.cohesion, steering.cohesion);
    gl.uniform1f(u.separation, steering.separation);
    gl.uniform1f(u.wander, steering.wanderStrength);
    gl.uniform1f(u.minSpeed, steering.maxSpeed * steering.minSpeedFraction);
    gl.uniform1f(u.candidates, steering.neighbourCandidates);
    gl.uniform1f(u.dt, timeStep);
    this.bindInputs();
    gl.bindVertexArray(this.stepVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.activeIndex = 1 - this.activeIndex;
    this.cellsFresh = false;
    this.presentFresh = false;
    if (this.stepsSinceSeed % FLUSH_EVERY_STEPS === 0) gl.flush();
    this.restoreState();
    return true;
  }

  /**
   * Bind the presented grid, in the kernel's readState() layout, to unit 0
   * for the backend's glyph shader, rebuilding it if the flock has moved.
   */
  bindForPresentation(): boolean {
    const steering = this.steering;
    if (!steering || !this.states || !this.present) return false;
    const gl = this.gl;
    if (!this.presentFresh) {
      this.buildLookups();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.present.fbo);
      gl.viewport(0, 0, steering.width, steering.height);
      gl.useProgram(this.presentProgram);
      gl.uniform1f(this.presentMaxSpeed, steering.maxSpeed);
      this.bindInputs();
      gl.bindVertexArray(this.presentVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.updateHeading();
      this.presentFresh = true;
      this.restoreState();
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.present.texture);
    return true;
  }

  /** The flock as x, y, vx, vy per boid; a synchronous read-back. */
  read(): Float32Array | null {
    const steering = this.steering;
    const states = this.states;
    if (!steering || !states) return null;
    const gl = this.gl;
    const rgba = new Float32Array(STATE_WIDTH * this.stateRows * 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, states[this.activeIndex].fbo);
    gl.readPixels(0, 0, STATE_WIDTH, this.stateRows, gl.RGBA, gl.FLOAT, rgba);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    return rgba.slice(0, steering.boidCount * 4);
  }

  releaseState(): void {
    const gl = this.gl;
    const targets = [
      ...(this.states ?? []),
      this.cells,
      this.bins,
      this.present,
      this.headingRows,
      this.headingTotal,
    ];
    for (const target of targets) {
      if (!target) continue;
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.fbo);
    }
    if (this.cellDepth) gl.deleteRenderbuffer(this.cellDepth);
    this.dropHeadingRead();
    if (this.headingBuffer) gl.deleteBuffer(this.headingBuffer);
    this.states = null;
    this.cells = null;
    this.cellDepth = null;
    this.bins = null;
    this.present = null;
    this.headingRows = null;
    this.headingTotal = null;
    this.headingBuffer = null;
    this.steering = null;
    this.stepsSinceSeed = 0;
  }

  destroy(): void {
    this.releaseState();
    const gl = this.gl;
    gl.deleteVertexArray(this.pointVao);
    gl.deleteVertexArray(this.stepVao);
    gl.deleteVertexArray(this.presentVao);
    gl.deleteVertexArray(this.headingVao);
    gl.deleteProgram(this.cellProgram);
    gl.deleteProgram(this.binProgram);
    gl.deleteProgram(this.stepProgram);
    gl.deleteProgram(this.presentProgram);
    gl.deleteProgram(this.headingProgram);
  }

  private allocate(width: number, height: number): void {
    const gl = this.gl;
    this.states = [
      this.createTarget(STATE_WIDTH, this.stateRows, gl.RGBA32F, gl.RGBA, gl.FLOAT),
      this.createTarget(STATE_WIDTH, this.stateRows, gl.RGBA32F, gl.RGBA, gl.FLOAT),
    ];
    this.cells = this.createTarget(width, height, gl.RG16UI, gl.RG_INTEGER, gl.UNSIGNED_SHORT);
    this.cellDepth = mustCreate(gl.createRenderbuffer(), "boids cell depth");
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.cellDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.cells.fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.cellDepth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("WebGL2 boids cell framebuffer is incomplete.");
    }
    this.bins = this.createTarget(this.binCols, this.binRows, gl.R16F, gl.RED, gl.HALF_FLOAT);
    this.present = this.createTarget(width, height, gl.RGBA32F, gl.RGBA, gl.FLOAT);
    this.headingRows = this.createTarget(this.stateRows, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT);
    this.headingTotal = this.createTarget(1, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT);
    this.headingBuffer = mustCreate(gl.createBuffer(), "boids heading buffer");
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.headingBuffer);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, 16, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private createTarget(
    width: number,
    height: number,
    internalFormat: number,
    format: number,
    type: number,
  ): Target {
    const gl = this.gl;
    const texture = mustCreate(gl.createTexture(), "boids texture");
    gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
    const fbo = mustCreate(gl.createFramebuffer(), "boids framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("WebGL2 boids framebuffer is incomplete.");
    }
    return { texture, fbo };
  }

  /** Index every boid onto its cell and count boids per bin, from the current state. */
  private buildLookups(): void {
    const steering = this.steering;
    const states = this.states;
    if (this.cellsFresh || !steering || !states || !this.cells || !this.bins) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, states[this.activeIndex].texture);
    gl.bindVertexArray(this.pointVao);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.cells.fbo);
    gl.viewport(0, 0, steering.width, steering.height);
    gl.clearBufferuiv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.useProgram(this.cellProgram);
    gl.uniform2f(this.cellGrid, steering.width, steering.height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clearBufferfv(gl.DEPTH, 0, [1]);
    gl.depthFunc(gl.LESS);
    gl.colorMask(true, false, false, false);
    gl.drawArrays(gl.POINTS, 0, steering.boidCount);
    gl.clearBufferfv(gl.DEPTH, 0, [0]);
    gl.depthFunc(gl.GREATER);
    gl.colorMask(false, true, false, false);
    gl.drawArrays(gl.POINTS, 0, steering.boidCount);
    gl.colorMask(true, true, true, true);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.DEPTH_TEST);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bins.fbo);
    gl.viewport(0, 0, this.binCols, this.binRows);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.useProgram(this.binProgram);
    gl.uniform2f(this.binSize, steering.width / this.binCols, steering.height / this.binRows);
    gl.uniform2f(this.binGrid, this.binCols, this.binRows);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, steering.boidCount);
    gl.disable(gl.BLEND);
    this.cellsFresh = true;
  }

  private bindInputs(): void {
    const gl = this.gl;
    if (!this.states || !this.cells || !this.bins) return;
    gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.states[this.activeIndex].texture);
    gl.activeTexture(gl.TEXTURE0 + CELLS_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.cells.texture);
    gl.activeTexture(gl.TEXTURE0 + BINS_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.bins.texture);
  }

  /**
   * Collect the last heading read if the GPU has finished it, then queue the
   * next one. Never waits: the heading trails the flock by a frame or two.
   */
  private updateHeading(): void {
    const steering = this.steering;
    const states = this.states;
    const rows = this.headingRows;
    const total = this.headingTotal;
    const buffer = this.headingBuffer;
    if (!steering || !states || !rows || !total || !buffer) return;
    const gl = this.gl;

    if (this.headingFence) {
      const status = gl.clientWaitSync(this.headingFence, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) return;
      gl.deleteSync(this.headingFence);
      this.headingFence = null;
      if (status !== gl.WAIT_FAILED) {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.headingSum);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        const magnitude = Math.hypot(this.headingSum[0], this.headingSum[1]);
        this.heading = magnitude <= 1e-6
          ? [0, 0]
          : [this.headingSum[0] / magnitude, this.headingSum[1] / magnitude];
      }
    }

    const u = this.headingUniforms;
    gl.useProgram(this.headingProgram);
    gl.uniform1i(u.count, steering.boidCount);
    gl.uniform1f(u.maxSpeed, steering.maxSpeed);
    gl.bindVertexArray(this.headingVao);
    gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, states[this.activeIndex].texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rows.fbo);
    gl.viewport(0, 0, this.stateRows, 1);
    gl.uniform1i(u.rows, 1);
    gl.uniform1i(u.length, STATE_WIDTH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindTexture(gl.TEXTURE_2D, rows.texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, total.fbo);
    gl.viewport(0, 0, 1, 1);
    gl.uniform1i(u.rows, 0);
    gl.uniform1i(u.length, this.stateRows);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, total.fbo);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    this.headingFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  }

  private dropHeadingRead(): void {
    if (this.headingFence) {
      this.gl.deleteSync(this.headingFence);
      this.headingFence = null;
    }
  }

  private restoreState(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }
}

function headingOf(boids: Float32Array, maxSpeed: number): [number, number] {
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i + 3 < boids.length; i += 4) {
    sumX += Math.max(-1, Math.min(1, boids[i + 2] / maxSpeed));
    sumY += Math.max(-1, Math.min(1, boids[i + 3] / maxSpeed));
  }
  const magnitude = Math.hypot(sumX, sumY);
  return magnitude <= 1e-6 ? [0, 0] : [sumX / magnitude, sumY / magnitude];
}

export function createGpuBoids(
  gl: WebGL2RenderingContext,
  quadBuffer: WebGLBuffer,
): GpuBoidsSimulation | null {
  try {
    return new GpuBoidsSimulation(gl, quadBuffer);
  } catch (error) {
    console.error("boids: GPU simulation setup failed; using the CPU kernel", error);
    return null;
  }
}
