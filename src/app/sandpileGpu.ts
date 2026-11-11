import {
  readSandpileConfig,
  sandpileHeightLevels,
  sandpileImpulseCells,
  SANDPILE_ACTIVITY_DECAY,
  SANDPILE_ACTIVITY_EPSILON,
  type SandpileConfig,
} from "../sims/abelian-sandpile/model.ts";
import { createProgram, createQuadVao, mustCreate } from "./webglHelpers.ts";

/**
 * Most synchronous rounds one advance() may queue. Twice the heaviest kernel
 * step (500 rounds), so a capped frame still runs whole steps, while a run of
 * accumulated steps cannot queue seconds of GPU work and trip a driver reset
 * that would lose the GPU-only pile.
 */
export const SANDPILE_MAX_ROUNDS_PER_ADVANCE = 1000;

/**
 * Sampler units the passes read from. The backend presents from unit 0; every
 * pass binds its own textures here, so sharing units with the Kuramoto and
 * Gray-Scott simulations is harmless.
 */
const STATE_UNIT = 4;
const DELTA_UNIT = 5;

const MAX_THRESHOLD = 12;

/** Canvas expando present while the sandpile's state lives on the GPU. */
export interface SandpileDiagnosticCanvas extends HTMLCanvasElement {
  /** Raw grain counts, one per cell, row 0 first: the kernel's cell order. */
  sandpileReadGrains?: () => Float32Array | null;
  /** Interleaved normalised height and activity, the kernel's readState() layout. */
  sandpileReadState?: () => Float32Array | null;
  /** Synchronous rounds run since the state was last seeded; impulses are not counted. */
  sandpileRoundCount?: () => number;
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

// Grain counts are whole numbers held in float32, exact to 2^24, and every
// division happens in integers: a float quotient such as 12.0 / 12.0 may come
// back a hair under 1 on some drivers and floor to the wrong bulk.
const SANDPILE_ROUND_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_state;
uniform ivec2 u_size;
uniform ivec2 u_centre;
uniform int u_threshold;
uniform int u_minTopple;
uniform int u_feed;
uniform bool u_decay;

layout(location = 0) out vec2 outState;

int grainsAt(ivec2 coord) {
  int grains = int(texelFetch(u_state, coord, 0).r);
  return coord == u_centre ? grains + u_feed : grains;
}

int shareOf(int grains) {
  if (grains < u_minTopple) return 0;
  return ((grains / u_threshold) * u_threshold) / 4;
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  vec2 state = texelFetch(u_state, coord, 0).rg;
  int grains = coord == u_centre ? int(state.r) + u_feed : int(state.r);

  float activity = state.g;
  if (u_decay) {
    activity *= ${glslFloat(SANDPILE_ACTIVITY_DECAY)};
    if (activity < ${glslFloat(SANDPILE_ACTIVITY_EPSILON)}) activity = 0.0;
  }

  int share = shareOf(grains);
  int next = grains - 4 * share;
  if (coord.x > 0) next += shareOf(grainsAt(coord - ivec2(1, 0)));
  if (coord.x < u_size.x - 1) next += shareOf(grainsAt(coord + ivec2(1, 0)));
  if (coord.y > 0) next += shareOf(grainsAt(coord - ivec2(0, 1)));
  if (coord.y < u_size.y - 1) next += shareOf(grainsAt(coord + ivec2(0, 1)));

  if (share > 0) {
    float bulk = float(grains / u_threshold);
    activity = max(activity, min(1.0, log2(bulk + 1.0) / 12.0));
  }
  outState = vec2(float(next), activity);
}
`;

const SANDPILE_IMPULSE_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_state;
uniform sampler2D u_delta;
uniform ivec2 u_origin;
uniform ivec2 u_deltaSize;

layout(location = 0) out vec2 outState;

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  vec2 state = texelFetch(u_state, coord, 0).rg;
  ivec2 local = coord - u_origin;
  if (all(greaterThanEqual(local, ivec2(0))) && all(lessThan(local, u_deltaSize))) {
    vec2 delta = texelFetch(u_delta, local, 0).rg;
    state = vec2(state.r + delta.r, max(state.g, delta.g));
  }
  outState = state;
}
`;

// Turns raw grain counts into the kernel's readState() layout, so the
// presenting program reads normalised height and activity exactly as it reads
// the CPU path's upload. The levels come from the CPU as float32, so a settled
// height matches the kernel's value bit for bit.
const SANDPILE_PRESENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_state;
uniform int u_threshold;
uniform float u_levels[${MAX_THRESHOLD}];

layout(location = 0) out vec2 outState;

void main() {
  vec2 state = texelFetch(u_state, ivec2(gl_FragCoord.xy), 0).rg;
  int residue = int(state.r) % u_threshold;
  outState = vec2(u_levels[residue], state.g);
}
`;

interface RoundUniforms {
  size: WebGLUniformLocation;
  centre: WebGLUniformLocation;
  threshold: WebGLUniformLocation;
  minTopple: WebGLUniformLocation;
  feed: WebGLUniformLocation;
  decay: WebGLUniformLocation;
}

interface ImpulseUniforms {
  origin: WebGLUniformLocation;
  deltaSize: WebGLUniformLocation;
}

interface PresentUniforms {
  threshold: WebGLUniformLocation;
  levels: WebGLUniformLocation;
}

/**
 * The Abelian sandpile stepped in a pair of RG32F textures (r = grain count,
 * g = avalanche activity), one synchronous toppling round per draw. A third
 * RG32F texture holds the presented layout and is rebuilt only when the pile
 * changed since it was last shown. Needs EXT_color_buffer_float.
 */
export class GpuSandpileSimulation {
  private readonly gl: WebGL2RenderingContext;
  private readonly roundProgram: WebGLProgram;
  private readonly roundVao: WebGLVertexArrayObject;
  private readonly impulseProgram: WebGLProgram;
  private readonly impulseVao: WebGLVertexArrayObject;
  private readonly presentProgram: WebGLProgram;
  private readonly presentVao: WebGLVertexArrayObject;
  private readonly roundUniforms: RoundUniforms;
  private readonly impulseUniforms: ImpulseUniforms;
  private readonly presentUniforms: PresentUniforms;
  private textures: [WebGLTexture, WebGLTexture] | null = null;
  private fbos: [WebGLFramebuffer, WebGLFramebuffer] | null = null;
  private presentTexture: WebGLTexture | null = null;
  private presentFbo: WebGLFramebuffer | null = null;
  private deltaTexture: WebGLTexture | null = null;
  private width = 0;
  private height = 0;
  private activeIndex = 0;
  private config: SandpileConfig | null = null;
  private heightLevels: Float32Array = new Float32Array(0);
  private rounds = 0;
  private presentStale = true;
  private setupFailed = false;

  constructor(gl: WebGL2RenderingContext, quadBuffer: WebGLBuffer) {
    this.gl = gl;
    this.roundProgram = createProgram(gl, PASS_VERTEX_SHADER, SANDPILE_ROUND_SHADER);
    this.roundVao = createQuadVao(gl, this.roundProgram, quadBuffer);
    this.impulseProgram = createProgram(gl, PASS_VERTEX_SHADER, SANDPILE_IMPULSE_SHADER);
    this.impulseVao = createQuadVao(gl, this.impulseProgram, quadBuffer);
    this.presentProgram = createProgram(gl, PASS_VERTEX_SHADER, SANDPILE_PRESENT_SHADER);
    this.presentVao = createQuadVao(gl, this.presentProgram, quadBuffer);

    const round = (name: string): WebGLUniformLocation =>
      mustCreate(gl.getUniformLocation(this.roundProgram, name), `sandpile ${name} uniform`);
    this.roundUniforms = {
      size: round("u_size"),
      centre: round("u_centre"),
      threshold: round("u_threshold"),
      minTopple: round("u_minTopple"),
      feed: round("u_feed"),
      decay: round("u_decay"),
    };
    gl.useProgram(this.roundProgram);
    gl.uniform1i(round("u_state"), STATE_UNIT);

    const impulse = (name: string): WebGLUniformLocation =>
      mustCreate(gl.getUniformLocation(this.impulseProgram, name), `sandpile ${name} uniform`);
    this.impulseUniforms = {
      origin: impulse("u_origin"),
      deltaSize: impulse("u_deltaSize"),
    };
    gl.useProgram(this.impulseProgram);
    gl.uniform1i(impulse("u_state"), STATE_UNIT);
    gl.uniform1i(impulse("u_delta"), DELTA_UNIT);

    const present = (name: string): WebGLUniformLocation =>
      mustCreate(gl.getUniformLocation(this.presentProgram, name), `sandpile ${name} uniform`);
    this.presentUniforms = {
      threshold: present("u_threshold"),
      levels: present("u_levels"),
    };
    gl.useProgram(this.presentProgram);
    gl.uniform1i(present("u_state"), STATE_UNIT);
  }

  /** Set once state setup fails for a reason other than a lost context. */
  get failed(): boolean {
    return this.setupFailed;
  }

  get ready(): boolean {
    return this.textures !== null && this.fbos !== null && this.config !== null;
  }

  get roundCount(): number {
    return this.rounds;
  }

  /**
   * Drop the initial pile on the centre cell and latch the params, as the CPU
   * kernel's init() does. Reuses the textures when the grid size is unchanged,
   * since every slider input reseeds. Returns false, leaving no state, when
   * setup fails.
   */
  initialise(
    width: number,
    height: number,
    params: Record<string, number | boolean | string>,
  ): boolean {
    if (this.setupFailed) return false;
    const gl = this.gl;
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    try {
      const config = readSandpileConfig(params);
      let staleErrors = 0;
      while (staleErrors < 16 && gl.getError() !== gl.NO_ERROR) staleErrors += 1;
      if (!(this.textures && this.fbos && nextWidth === this.width && nextHeight === this.height)) {
        this.releaseState();
        this.width = nextWidth;
        this.height = nextHeight;
        this.allocateState();
      }
      this.seed(config.initialPile);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) {
        throw new Error(`WebGL error 0x${error.toString(16)} while seeding sandpile state.`);
      }
      this.latchConfig(config);
      this.rounds = 0;
      this.presentStale = true;
      return true;
    } catch (error) {
      this.releaseState();
      if (!gl.isContextLost()) {
        this.setupFailed = true;
        console.error("abelian-sandpile: GPU state setup failed; using the CPU kernel", error);
      }
      return false;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  /** Run `steps` kernel steps (each roundsPerStep synchronous rounds), capped per call. */
  advance(steps: number): boolean {
    const config = this.config;
    if (!this.ready || !config) return false;
    const requested = Math.max(0, Math.floor(steps));
    if (requested === 0) return true;
    const stepCap = Math.max(1, Math.floor(SANDPILE_MAX_ROUNDS_PER_ADVANCE / config.roundsPerStep));
    this.runSteps(Math.min(requested, stepCap), config);
    return true;
  }

  applyImpulse(x: number, y: number, radius: number, strength: number): boolean {
    const config = this.config;
    if (!this.ready || !config) return false;
    const cells = sandpileImpulseCells(
      this.width,
      this.height,
      config.toppleThreshold,
      x,
      y,
      radius,
      strength,
    );
    if (cells.length === 0) return true;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const cell of cells) {
      minX = Math.min(minX, cell.x);
      minY = Math.min(minY, cell.y);
      maxX = Math.max(maxX, cell.x);
      maxY = Math.max(maxY, cell.y);
    }
    const deltaWidth = maxX - minX + 1;
    const deltaHeight = maxY - minY + 1;
    const delta = new Float32Array(deltaWidth * deltaHeight * 2);
    for (const cell of cells) {
      const offset = ((cell.y - minY) * deltaWidth + (cell.x - minX)) * 2;
      delta[offset] = cell.grains;
      delta[offset + 1] = cell.activity;
    }

    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + DELTA_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.deltaTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, deltaWidth, deltaHeight, 0, gl.RG, gl.FLOAT, delta);
    gl.useProgram(this.impulseProgram);
    gl.uniform2i(this.impulseUniforms.origin, minX, minY);
    gl.uniform2i(this.impulseUniforms.deltaSize, deltaWidth, deltaHeight);
    this.beginPasses(this.impulseProgram, this.impulseVao);
    this.runPass();
    this.endPasses();
    gl.activeTexture(gl.TEXTURE0 + DELTA_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    this.presentStale = true;
    return true;
  }

  bindForPresentation(): boolean {
    if (!this.ready || !this.presentTexture) return false;
    if (this.presentStale) this.renderPresentation();
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.presentTexture);
    return true;
  }

  readGrains(): Float32Array | null {
    const rgba = this.readActive();
    if (!rgba) return null;
    const grains = new Float32Array(this.width * this.height);
    for (let cell = 0; cell < grains.length; cell += 1) {
      grains[cell] = rgba[cell * 4];
    }
    return grains;
  }

  /** The CPU kernel's readState() values for the grains and activity on the GPU. */
  readState(): Float32Array | null {
    const config = this.config;
    const rgba = this.readActive();
    if (!rgba || !config) return null;
    const threshold = config.toppleThreshold;
    const levels = this.heightLevels;
    const cells = this.width * this.height;
    const state = new Float32Array(cells * 2);
    for (let cell = 0; cell < cells; cell += 1) {
      state[cell * 2] = levels[rgba[cell * 4] % threshold];
      state[cell * 2 + 1] = rgba[cell * 4 + 1];
    }
    return state;
  }

  releaseState(): void {
    const gl = this.gl;
    if (this.textures) {
      gl.deleteTexture(this.textures[0]);
      gl.deleteTexture(this.textures[1]);
      this.textures = null;
    }
    if (this.fbos) {
      gl.deleteFramebuffer(this.fbos[0]);
      gl.deleteFramebuffer(this.fbos[1]);
      this.fbos = null;
    }
    if (this.presentFbo) {
      gl.deleteFramebuffer(this.presentFbo);
      this.presentFbo = null;
    }
    if (this.presentTexture) {
      gl.deleteTexture(this.presentTexture);
      this.presentTexture = null;
    }
    if (this.deltaTexture) {
      gl.deleteTexture(this.deltaTexture);
      this.deltaTexture = null;
    }
    this.width = 0;
    this.height = 0;
    this.rounds = 0;
    this.config = null;
  }

  destroy(): void {
    this.releaseState();
    this.gl.deleteVertexArray(this.roundVao);
    this.gl.deleteVertexArray(this.impulseVao);
    this.gl.deleteVertexArray(this.presentVao);
    this.gl.deleteProgram(this.roundProgram);
    this.gl.deleteProgram(this.impulseProgram);
    this.gl.deleteProgram(this.presentProgram);
  }

  private latchConfig(config: SandpileConfig): void {
    this.config = config;
    this.heightLevels = sandpileHeightLevels(config.toppleThreshold);
    const gl = this.gl;
    const uniforms = this.roundUniforms;
    gl.useProgram(this.roundProgram);
    gl.uniform2i(uniforms.size, this.width, this.height);
    gl.uniform2i(uniforms.centre, Math.floor(this.width / 2), Math.floor(this.height / 2));
    gl.uniform1i(uniforms.threshold, config.toppleThreshold);
    gl.uniform1i(uniforms.minTopple, config.minToppleGrains);
    gl.uniform1i(uniforms.feed, 0);
    gl.uniform1i(uniforms.decay, 0);

    const levels = new Float32Array(MAX_THRESHOLD);
    levels.set(this.heightLevels);
    gl.useProgram(this.presentProgram);
    gl.uniform1i(this.presentUniforms.threshold, config.toppleThreshold);
    gl.uniform1fv(this.presentUniforms.levels, levels);
  }

  /**
   * A kernel step decays activity and feeds the centre before toppling, so the
   * first round of each step carries both; the rest only topple.
   */
  private runSteps(stepCount: number, config: SandpileConfig): void {
    const gl = this.gl;
    const uniforms = this.roundUniforms;
    this.beginPasses(this.roundProgram, this.roundVao);
    for (let step = 0; step < stepCount; step += 1) {
      gl.uniform1i(uniforms.feed, config.grainsPerStep);
      gl.uniform1i(uniforms.decay, 1);
      this.runPass();
      gl.uniform1i(uniforms.feed, 0);
      gl.uniform1i(uniforms.decay, 0);
      for (let round = 1; round < config.roundsPerStep; round += 1) {
        this.runPass();
      }
    }
    this.endPasses();
    this.rounds += stepCount * config.roundsPerStep;
    this.presentStale = true;
  }

  private beginPasses(program: WebGLProgram, vao: WebGLVertexArrayObject): void {
    const gl = this.gl;
    // Blending into a 32F target is invalid without EXT_float_blend, and the
    // trail and orbit3d passes leave blend and depth toggled.
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, this.width, this.height);
    gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
  }

  private runPass(): void {
    const textures = this.textures;
    const fbos = this.fbos;
    if (!textures || !fbos) return;
    const gl = this.gl;
    const target = 1 - this.activeIndex;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[target]);
    gl.bindTexture(gl.TEXTURE_2D, textures[this.activeIndex]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.activeIndex = target;
  }

  private endPasses(): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private renderPresentation(): void {
    const textures = this.textures;
    if (!textures || !this.presentFbo) return;
    const gl = this.gl;
    this.beginPasses(this.presentProgram, this.presentVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.presentFbo);
    gl.bindTexture(gl.TEXTURE_2D, textures[this.activeIndex]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.endPasses();
    this.presentStale = false;
  }

  private seed(initialPile: number): void {
    const gl = this.gl;
    const zero = new Float32Array([0, 0, 0, 0]);
    for (const fbo of this.fbos!) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.clearBufferfv(gl.COLOR, 0, zero);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.activeIndex = 0;
    gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.textures![0]);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      Math.floor(this.width / 2),
      Math.floor(this.height / 2),
      1,
      1,
      gl.RG,
      gl.FLOAT,
      new Float32Array([initialPile, 0]),
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  private readActive(): Float32Array | null {
    if (!this.fbos || this.width === 0 || this.height === 0) return null;
    const gl = this.gl;
    const rgba = new Float32Array(this.width * this.height * 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbos[this.activeIndex]);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.FLOAT, rgba);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    return rgba;
  }

  private allocateState(): void {
    const textureA = this.createStateTexture();
    const textureB = this.createStateTexture();
    this.textures = [textureA, textureB];
    const fboA = this.createFramebuffer(textureA);
    try {
      this.fbos = [fboA, this.createFramebuffer(textureB)];
    } catch (error) {
      this.gl.deleteFramebuffer(fboA);
      throw error;
    }
    this.presentTexture = this.createStateTexture();
    this.presentFbo = this.createFramebuffer(this.presentTexture);
    this.deltaTexture = this.createStateTexture(1, 1);
  }

  private createStateTexture(width = this.width, height = this.height): WebGLTexture {
    const gl = this.gl;
    const texture = mustCreate(gl.createTexture(), "sandpile state texture");
    gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, width, height, 0, gl.RG, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    return texture;
  }

  private createFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const fbo = mustCreate(gl.createFramebuffer(), "sandpile framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo);
      throw new Error("WebGL2 sandpile framebuffer is incomplete.");
    }
    return fbo;
  }
}

/** Null, with the cause logged, when the programs fail to build. */
export function createGpuSandpile(
  gl: WebGL2RenderingContext,
  quadBuffer: WebGLBuffer,
): GpuSandpileSimulation | null {
  try {
    return new GpuSandpileSimulation(gl, quadBuffer);
  } catch (error) {
    console.error("abelian-sandpile: GPU simulation setup failed; using the CPU kernel", error);
    return null;
  }
}
