import {
  createGrayScottInitialField,
  grayScottImpulseDisc,
  grayScottPassesPerStep,
  readGrayScottConfig,
  type GrayScottConfig,
} from "../sims/gray-scott/model.ts";
import { createProgram, createQuadVao, mustCreate } from "./webglHelpers.ts";

/**
 * Most Euler passes one advance() may queue. Twice the heaviest kernel step
 * (60 steps per frame at dt 1/8 = 480 passes), so a capped frame still runs
 * whole kernel steps, while the worst slider combination (speed 8 x 480 =
 * 3,840 passes) cannot queue seconds of GPU work and trip a driver reset that
 * would lose the GPU-only state. Shipped presets peak at 160 and never hit it.
 */
export const GRAY_SCOTT_MAX_PASSES_PER_ADVANCE = 960;

/** The sampler unit both programs read state from; units 0-3 belong to the backend. */
const STATE_UNIT = 4;

/** Canvas expando present while Gray-Scott state lives on the GPU. */
export interface GrayScottDiagnosticCanvas extends HTMLCanvasElement {
  /** Interleaved U,V in row order (row 0 first), the kernel's readState() layout. */
  grayScottReadState?: (
    x?: number,
    y?: number,
    width?: number,
    height?: number,
  ) => Float32Array | null;
  /** Euler passes run since the state was last seeded; impulses are not counted. */
  grayScottPassCount?: () => number;
}

const PASS_VERTEX_SHADER = `#version 300 es
in vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// highp sampler: GLSL ES 3.00 predeclares lowp sampler2D in fragment shaders,
// and a driver that honours it would quantise U and V on every fetch.
const GRAY_SCOTT_UPDATE_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_state;
uniform ivec2 u_size;
uniform float u_du;
uniform float u_dv;
uniform float u_feed;
uniform float u_kill;
uniform float u_dt;
uniform bool u_ninePoint;

layout(location = 0) out vec2 outState;

vec2 at(int x, int y) {
  return texelFetch(u_state, ivec2(x, y), 0).rg;
}

void main() {
  int x = int(gl_FragCoord.x);
  int y = int(gl_FragCoord.y);
  int xLeft = x == 0 ? u_size.x - 1 : x - 1;
  int xRight = x == u_size.x - 1 ? 0 : x + 1;
  int yUp = y == 0 ? u_size.y - 1 : y - 1;
  int yDown = y == u_size.y - 1 ? 0 : y + 1;

  vec2 centre = at(x, y);
  vec2 edges = at(xLeft, y) + at(xRight, y) + at(x, yUp) + at(x, yDown);
  vec2 laplace;
  if (u_ninePoint) {
    vec2 diagonals =
      at(xLeft, yUp) + at(xRight, yUp) + at(xLeft, yDown) + at(xRight, yDown);
    laplace = (4.0 * edges + diagonals - 20.0 * centre) / 6.0;
  } else {
    laplace = edges - 4.0 * centre;
  }

  float u = centre.r;
  float v = centre.g;
  float reaction = u * v * v;
  outState = clamp(
    vec2(
      u + u_dt * (u_du * laplace.r - reaction + u_feed * (1.0 - u)),
      v + u_dt * (u_dv * laplace.g + reaction - (u_feed + u_kill) * v)
    ),
    0.0,
    1.0
  );
}
`;

const GRAY_SCOTT_IMPULSE_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_state;
uniform ivec2 u_impulseCentre;
uniform int u_impulseRadius;
uniform float u_impulseStrength;

layout(location = 0) out vec2 outState;

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  vec2 state = texelFetch(u_state, coord, 0).rg;
  ivec2 offset = coord - u_impulseCentre;
  if (abs(offset.x) < u_impulseRadius && abs(offset.y) < u_impulseRadius) {
    int distanceSquared = offset.x * offset.x + offset.y * offset.y;
    if (distanceSquared < u_impulseRadius * u_impulseRadius) {
      float weight =
        (1.0 - sqrt(float(distanceSquared)) / float(u_impulseRadius)) *
        u_impulseStrength;
      state = vec2(min(state.r, 1.0 - 0.5 * weight), max(state.g, 0.25 * weight));
    }
  }
  outState = state;
}
`;

interface UpdateUniforms {
  size: WebGLUniformLocation;
  du: WebGLUniformLocation;
  dv: WebGLUniformLocation;
  feed: WebGLUniformLocation;
  kill: WebGLUniformLocation;
  dt: WebGLUniformLocation;
  ninePoint: WebGLUniformLocation;
}

interface ImpulseUniforms {
  centre: WebGLUniformLocation;
  radius: WebGLUniformLocation;
  strength: WebGLUniformLocation;
}

/**
 * Gray-Scott stepped in a pair of RG32F textures (r = U, g = V), one explicit
 * Euler pass per draw, with the CPU kernel's seed, stencils, clamping and pass
 * count. Needs EXT_color_buffer_float. The presenting program reads the active
 * texture on unit 0 exactly as it reads the CPU path's RG32F upload.
 */
export class GpuGrayScottSimulation {
  private readonly gl: WebGL2RenderingContext;
  private readonly updateProgram: WebGLProgram;
  private readonly updateVao: WebGLVertexArrayObject;
  private readonly impulseProgram: WebGLProgram;
  private readonly impulseVao: WebGLVertexArrayObject;
  private readonly updateUniforms: UpdateUniforms;
  private readonly impulseUniforms: ImpulseUniforms;
  private textures: [WebGLTexture, WebGLTexture] | null = null;
  private fbos: [WebGLFramebuffer, WebGLFramebuffer] | null = null;
  private width = 0;
  private height = 0;
  private activeIndex = 0;
  private passesPerStep = 0;
  private passes = 0;
  private setupFailed = false;

  constructor(gl: WebGL2RenderingContext, quadBuffer: WebGLBuffer) {
    this.gl = gl;
    this.updateProgram = createProgram(gl, PASS_VERTEX_SHADER, GRAY_SCOTT_UPDATE_SHADER);
    this.updateVao = createQuadVao(gl, this.updateProgram, quadBuffer);
    this.impulseProgram = createProgram(gl, PASS_VERTEX_SHADER, GRAY_SCOTT_IMPULSE_SHADER);
    this.impulseVao = createQuadVao(gl, this.impulseProgram, quadBuffer);

    const update = (name: string): WebGLUniformLocation =>
      mustCreate(gl.getUniformLocation(this.updateProgram, name), `Gray-Scott ${name} uniform`);
    this.updateUniforms = {
      size: update("u_size"),
      du: update("u_du"),
      dv: update("u_dv"),
      feed: update("u_feed"),
      kill: update("u_kill"),
      dt: update("u_dt"),
      ninePoint: update("u_ninePoint"),
    };
    gl.useProgram(this.updateProgram);
    gl.uniform1i(update("u_state"), STATE_UNIT);

    const impulse = (name: string): WebGLUniformLocation =>
      mustCreate(gl.getUniformLocation(this.impulseProgram, name), `Gray-Scott ${name} uniform`);
    this.impulseUniforms = {
      centre: impulse("u_impulseCentre"),
      radius: impulse("u_impulseRadius"),
      strength: impulse("u_impulseStrength"),
    };
    gl.useProgram(this.impulseProgram);
    gl.uniform1i(impulse("u_state"), STATE_UNIT);
  }

  /** Set once state setup fails for a reason other than a lost context. */
  get failed(): boolean {
    return this.setupFailed;
  }

  get ready(): boolean {
    return this.textures !== null && this.fbos !== null;
  }

  get passCount(): number {
    return this.passes;
  }

  /**
   * Seed the field and latch the params, as the CPU kernel's init() does.
   * Reuses the textures when the grid size is unchanged, since every slider
   * input reseeds. Returns false, leaving no state, when setup fails.
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
      const seed = createGrayScottInitialField(nextWidth, nextHeight);
      let staleErrors = 0;
      while (staleErrors < 16 && gl.getError() !== gl.NO_ERROR) staleErrors += 1;
      if (this.ready && nextWidth === this.width && nextHeight === this.height) {
        gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, this.textures![0]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nextWidth, nextHeight, gl.RG, gl.FLOAT, seed);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
      } else {
        this.releaseState();
        this.width = nextWidth;
        this.height = nextHeight;
        this.allocateState(seed);
      }
      const error = gl.getError();
      if (error !== gl.NO_ERROR) {
        throw new Error(`WebGL error 0x${error.toString(16)} while seeding Gray-Scott state.`);
      }
      this.latchConfig(readGrayScottConfig(params));
      this.activeIndex = 0;
      this.passes = 0;
      return true;
    } catch (error) {
      this.releaseState();
      if (!gl.isContextLost()) {
        this.setupFailed = true;
        console.error("gray-scott: GPU state setup failed; using the CPU kernel", error);
      }
      return false;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  /** Run `steps` kernel steps (each stepsPerFrame / dt Euler passes), capped per call. */
  advance(steps: number): boolean {
    if (!this.ready) return false;
    const passesPerStep = this.passesPerStep;
    if (passesPerStep <= 0) return true;
    const requested = Math.max(0, Math.floor(steps));
    const stepCap = Math.max(1, Math.floor(GRAY_SCOTT_MAX_PASSES_PER_ADVANCE / passesPerStep));
    const passes = Math.min(requested, stepCap) * passesPerStep;
    if (passes === 0) return true;
    this.runPasses(this.updateProgram, this.updateVao, passes);
    this.passes += passes;
    return true;
  }

  applyImpulse(x: number, y: number, radius: number, strength: number): boolean {
    if (!this.ready) return false;
    const disc = grayScottImpulseDisc(x, y, radius, strength);
    if (!disc) return true;
    const gl = this.gl;
    gl.useProgram(this.impulseProgram);
    gl.uniform2i(this.impulseUniforms.centre, disc.centreX, disc.centreY);
    gl.uniform1i(this.impulseUniforms.radius, disc.radius);
    gl.uniform1f(this.impulseUniforms.strength, disc.strength);
    this.runPasses(this.impulseProgram, this.impulseVao, 1);
    return true;
  }

  bindForPresentation(): boolean {
    if (!this.textures) return false;
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[this.activeIndex]);
    return true;
  }

  readState(
    x = 0,
    y = 0,
    width = this.width,
    height = this.height,
  ): Float32Array | null {
    if (!this.fbos) return null;
    const gl = this.gl;
    const rgba = new Float32Array(width * height * 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbos[this.activeIndex]);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.FLOAT, rgba);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    const state = new Float32Array(width * height * 2);
    for (let cell = 0; cell < width * height; cell += 1) {
      state[cell * 2] = rgba[cell * 4];
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
    this.width = 0;
    this.height = 0;
    this.passes = 0;
  }

  destroy(): void {
    this.releaseState();
    this.gl.deleteVertexArray(this.updateVao);
    this.gl.deleteVertexArray(this.impulseVao);
    this.gl.deleteProgram(this.updateProgram);
    this.gl.deleteProgram(this.impulseProgram);
  }

  private latchConfig(config: GrayScottConfig): void {
    const passesPerStep = grayScottPassesPerStep(config);
    // A NaN stepsPerFrame makes the CPU kernel's loop run zero passes.
    this.passesPerStep = Number.isFinite(passesPerStep) && passesPerStep > 0 ? passesPerStep : 0;
    const gl = this.gl;
    const uniforms = this.updateUniforms;
    gl.useProgram(this.updateProgram);
    gl.uniform2i(uniforms.size, this.width, this.height);
    gl.uniform1f(uniforms.du, config.du);
    gl.uniform1f(uniforms.dv, config.dv);
    gl.uniform1f(uniforms.feed, config.feed);
    gl.uniform1f(uniforms.kill, config.kill);
    gl.uniform1f(uniforms.dt, config.dt);
    gl.uniform1i(uniforms.ninePoint, config.stencil === "nine-point" ? 1 : 0);
  }

  private allocateState(seed: Float32Array): void {
    const textureA = this.createStateTexture(seed);
    const textureB = this.createStateTexture(null);
    this.textures = [textureA, textureB];
    const fboA = this.createFramebuffer(textureA);
    try {
      this.fbos = [fboA, this.createFramebuffer(textureB)];
    } catch (error) {
      this.gl.deleteFramebuffer(fboA);
      throw error;
    }
  }

  private runPasses(
    program: WebGLProgram,
    vao: WebGLVertexArrayObject,
    count: number,
  ): void {
    const textures = this.textures;
    const fbos = this.fbos;
    if (!textures || !fbos) return;
    const gl = this.gl;
    // Blending into a 32F target is invalid without EXT_float_blend, and the
    // trail and orbit3d passes leave blend and depth toggled.
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, this.width, this.height);
    gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
    for (let pass = 0; pass < count; pass += 1) {
      const target = 1 - this.activeIndex;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[target]);
      gl.bindTexture(gl.TEXTURE_2D, textures[this.activeIndex]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.activeIndex = target;
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private createStateTexture(data: Float32Array | null): WebGLTexture {
    const gl = this.gl;
    const texture = mustCreate(gl.createTexture(), "Gray-Scott state texture");
    gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, this.width, this.height, 0, gl.RG, gl.FLOAT, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    return texture;
  }

  private createFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const fbo = mustCreate(gl.createFramebuffer(), "Gray-Scott framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo);
      throw new Error("WebGL2 Gray-Scott framebuffer is incomplete.");
    }
    return fbo;
  }
}

/** Null, with the cause logged, when the programs fail to build. */
export function createGpuGrayScott(
  gl: WebGL2RenderingContext,
  quadBuffer: WebGLBuffer,
): GpuGrayScottSimulation | null {
  try {
    return new GpuGrayScottSimulation(gl, quadBuffer);
  } catch (error) {
    console.error("gray-scott: GPU simulation setup failed; using the CPU kernel", error);
    return null;
  }
}
