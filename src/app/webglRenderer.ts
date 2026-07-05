import type { ColourMapOptions, ColourPreset } from "./colormap.ts";
import {
  containRect,
  type RenderMode,
  type RendererBackend,
  type RendererBackendFrame,
} from "./rendererBackend.ts";
import type { SimKernel } from "./types.ts";

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_state;
uniform vec2 u_sourceSize;
uniform int u_channelCount;
uniform vec2 u_ranges[4];
uniform int u_preset;
uniform bool u_invert;
uniform float u_gamma;
uniform float u_contrast;
uniform bool u_paletteCycleReverse;
uniform int u_dotRadius;
uniform bool u_smoothSampling;
uniform float u_palettePhase;
uniform bool u_boidsGlyph;
uniform float u_boidsGlyphRadius;
uniform vec2 u_boidsMeanDir;

in vec2 v_uv;
out vec4 outColor;

float clamp01(float value) {
  return clamp(value, 0.0, 1.0);
}

float normalise(float value, vec2 range) {
  if (range.y == range.x) return 0.0;
  return clamp01((value - range.x) / (range.y - range.x));
}

float adjust(float value) {
  float gamma = clamp(u_gamma, 0.1, 4.0);
  float contrast = clamp(u_contrast, 0.0, 4.0);
  float inverted = u_invert ? 1.0 - value : value;
  float corrected = pow(clamp01(inverted), 1.0 / gamma);
  return clamp01((corrected - 0.5) * contrast + 0.5);
}

vec3 mixRgb(vec3 left, vec3 right, float t) {
  return mix(left, right, clamp01(t));
}

vec3 rampColour(int preset, float t) {
  float x = clamp01(t);

  if (preset == 1) {
    if (x <= 0.25) return mixRgb(vec3(13.0, 8.0, 135.0), vec3(126.0, 3.0, 168.0), x / 0.25) / 255.0;
    if (x <= 0.5) return mixRgb(vec3(126.0, 3.0, 168.0), vec3(204.0, 71.0, 120.0), (x - 0.25) / 0.25) / 255.0;
    if (x <= 0.75) return mixRgb(vec3(204.0, 71.0, 120.0), vec3(248.0, 149.0, 64.0), (x - 0.5) / 0.25) / 255.0;
    return mixRgb(vec3(248.0, 149.0, 64.0), vec3(240.0, 249.0, 33.0), (x - 0.75) / 0.25) / 255.0;
  }

  if (preset == 2) {
    if (x <= 0.25) return mixRgb(vec3(0.0, 0.0, 4.0), vec3(87.0, 15.0, 109.0), x / 0.25) / 255.0;
    if (x <= 0.5) return mixRgb(vec3(87.0, 15.0, 109.0), vec3(187.0, 55.0, 84.0), (x - 0.25) / 0.25) / 255.0;
    if (x <= 0.75) return mixRgb(vec3(187.0, 55.0, 84.0), vec3(249.0, 142.0, 8.0), (x - 0.5) / 0.25) / 255.0;
    return mixRgb(vec3(249.0, 142.0, 8.0), vec3(252.0, 255.0, 164.0), (x - 0.75) / 0.25) / 255.0;
  }

  if (preset == 3) {
    if (x <= 0.35) return mixRgb(vec3(2.0, 6.0, 23.0), vec3(20.0, 84.0, 150.0), x / 0.35) / 255.0;
    if (x <= 0.7) return mixRgb(vec3(20.0, 84.0, 150.0), vec3(42.0, 220.0, 220.0), (x - 0.35) / 0.35) / 255.0;
    return mixRgb(vec3(42.0, 220.0, 220.0), vec3(245.0, 255.0, 255.0), (x - 0.7) / 0.3) / 255.0;
  }

  if (preset == 4) {
    if (x <= 0.28) return mixRgb(vec3(18.0, 10.0, 4.0), vec3(92.0, 35.0, 8.0), x / 0.28) / 255.0;
    if (x <= 0.62) return mixRgb(vec3(92.0, 35.0, 8.0), vec3(238.0, 156.0, 24.0), (x - 0.28) / 0.34) / 255.0;
    return mixRgb(vec3(238.0, 156.0, 24.0), vec3(255.0, 246.0, 184.0), (x - 0.62) / 0.38) / 255.0;
  }

  if (preset == 5) {
    if (x <= 0.45) return mixRgb(vec3(3.0, 7.0, 18.0), vec3(20.0, 26.0, 38.0), x / 0.45) / 255.0;
    if (x <= 0.55) return mixRgb(vec3(20.0, 26.0, 38.0), vec3(236.0, 248.0, 255.0), (x - 0.45) / 0.1) / 255.0;
    return mixRgb(vec3(236.0, 248.0, 255.0), vec3(255.0, 255.0, 255.0), (x - 0.55) / 0.45) / 255.0;
  }

  if (preset == 8) {
    if (x <= 0.5) return mixRgb(vec3(0.0, 0.0, 0.0), vec3(255.0, 136.0, 0.0), x / 0.5) / 255.0;
    return mixRgb(vec3(255.0, 136.0, 0.0), vec3(255.0, 255.0, 255.0), (x - 0.5) / 0.5) / 255.0;
  }

  if (x <= 0.28) return mixRgb(vec3(68.0, 1.0, 84.0), vec3(59.0, 82.0, 139.0), x / 0.28) / 255.0;
  if (x <= 0.55) return mixRgb(vec3(59.0, 82.0, 139.0), vec3(33.0, 145.0, 140.0), (x - 0.28) / 0.27) / 255.0;
  if (x <= 0.78) return mixRgb(vec3(33.0, 145.0, 140.0), vec3(94.0, 201.0, 98.0), (x - 0.55) / 0.23) / 255.0;
  return mixRgb(vec3(94.0, 201.0, 98.0), vec3(253.0, 231.0, 37.0), (x - 0.78) / 0.22) / 255.0;
}

vec4 readChannels(ivec2 coord) {
  return texelFetch(u_state, coord, 0);
}

vec4 sampleChannels(vec2 uv) {
  vec2 source = uv * u_sourceSize - 0.5;
  vec2 base = floor(source);
  vec2 f = fract(source);
  ivec2 c00 = ivec2(clamp(base, vec2(0.0), u_sourceSize - vec2(1.0)));
  ivec2 c10 = ivec2(clamp(base + vec2(1.0, 0.0), vec2(0.0), u_sourceSize - vec2(1.0)));
  ivec2 c01 = ivec2(clamp(base + vec2(0.0, 1.0), vec2(0.0), u_sourceSize - vec2(1.0)));
  ivec2 c11 = ivec2(clamp(base + vec2(1.0), vec2(0.0), u_sourceSize - vec2(1.0)));

  vec4 top = mix(readChannels(c00), readChannels(c10), f.x);
  vec4 bottom = mix(readChannels(c01), readChannels(c11), f.x);
  return mix(top, bottom, f.y);
}

float signalAt(vec4 raw) {
  float signal = 0.0;
  if (u_channelCount >= 1) signal = max(signal, normalise(raw.r, u_ranges[0]));
  if (u_channelCount >= 2) signal = max(signal, normalise(raw.g, u_ranges[1]));
  if (u_channelCount >= 3) signal = max(signal, normalise(raw.b, u_ranges[2]));
  if (u_channelCount >= 4) signal = max(signal, normalise(raw.a, u_ranges[3]));
  return clamp01(signal);
}

vec3 singleChannelColour(float t) {
  float base = clamp01(t);
  float shifted =
    u_palettePhase == 0.0 || base <= 0.001 || base >= 0.999
      ? base
      : fract(base + u_palettePhase);
  float value = adjust(shifted);
  int preset = (u_preset == 6 || u_preset == 7) ? 0 : u_preset;
  return rampColour(preset, value);
}

vec3 twoChannelColour(float c0, float c1) {
  if (u_preset != 6) {
    float composite = clamp01(c1 * 0.72 + (1.0 - c0) * 0.28);
    return singleChannelColour(composite);
  }

  vec3 cool = rampColour(3, adjust(1.0 - c0));
  vec3 warm = rampColour(4, adjust(c1));
  float energy = clamp01(c1 * 0.85 + (1.0 - c0) * 0.2);
  return mixRgb(cool, warm, energy);
}

vec3 threeChannelChemical(float a, float b, float c) {
  vec3 cool = rampColour(3, adjust(1.0 - a));
  vec3 warm = rampColour(4, adjust(a));
  float energy = clamp01(a * 0.85 + (1.0 - b) * 0.2);
  vec3 base = mixRgb(cool, warm, energy);
  float highlight = adjust(c);
  return mixRgb(base, vec3(1.0), clamp01(highlight * 0.55));
}

vec3 colourFromRaw(vec4 raw) {
  if (u_channelCount <= 0) return vec3(0.0);

  if (u_channelCount == 1) {
    float t = normalise(raw.r, u_ranges[0]);
    if (u_paletteCycleReverse) t = 1.0 - t;
    return singleChannelColour(t);
  }

  if (u_channelCount == 2) {
    float c0 = normalise(raw.r, u_ranges[0]);
    float c1 = normalise(raw.g, u_ranges[1]);
    return twoChannelColour(c0, c1);
  }

  float c0 = normalise(raw.r, u_ranges[0]);
  float c1 = normalise(raw.g, u_ranges[1]);
  float c2 = normalise(raw.b, u_ranges[2]);
  if (u_preset == 6) {
    return threeChannelChemical(c0, c1, c2);
  }
  if (u_preset != 7) {
    return singleChannelColour((c0 + c1 + c2) / 3.0);
  }

  return vec3(adjust(c0), adjust(c1), adjust(c2));
}

vec3 colourAt(ivec2 coord) {
  return colourFromRaw(readChannels(coord));
}

float boidAlignmentGrey(vec2 velocity) {
  float magnitude = length(velocity);
  float alignment =
    magnitude <= 0.0001 ? 0.0 : dot(velocity / magnitude, u_boidsMeanDir);
  float t = (1.0 - alignment) * 0.5; // 0 = aligned with flock, 1 = opposed
  return (1.0 - t) * 0.95;           // bright (aligned) .. dark (opposed)
}

void main() {
  ivec2 size = ivec2(u_sourceSize);
  ivec2 coord = ivec2(clamp(floor(v_uv * u_sourceSize), vec2(0.0), u_sourceSize - vec2(1.0)));

  if (u_boidsGlyph) {
    vec3 bg = vec3(5.0, 8.0, 18.0) / 255.0;
    float halo = min(u_boidsGlyphRadius, 10.0);
    float core = u_boidsGlyphRadius * 0.2;
    int radius = int(ceil(halo + 1.0));
    vec2 fragPos = v_uv * u_sourceSize - vec2(0.5);
    float greyWeighted = 0.0;
    float weightSum = 0.0;
    float coverage = 0.0;
    for (int y = -10; y <= 10; y += 1) {
      for (int x = -10; x <= 10; x += 1) {
        if (abs(x) > radius || abs(y) > radius) continue;
        ivec2 sampleCoord = clamp(coord + ivec2(x, y), ivec2(0), size - ivec2(1));
        vec4 raw = readChannels(sampleCoord);
        if (raw.r <= 0.02) continue;

        vec2 local = fragPos - vec2(sampleCoord);
        float falloff = 1.0 - smoothstep(core, halo, length(local));
        if (falloff <= 0.0) continue;
        greyWeighted += boidAlignmentGrey(raw.ba) * falloff;
        weightSum += falloff;
        coverage = max(coverage, falloff);
      }
    }

    vec3 dotColour = weightSum > 0.0 ? vec3(greyWeighted / weightSum) : bg;
    outColor = vec4(mix(bg, dotColour, min(coverage * 0.92, 1.0)), 1.0);
    return;
  }

  if (u_dotRadius > 0) {
    vec4 raw = readChannels(coord);
    if (signalAt(raw) <= 0.02) {
      for (int y = -8; y <= 8; y += 1) {
        for (int x = -8; x <= 8; x += 1) {
          if (abs(x) > u_dotRadius || abs(y) > u_dotRadius) continue;
          ivec2 sampleCoord = clamp(coord + ivec2(x, y), ivec2(0), size - ivec2(1));
          if (signalAt(readChannels(sampleCoord)) > 0.02) {
            outColor = vec4(colourAt(sampleCoord), 1.0);
            return;
          }
        }
      }
    }
  }

  vec4 raw = u_smoothSampling ? sampleChannels(v_uv) : readChannels(coord);
  outColor = vec4(colourFromRaw(raw), 1.0);
}
`;

interface TextureFormat {
  internalFormat: number;
  format: number;
  channels: 1 | 2 | 4;
  packed: boolean;
}

interface UniformLocations {
  sourceSize: WebGLUniformLocation;
  channelCount: WebGLUniformLocation;
  ranges: WebGLUniformLocation;
  preset: WebGLUniformLocation;
  invert: WebGLUniformLocation;
  gamma: WebGLUniformLocation;
  contrast: WebGLUniformLocation;
  paletteCycleReverse: WebGLUniformLocation;
  dotRadius: WebGLUniformLocation;
  smoothSampling: WebGLUniformLocation;
  palettePhase: WebGLUniformLocation;
  boidsGlyph: WebGLUniformLocation;
  boidsGlyphRadius: WebGLUniformLocation;
  boidsMeanDir: WebGLUniformLocation;
}

export class WebGLRendererBackend implements RendererBackend {
  readonly kind = "webgl2" as const;
  readonly maxTextureSize: number;

  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uniforms: UniformLocations;
  private textureFormat: TextureFormat | null = null;
  private uploadBuffer: Float32Array | null = null;
  private textureWidth = 0;
  private textureHeight = 0;
  private gridWidth = 1;
  private gridHeight = 1;
  private displayWidth = 1;
  private displayHeight = 1;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      throw new Error("WebGL2 context is not available in this browser.");
    }

    this.gl = gl;
    this.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.texture = mustCreate(gl.createTexture(), "texture");
    this.vao = mustCreate(gl.createVertexArray(), "vertex array");
    this.uniforms = this.getUniformLocations();
    this.configureQuad();

    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "u_state"), 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.clearColor(0, 0, 0, 1);
  }

  resizeDisplay(displayWidth: number, displayHeight: number): void {
    this.displayWidth = Math.max(1, Math.floor(displayWidth));
    this.displayHeight = Math.max(1, Math.floor(displayHeight));
  }

  setGrid(gridWidth: number, gridHeight: number, kernel: SimKernel): void {
    this.gridWidth = Math.max(1, Math.floor(gridWidth));
    this.gridHeight = Math.max(1, Math.floor(gridHeight));
    this.configureTexture(kernel.channelCount);
  }

  draw(frame: RendererBackendFrame): void {
    const { state, kernel, colourOptions, displayOptions, mode } = frame;
    const expectedLength = this.gridWidth * this.gridHeight * kernel.channelCount;
    if (state.length !== expectedLength) return;

    this.configureTexture(kernel.channelCount);
    this.uploadState(state, kernel.channelCount);
    this.setUniforms(
      kernel,
      colourOptions,
      displayOptions,
      mode,
      frame.params,
      frame.elapsedTime,
      frame.speedScale,
      state,
    );

    const gl = this.gl;
    // Clear the whole canvas to black, then draw the grid into a centred,
    // aspect-preserving rectangle (letterbox). clear() ignores the viewport,
    // so the bars stay black while the quad fills only the contain rect.
    gl.viewport(0, 0, this.displayWidth, this.displayHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const rect = containRect(
      this.displayWidth,
      this.displayHeight,
      this.gridWidth,
      this.gridHeight,
    );
    gl.viewport(rect.x, rect.y, rect.width, rect.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy(): void {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }

  private getUniformLocations(): UniformLocations {
    return {
      sourceSize: mustCreate(
        this.gl.getUniformLocation(this.program, "u_sourceSize"),
        "u_sourceSize uniform",
      ),
      channelCount: mustCreate(
        this.gl.getUniformLocation(this.program, "u_channelCount"),
        "u_channelCount uniform",
      ),
      ranges: mustCreate(
        this.gl.getUniformLocation(this.program, "u_ranges"),
        "u_ranges uniform",
      ),
      preset: mustCreate(
        this.gl.getUniformLocation(this.program, "u_preset"),
        "u_preset uniform",
      ),
      invert: mustCreate(
        this.gl.getUniformLocation(this.program, "u_invert"),
        "u_invert uniform",
      ),
      gamma: mustCreate(
        this.gl.getUniformLocation(this.program, "u_gamma"),
        "u_gamma uniform",
      ),
      contrast: mustCreate(
        this.gl.getUniformLocation(this.program, "u_contrast"),
        "u_contrast uniform",
      ),
      paletteCycleReverse: mustCreate(
        this.gl.getUniformLocation(this.program, "u_paletteCycleReverse"),
        "u_paletteCycleReverse uniform",
      ),
      dotRadius: mustCreate(
        this.gl.getUniformLocation(this.program, "u_dotRadius"),
        "u_dotRadius uniform",
      ),
      smoothSampling: mustCreate(
        this.gl.getUniformLocation(this.program, "u_smoothSampling"),
        "u_smoothSampling uniform",
      ),
      palettePhase: mustCreate(
        this.gl.getUniformLocation(this.program, "u_palettePhase"),
        "u_palettePhase uniform",
      ),
      boidsGlyph: mustCreate(
        this.gl.getUniformLocation(this.program, "u_boidsGlyph"),
        "u_boidsGlyph uniform",
      ),
      boidsGlyphRadius: mustCreate(
        this.gl.getUniformLocation(this.program, "u_boidsGlyphRadius"),
        "u_boidsGlyphRadius uniform",
      ),
      boidsMeanDir: mustCreate(
        this.gl.getUniformLocation(this.program, "u_boidsMeanDir"),
        "u_boidsMeanDir uniform",
      ),
    };
  }

  private configureQuad(): void {
    const gl = this.gl;
    const position = gl.createBuffer();
    const positionLocation = gl.getAttribLocation(this.program, "a_position");
    if (positionLocation < 0) {
      throw new Error("WebGL2 renderer could not locate a_position attribute.");
    }

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, position);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private configureTexture(channelCount: number): void {
    const nextFormat = textureFormatFor(this.gl, channelCount);
    const sameFormat =
      this.textureFormat?.internalFormat === nextFormat.internalFormat &&
      this.textureFormat?.format === nextFormat.format &&
      this.textureFormat?.channels === nextFormat.channels &&
      this.textureFormat?.packed === nextFormat.packed &&
      this.textureWidth === this.gridWidth &&
      this.textureHeight === this.gridHeight;

    if (sameFormat) return;

    this.textureFormat = nextFormat;
    this.textureWidth = this.gridWidth;
    this.textureHeight = this.gridHeight;
    this.uploadBuffer =
      nextFormat.packed || nextFormat.channels === 4
        ? new Float32Array(this.gridWidth * this.gridHeight * 4)
        : null;

    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      nextFormat.internalFormat,
      this.gridWidth,
      this.gridHeight,
      0,
      nextFormat.format,
      gl.FLOAT,
      null,
    );
  }

  private uploadState(state: Float32Array, channelCount: number): void {
    const gl = this.gl;
    const format = this.textureFormat;
    if (!format) return;

    let upload: Float32Array = state;
    if (format.packed || (format.channels === 4 && channelCount !== 4)) {
      upload = this.packRgba(state, channelCount);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.gridWidth,
      this.gridHeight,
      format.format,
      gl.FLOAT,
      upload,
    );
  }

  private packRgba(state: Float32Array, channelCount: number): Float32Array {
    if (!this.uploadBuffer || this.uploadBuffer.length !== this.gridWidth * this.gridHeight * 4) {
      this.uploadBuffer = new Float32Array(this.gridWidth * this.gridHeight * 4);
    }

    const out = this.uploadBuffer;
    for (let cell = 0; cell < this.gridWidth * this.gridHeight; cell += 1) {
      const src = cell * channelCount;
      const dst = cell * 4;
      out[dst] = state[src] ?? 0;
      out[dst + 1] = channelCount > 1 ? state[src + 1] : 0;
      out[dst + 2] = channelCount > 2 ? state[src + 2] : 0;
      out[dst + 3] = channelCount > 3 ? state[src + 3] : 0;
    }
    return out;
  }

  private setUniforms(
    kernel: SimKernel,
    colourOptions: ColourMapOptions,
    displayOptions: { dotSize: number },
    mode: RenderMode,
    params: Record<string, number | boolean | string>,
    elapsedTime: number,
    speedScale: number,
    state: Float32Array,
  ): void {
    const gl = this.gl;
    const ranges = new Float32Array(8);
    for (let i = 0; i < 4; i += 1) {
      const [min, max] = kernel.channelRanges[i] ?? [0, 1];
      ranges[i * 2] = min;
      ranges[i * 2 + 1] = max;
    }

    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.sourceSize, this.gridWidth, this.gridHeight);
    gl.uniform1i(this.uniforms.channelCount, Math.min(4, kernel.channelCount));
    gl.uniform2fv(this.uniforms.ranges, ranges);
    gl.uniform1i(this.uniforms.preset, presetIndex(colourOptions.preset));
    gl.uniform1i(this.uniforms.invert, colourOptions.invert ? 1 : 0);
    gl.uniform1f(this.uniforms.gamma, colourOptions.gamma);
    gl.uniform1f(this.uniforms.contrast, colourOptions.contrast);
    gl.uniform1i(
      this.uniforms.paletteCycleReverse,
      colourOptions.paletteCycleReverse ? 1 : 0,
    );
    gl.uniform1i(
      this.uniforms.dotRadius,
      mode === "particle" ? Math.floor(displayOptions.dotSize / 2) : 0,
    );
    gl.uniform1i(this.uniforms.smoothSampling, shouldSmoothSample(mode) ? 1 : 0);
    gl.uniform1f(
      this.uniforms.palettePhase,
      mode === "fractal"
        ? palettePhase(params, elapsedTime, colourOptions, speedScale)
        : 0,
    );
    gl.uniform1i(this.uniforms.boidsGlyph, isBoidsState(kernel) ? 1 : 0);
    gl.uniform1f(this.uniforms.boidsGlyphRadius, boidsGlyphRadius(params, displayOptions));
    const meanDir = boidsMeanDirection(
      state,
      kernel.channelCount,
      this.gridWidth * this.gridHeight,
    );
    gl.uniform2f(this.uniforms.boidsMeanDir, meanDir[0], meanDir[1]);
  }
}

export function createWebGLRendererBackend(
  canvas: HTMLCanvasElement,
): WebGLRendererBackend | null {
  const probe = document.createElement("canvas");
  if (!probe.getContext("webgl2")) {
    console.warn("WebGL2 renderer unavailable; falling back to Canvas 2D.");
    return null;
  }
  return new WebGLRendererBackend(canvas);
}

function textureFormatFor(
  gl: WebGL2RenderingContext,
  channelCount: number,
): TextureFormat {
  if (channelCount <= 1) {
    return {
      internalFormat: gl.R32F,
      format: gl.RED,
      channels: 1,
      packed: false,
    };
  }

  if (channelCount === 2) {
    return {
      internalFormat: gl.RG32F,
      format: gl.RG,
      channels: 2,
      packed: false,
    };
  }

  return {
    internalFormat: gl.RGBA32F,
    format: gl.RGBA,
    channels: 4,
    packed: channelCount !== 4,
  };
}

function presetIndex(preset: ColourPreset): number {
  switch (preset) {
    case "viridis":
      return 0;
    case "plasma":
      return 1;
    case "inferno":
      return 2;
    case "ice":
      return 3;
    case "amber":
      return 4;
    case "binary":
      return 5;
    case "chemical":
      return 6;
    case "rgb":
      return 7;
    case "brian":
      return 8;
  }
}

function shouldSmoothSample(mode: RenderMode): boolean {
  return mode === "field" || mode === "smooth" || mode === "fractal";
}

function isBoidsState(kernel: SimKernel): boolean {
  return (
    kernel.name === "Boids" &&
    kernel.channelCount >= 4 &&
    kernel.channelLabels[2] === "Velocity X" &&
    kernel.channelLabels[3] === "Velocity Y"
  );
}

function boidsMeanDirection(
  state: Float32Array,
  channelCount: number,
  cellCount: number,
): [number, number] {
  let sumX = 0;
  let sumY = 0;
  for (let cell = 0; cell < cellCount; cell += 1) {
    const offset = cell * channelCount;
    const density = state[offset];
    if (density <= 0.02) continue;
    sumX += state[offset + 2] * density;
    sumY += state[offset + 3] * density;
  }
  const magnitude = Math.hypot(sumX, sumY);
  if (magnitude <= 1e-6) return [0, 0];
  return [sumX / magnitude, sumY / magnitude];
}

function boidsGlyphRadius(
  params: Record<string, number | boolean | string>,
  displayOptions: { dotSize: number },
): number {
  const rawSize = params.pointSize;
  const size =
    typeof rawSize === "number" && Number.isFinite(rawSize)
      ? rawSize
      : displayOptions.dotSize;
  return Math.max(2, Math.min(8, size / 2));
}

function palettePhase(
  params: Record<string, number | boolean | string>,
  elapsedTime: number,
  colourOptions: ColourMapOptions,
  speedScale: number,
): number {
  const rawSpeed = params.cycleSpeed;
  const speed = typeof rawSpeed === "number" && Number.isFinite(rawSpeed) ? rawSpeed : 0;
  if (speed <= 0) return 0;

  const direction = colourOptions.paletteCycleReverse ? -1 : 1;
  return ((elapsedTime * speed * speedScale * direction) % 1 + 1) % 1;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = mustCreate(gl.createProgram(), "program");

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`WebGL2 renderer shader link failed: ${message}`);
  }

  return program;
}

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = mustCreate(gl.createShader(type), "shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "unknown compile error";
    gl.deleteShader(shader);
    throw new Error(`WebGL2 renderer shader compile failed: ${message}`);
  }

  return shader;
}

function mustCreate<T>(value: T | null, label: string): T {
  if (!value) {
    throw new Error(`WebGL2 renderer could not create ${label}.`);
  }
  return value;
}
