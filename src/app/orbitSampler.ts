import {
  IM_MAX,
  IM_MIN,
  MAX_DETECTABLE_PERIOD,
  PERIOD_DETECTION_SAMPLES,
  PERIOD_TOLERANCE,
  RE_MAX,
  RE_MIN,
  SAMPLE_CLIP,
  SPREAD_WINDOW_ITERATIONS,
  cellCoordinate,
  periodDetectionWindow,
} from "../sims/logistic-mandelbrot/model.ts";
import { SlotPacker, admissionOrder, distinctPointCount } from "./orbitPacking.ts";

const SAMPLE_BATCH_SIZE = 4;
const MAX_WARMUP_ITERATIONS = 20000;
const MAX_SAMPLE_COUNT = 96;

const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;

void main() {
  vec2 position;
  if (gl_VertexID == 0) position = vec2(-1.0, -1.0);
  else if (gl_VertexID == 1) position = vec2(3.0, -1.0);
  else position = vec2(-1.0, 3.0);
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const DOUBLE_SINGLE_GLSL = `
vec2 dsAdd(vec2 a, vec2 b) {
  float s = a.x + b.x;
  float v = s - a.x;
  float t = ((b.x - v) + (a.x - (s - v))) + a.y + b.y;
  float hi = s + t;
  return vec2(hi, t - (hi - s));
}

vec2 dsSub(vec2 a, vec2 b) {
  return dsAdd(a, vec2(-b.x, -b.y));
}

vec2 dsMul(vec2 a, vec2 b) {
  const float split = 4097.0;
  float cona = a.x * split;
  float conb = b.x * split;
  float aHi = cona - (cona - a.x);
  float bHi = conb - (conb - b.x);
  float aLo = a.x - aHi;
  float bLo = b.x - bHi;
  float product = a.x * b.x;
  float error = ((aHi * bHi - product) + aHi * bLo + aLo * bHi) + aLo * bLo;
  error += a.x * b.y + a.y * b.x;
  float hi = product + error;
  return vec2(hi, error - (hi - product));
}

float dsValue(vec2 value) {
  return value.x + value.y;
}

void orbitStep(inout vec2 zr, inout vec2 zi, vec2 cr, vec2 ci) {
  vec2 nextR = dsAdd(dsSub(dsMul(zr, zr), dsMul(zi, zi)), cr);
  zi = dsAdd(dsAdd(dsMul(zr, zi), dsMul(zr, zi)), ci);
  zr = nextR;
}

bool orbitEscaped(vec2 zr, vec2 zi) {
  return dsValue(dsAdd(dsMul(zr, zr), dsMul(zi, zi))) > 4.0;
}
`;

const WARMUP_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_coords;
uniform int u_cellCount;
uniform int u_width;
uniform int u_warmupIterations;
layout(location = 0) out vec4 outState;

${DOUBLE_SINGLE_GLSL}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  int index = pixel.y * u_width + pixel.x;
  if (index >= u_cellCount) {
    outState = vec4(3.0, 0.0, 0.0, 0.0);
    return;
  }
  vec4 coordinate = texelFetch(u_coords, pixel, 0);
  vec2 cr = coordinate.xy;
  vec2 ci = coordinate.zw;
  vec2 zr = vec2(0.0);
  vec2 zi = vec2(0.0);
  vec2 checkpointR = vec2(0.0);
  vec2 checkpointI = vec2(0.0);
  int revisitWindow = 8;
  int sinceCheckpoint = 0;
  bool escaped = false;

  for (int iteration = 0; iteration < u_warmupIterations; iteration += 1) {
    orbitStep(zr, zi, cr, ci);
    if (orbitEscaped(zr, zi)) {
      escaped = true;
      break;
    }
    vec2 deltaR = dsSub(zr, checkpointR);
    vec2 deltaI = dsSub(zi, checkpointI);
    float revisitDistance = dsValue(
      dsAdd(dsMul(deltaR, deltaR), dsMul(deltaI, deltaI))
    );
    if (revisitDistance < 1e-18) break;
    sinceCheckpoint += 1;
    if (sinceCheckpoint == revisitWindow) {
      checkpointR = zr;
      checkpointI = zi;
      sinceCheckpoint = 0;
      if (revisitWindow < 256) revisitWindow *= 2;
    }
  }
  outState = escaped ? vec4(3.0, 0.0, 0.0, 0.0) : vec4(zr, zi);
}
`;

const SAMPLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_coords;
uniform sampler2D u_state;
uniform int u_cellCount;
uniform int u_width;
uniform int u_sampleOffset;
uniform int u_sampleCount;
layout(location = 0) out vec4 outState;
layout(location = 1) out vec4 outSamples;

${DOUBLE_SINGLE_GLSL}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  int index = pixel.y * u_width + pixel.x;
  vec4 packedState = texelFetch(u_state, pixel, 0);
  if (index >= u_cellCount || packedState.x > 2.0) {
    outState = vec4(3.0, 0.0, 0.0, 0.0);
    outSamples = vec4(0.0);
    return;
  }
  vec4 coordinate = texelFetch(u_coords, pixel, 0);
  vec2 cr = coordinate.xy;
  vec2 ci = coordinate.zw;
  vec2 zr = packedState.xy;
  vec2 zi = packedState.zw;
  vec4 samples = vec4(0.0);
  bool escaped = false;

  for (int lane = 0; lane < ${SAMPLE_BATCH_SIZE}; lane += 1) {
    if (u_sampleOffset + lane >= u_sampleCount || escaped) continue;
    orbitStep(zr, zi, cr, ci);
    if (orbitEscaped(zr, zi)) {
      escaped = true;
    } else {
      samples[lane] = clamp(dsValue(zr), -${SAMPLE_CLIP.toFixed(1)}, ${SAMPLE_CLIP.toFixed(1)});
    }
  }
  outState = escaped ? vec4(3.0, 0.0, 0.0, 0.0) : vec4(zr, zi);
  outSamples = samples;
}
`;

const PERIOD_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

uniform sampler2D u_coords;
uniform sampler2D u_state;
uniform sampler2DArray u_samples;
uniform int u_cellCount;
uniform int u_width;
uniform int u_sampleCount;
uniform int u_detectionCount;
uniform int u_spreadWindow;
// x: period, or -1 for an escaped or out-of-range cell. y: cycle multiplier.
// z: centre height (mean Re(z)). w: RMS deviation about the centre.
layout(location = 0) out vec4 outMetadata;

${DOUBLE_SINGLE_GLSL}

// Iterates past the plot window, computed here rather than stored in
// u_samples: the sample texture array is sized by the point budget, so
// widening the detection window through it would cost VRAM linearly. The
// tail runs from the post-sample state, so these are the same iterates the
// CPU oracle appends in model.ts sampleAttractorCell.
float tailSamples[${PERIOD_DETECTION_SAMPLES}];

float orbitSample(ivec2 pixel, int sampleIndex) {
  vec4 batch = texelFetch(
    u_samples,
    ivec3(pixel, sampleIndex / ${SAMPLE_BATCH_SIZE}),
    0
  );
  int lane = sampleIndex % ${SAMPLE_BATCH_SIZE};
  if (lane == 0) return batch.x;
  if (lane == 1) return batch.y;
  if (lane == 2) return batch.z;
  return batch.w;
}

float detectionSample(ivec2 pixel, int index) {
  if (index < u_sampleCount) return orbitSample(pixel, index);
  return tailSamples[index - u_sampleCount];
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  int index = pixel.y * u_width + pixel.x;
  vec4 packedState = texelFetch(u_state, pixel, 0);
  if (index >= u_cellCount || packedState.x > 2.0) {
    outMetadata = vec4(-1.0, 1.0, 0.0, 0.0);
    return;
  }

  vec4 coordinate = texelFetch(u_coords, pixel, 0);
  vec2 cr = coordinate.xy;
  vec2 ci = coordinate.zw;

  // Extend the plot window to the detection window. An escaping tail is
  // unbounded and cannot carry an attracting cycle, so truncate there rather
  // than feeding clipped divergence into the comparisons — matching the CPU
  // oracle's truncation exactly.
  int detectionCount = u_sampleCount;
  {
    vec2 tailR = packedState.xy;
    vec2 tailI = packedState.zw;
    for (int tailIndex = 0; tailIndex < ${PERIOD_DETECTION_SAMPLES}; tailIndex += 1) {
      if (u_sampleCount + tailIndex >= u_detectionCount) break;
      orbitStep(tailR, tailI, cr, ci);
      if (orbitEscaped(tailR, tailI)) break;
      tailSamples[tailIndex] = clamp(
        dsValue(tailR),
        -${SAMPLE_CLIP.toFixed(1)},
        ${SAMPLE_CLIP.toFixed(1)}
      );
      detectionCount += 1;
    }
  }

  int period = 0;
  for (int q = 1; q <= ${MAX_DETECTABLE_PERIOD}; q += 1) {
    if (q >= detectionCount) break;
    bool matches = true;
    for (int lane = 0; lane < ${MAX_SAMPLE_COUNT}; lane += 1) {
      if (lane + q >= detectionCount) break;
      float delta =
        detectionSample(pixel, lane + q) - detectionSample(pixel, lane);
      if (delta > ${PERIOD_TOLERANCE} || delta < -${PERIOD_TOLERANCE}) {
        matches = false;
        break;
      }
    }
    if (matches) {
      period = q;
      break;
    }
  }

  // One walk from the post-sample state serves the multiplier (one cycle,
  // periodic cells only) and the centre and spread: exactly one cycle when a
  // period is known, else u_spreadWindow iterates. Welford's update keeps the
  // spread of a near-constant orbit from cancelling to float noise. The same
  // iterates the CPU oracle in model.ts measures.
  float interior = 1.0;
  float mean = 0.0;
  float squares = 0.0;
  float count = 0.0;
  {
    vec2 zr = packedState.xy;
    vec2 zi = packedState.zw;
    float multiplier = 1.0;
    int steps = period > 0 ? period : u_spreadWindow;
    for (int step = 0; step < ${SPREAD_WINDOW_ITERATIONS}; step += 1) {
      if (step >= steps) break;
      orbitStep(zr, zi, cr, ci);
      float x = dsValue(zr);
      if (period > 0) {
        multiplier *= 2.0 * length(vec2(x, dsValue(zi)));
      } else if (orbitEscaped(zr, zi)) {
        break;
      }
      count += 1.0;
      float delta = x - mean;
      mean += delta / count;
      squares += delta * (x - mean);
    }
    if (period > 0) interior = clamp(multiplier, 0.0, 1.0);
  }
  float spread = count > 0.0 ? sqrt(max(squares, 0.0) / count) : 0.0;
  outMetadata = vec4(float(period), interior, mean, spread);
}
`;

/**
 * A live cloud in the packed layout: `sampleCount` rows by `slotCount` slots,
 * point index `row * slotCount + slot`. A cell occupies
 * `distinctPointCount(period, sampleCount)` consecutive rows of one slot, in
 * orbit-sample order; periodic cells share slots; a cell without a detected
 * period fills a slot alone. Rows nothing occupies carry `sampleIndex ===
 * sampleCount` and are hidden by the point shader, never drawn.
 */
export interface OrbitCloudBuffers {
  positions: Float32Array;
  /**
   * Detected period per point (0 = none). Float32, like the sample index: a
   * 1-byte attribute has a 1-byte stride, which Metal cannot bind natively,
   * so ANGLE converts the whole buffer every frame (measured at 2.5 times the
   * render time at 5.5M points).
   */
  periods: Float32Array;
  /** Centre height of each point's column (AttractorCellMeasure.centre). */
  centres: Float32Array;
  boundaries: Float32Array;
  weights: Float32Array;
  /** Orbit sample index of the point within its cell; `sampleCount` on a hidden row. */
  sampleIndices: Float32Array;
  sampleCount: number;
  /** Slots in the layout; the draw submits `slotCount * sampleCount` points. */
  slotCount: number;
  /** Slots of the tiers below the raised boundary-detail tier (0 when detail is off). */
  boundaryDetailBaseSlots: number;
  /** Cells of the candidate grid (sampleWidth times sampleHeight). */
  candidateCells: number;
  /** Candidate cells that did not escape. */
  boundedCandidates: number;
  /** Bounded cells admitted into the base tier. */
  baseCells: number;
  /** Rows the base tier occupies. */
  baseRows: number;
  /** Sub-cells stored across the refinement tiers. */
  refinedSubCells: number;
  /** Rows the refinement tiers occupy. */
  refinedRows: number;
  /** Occupied rows per orbit sample index, for the visible-point count. */
  rowsBySampleIndex: Uint32Array;
  /** Bytes of the cloud's own CPU-side arrays (attributes and layout tables). */
  buildBytes: number;
  /** Bytes of the sampler readback arrays the build held. */
  samplerBytes: number;
}

export interface GpuOrbitCloudOptions {
  sampleWidth: number;
  sampleHeight: number;
  sampleCount: number;
  warmupIterations: number;
  realSliceOnly: boolean;
  /** Slots the whole cloud may occupy (the raised budget when detail is active). */
  maxSlots: number;
  /** Slots the base tier may occupy: the planner's base row budget over sampleCount. */
  baseSlotCap: number;
  /** Slots the detail-0 cloud may occupy; the baseline refinement tier fills up to here. */
  baselineMaxSlots: number;
  baselineRefineActive: boolean;
  baselineRefineCandidateCap: number;
  baselineRefineWarmup: number;
  baselineRefineSubdivision: number;
  baselineRefinePointWeight: number;
  refineActive: boolean;
  refineCandidateCap: number;
  refineWarmup: number;
  refineSubdivision: number;
  refinePeriodThreshold: number;
  refinePointWeight: number;
  boundaryDetailActive: boolean;
}

export interface OrbitSampleResult {
  cellCount: number;
  sampleCount: number;
  coordinates: Float64Array;
  samples: Float32Array;
  periods: Float32Array;
  interiors: Float32Array;
  /** Mean Re(z) per cell: one exact cycle, or SPREAD_WINDOW_ITERATIONS iterates. */
  centres: Float32Array;
  /** RMS deviation of Re(z) about `centres` per cell. */
  spreads: Float32Array;
  escaped: Uint8Array;
}

interface SampleTargets {
  width: number;
  height: number;
  pixelCount: number;
  batchCount: number;
  coordinateTexture: WebGLTexture;
  stateTextures: [WebGLTexture, WebGLTexture];
  sampleTexture: WebGLTexture;
  metadataTexture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
}

export class OrbitSampler {
  private readonly gl: WebGL2RenderingContext;
  private readonly warmupProgram: WebGLProgram;
  private readonly sampleProgram: WebGLProgram;
  private readonly periodProgram: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;

  static create(gl: WebGL2RenderingContext): OrbitSampler | null {
    if (!gl.getExtension("EXT_color_buffer_float")) {
      console.error(
        "logistic-mandelbrot: GPU orbit sampler unavailable (EXT_color_buffer_float missing); falling back to CPU sampling",
      );
      return null;
    }
    try {
      return new OrbitSampler(gl);
    } catch (error) {
      console.error(
        "logistic-mandelbrot: GPU orbit sampler setup failed; falling back to CPU sampling",
        error,
      );
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.warmupProgram = createProgram(gl, FULLSCREEN_VERTEX_SHADER, WARMUP_FRAGMENT_SHADER);
    this.sampleProgram = createProgram(gl, FULLSCREEN_VERTEX_SHADER, SAMPLE_FRAGMENT_SHADER);
    this.periodProgram = createProgram(gl, FULLSCREEN_VERTEX_SHADER, PERIOD_FRAGMENT_SHADER);
    this.vao = requireResource(gl.createVertexArray(), "orbit sampler VAO");
  }

  sample(coordinates: Float64Array, warmupIterations: number, sampleCount: number): OrbitSampleResult | null {
    if (
      coordinates.length === 0 ||
      coordinates.length % 2 !== 0 ||
      sampleCount < 1 ||
      sampleCount > MAX_SAMPLE_COUNT
    ) {
      return null;
    }
    const cellCount = coordinates.length / 2;
    let targets: SampleTargets | null = null;
    try {
      targets = this.createTargets(coordinates, sampleCount);
      const finalStateIndex = this.runSampler(
        targets,
        cellCount,
        Math.max(0, Math.min(MAX_WARMUP_ITERATIONS, Math.round(warmupIterations))),
        sampleCount,
      );
      const result = this.readResult(
        targets,
        finalStateIndex,
        coordinates,
        cellCount,
        sampleCount,
      );
      if (this.gl.getError() !== this.gl.NO_ERROR) return null;
      return result;
    } catch (error) {
      console.error(
        "logistic-mandelbrot: GPU orbit sampling failed mid-run; falling back to CPU sampling",
        error,
      );
      return null;
    } finally {
      if (targets) this.releaseTargets(targets);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.gl.bindVertexArray(null);
      this.gl.useProgram(null);
    }
  }

  destroy(): void {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.warmupProgram);
    gl.deleteProgram(this.sampleProgram);
    gl.deleteProgram(this.periodProgram);
  }

  private createTargets(coordinates: Float64Array, sampleCount: number): SampleTargets {
    const gl = this.gl;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (gl.getError() === gl.NO_ERROR) break;
    }
    const cellCount = coordinates.length / 2;
    const maxSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const width = Math.min(maxSize, cellCount);
    const height = Math.ceil(cellCount / width);
    const pixelCount = width * height;
    const batchCount = Math.ceil(sampleCount / SAMPLE_BATCH_SIZE);
    const maxLayers = Number(gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS));
    if (height > maxSize || batchCount > maxLayers) {
      throw new Error("orbit sampler target exceeds WebGL2 texture limits");
    }

    const packedCoordinates = new Float32Array(pixelCount * 4);
    for (let cell = 0; cell < cellCount; cell += 1) {
      const re = coordinates[cell * 2];
      const im = coordinates[cell * 2 + 1];
      const reHigh = Math.fround(re);
      const imHigh = Math.fround(im);
      const offset = cell * 4;
      packedCoordinates[offset] = reHigh;
      packedCoordinates[offset + 1] = Math.fround(re - reHigh);
      packedCoordinates[offset + 2] = imHigh;
      packedCoordinates[offset + 3] = Math.fround(im - imHigh);
    }

    const coordinateTexture = createTexture2D(gl, width, height, packedCoordinates);
    const stateTextures: [WebGLTexture, WebGLTexture] = [
      createTexture2D(gl, width, height, null),
      createTexture2D(gl, width, height, null),
    ];
    const metadataTexture = createTexture2D(gl, width, height, null);
    const sampleTexture = requireResource(gl.createTexture(), "orbit sample array texture");
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, sampleTexture);
    setNearestTextureParameters(gl, gl.TEXTURE_2D_ARRAY);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RGBA32F,
      width,
      height,
      batchCount,
      0,
      gl.RGBA,
      gl.FLOAT,
      null,
    );
    const framebuffer = requireResource(gl.createFramebuffer(), "orbit sampler framebuffer");
    return {
      width,
      height,
      pixelCount,
      batchCount,
      coordinateTexture,
      stateTextures,
      sampleTexture,
      metadataTexture,
      framebuffer,
    };
  }

  private runSampler(
    targets: SampleTargets,
    cellCount: number,
    warmupIterations: number,
    sampleCount: number,
  ): 0 | 1 {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets.framebuffer);
    gl.viewport(0, 0, targets.width, targets.height);

    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      targets.stateTextures[0],
      0,
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    requireCompleteFramebuffer(gl);
    gl.useProgram(this.warmupProgram);
    bindTexture(gl, this.warmupProgram, "u_coords", targets.coordinateTexture, 0);
    gl.uniform1i(gl.getUniformLocation(this.warmupProgram, "u_cellCount"), cellCount);
    gl.uniform1i(gl.getUniformLocation(this.warmupProgram, "u_width"), targets.width);
    gl.uniform1i(
      gl.getUniformLocation(this.warmupProgram, "u_warmupIterations"),
      warmupIterations,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    let source: 0 | 1 = 0;
    for (let batch = 0; batch < targets.batchCount; batch += 1) {
      const destination: 0 | 1 = source === 0 ? 1 : 0;
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        targets.stateTextures[destination],
        0,
      );
      gl.framebufferTextureLayer(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT1,
        targets.sampleTexture,
        0,
        batch,
      );
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      requireCompleteFramebuffer(gl);
      gl.useProgram(this.sampleProgram);
      bindTexture(gl, this.sampleProgram, "u_coords", targets.coordinateTexture, 0);
      bindTexture(gl, this.sampleProgram, "u_state", targets.stateTextures[source], 1);
      gl.uniform1i(gl.getUniformLocation(this.sampleProgram, "u_cellCount"), cellCount);
      gl.uniform1i(gl.getUniformLocation(this.sampleProgram, "u_width"), targets.width);
      gl.uniform1i(
        gl.getUniformLocation(this.sampleProgram, "u_sampleOffset"),
        batch * SAMPLE_BATCH_SIZE,
      );
      gl.uniform1i(gl.getUniformLocation(this.sampleProgram, "u_sampleCount"), sampleCount);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      source = destination;
    }

    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      targets.metadataTexture,
      0,
    );
    gl.framebufferTextureLayer(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT1,
      null,
      0,
      0,
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    requireCompleteFramebuffer(gl);
    gl.useProgram(this.periodProgram);
    bindTexture(gl, this.periodProgram, "u_coords", targets.coordinateTexture, 0);
    bindTexture(gl, this.periodProgram, "u_state", targets.stateTextures[source], 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, targets.sampleTexture);
    gl.uniform1i(gl.getUniformLocation(this.periodProgram, "u_samples"), 2);
    gl.uniform1i(gl.getUniformLocation(this.periodProgram, "u_cellCount"), cellCount);
    gl.uniform1i(gl.getUniformLocation(this.periodProgram, "u_width"), targets.width);
    gl.uniform1i(gl.getUniformLocation(this.periodProgram, "u_sampleCount"), sampleCount);
    gl.uniform1i(
      gl.getUniformLocation(this.periodProgram, "u_detectionCount"),
      periodDetectionWindow(sampleCount),
    );
    gl.uniform1i(
      gl.getUniformLocation(this.periodProgram, "u_spreadWindow"),
      SPREAD_WINDOW_ITERATIONS,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return source;
  }

  private readResult(
    targets: SampleTargets,
    finalStateIndex: 0 | 1,
    coordinates: Float64Array,
    cellCount: number,
    sampleCount: number,
  ): OrbitSampleResult {
    const gl = this.gl;
    const metadata = new Float32Array(targets.pixelCount * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      targets.metadataTexture,
      0,
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, targets.width, targets.height, gl.RGBA, gl.FLOAT, metadata);

    const periods = new Float32Array(cellCount);
    const interiors = new Float32Array(cellCount);
    const centres = new Float32Array(cellCount);
    const spreads = new Float32Array(cellCount);
    const escaped = new Uint8Array(cellCount);
    for (let cell = 0; cell < cellCount; cell += 1) {
      // The escape flag shares the period channel as a negative sentinel so
      // z and w are free for the centre and spread; escaped cells read
      // period 0 as before.
      const period = metadata[cell * 4];
      if (period < 0) {
        escaped[cell] = 1;
        interiors[cell] = 1;
        continue;
      }
      periods[cell] = period;
      interiors[cell] = metadata[cell * 4 + 1];
      centres[cell] = metadata[cell * 4 + 2];
      spreads[cell] = metadata[cell * 4 + 3];
    }

    const samples = new Float32Array(cellCount * sampleCount);
    const packed = new Float32Array(targets.pixelCount * SAMPLE_BATCH_SIZE);
    for (let batch = 0; batch < targets.batchCount; batch += 1) {
      gl.framebufferTextureLayer(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        targets.sampleTexture,
        0,
        batch,
      );
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      requireCompleteFramebuffer(gl);
      gl.readPixels(0, 0, targets.width, targets.height, gl.RGBA, gl.FLOAT, packed);
      for (let lane = 0; lane < SAMPLE_BATCH_SIZE; lane += 1) {
        const sample = batch * SAMPLE_BATCH_SIZE + lane;
        if (sample >= sampleCount) break;
        const targetOffset = sample * cellCount;
        for (let cell = 0; cell < cellCount; cell += 1) {
          samples[targetOffset + cell] = escaped[cell] === 1
            ? 0
            : packed[cell * SAMPLE_BATCH_SIZE + lane];
        }
      }
    }
    // Keep the final state attachment live until all reads complete on drivers
    // that defer framebuffer work; attaching it here also avoids an unused arg.
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      targets.stateTextures[finalStateIndex],
      0,
    );
    return {
      cellCount,
      sampleCount,
      coordinates,
      samples,
      periods,
      interiors,
      centres,
      spreads,
      escaped,
    };
  }

  private releaseTargets(targets: SampleTargets): void {
    const gl = this.gl;
    gl.deleteFramebuffer(targets.framebuffer);
    gl.deleteTexture(targets.coordinateTexture);
    gl.deleteTexture(targets.stateTextures[0]);
    gl.deleteTexture(targets.stateTextures[1]);
    gl.deleteTexture(targets.sampleTexture);
    gl.deleteTexture(targets.metadataTexture);
  }
}

/**
 * Largest job count handed to one `OrbitSampler.sample` call. The sampler
 * allocates six RGBA32F pixels per job, so a refinement tier larger than
 * this is sampled in batches rather than dropped.
 */
export const MAX_SAMPLE_JOBS_PER_CALL = 1 << 22;

/** Seed of the admission order that decides which refined sub-cells are kept. */
const REFINEMENT_ADMISSION_SEED = 0x103_01;

/** Seed of the admission order that decides which base cells are kept when the base slot cap binds. */
const BASE_ADMISSION_SEED = 0x103;

interface SampleBatch {
  first: number;
  sample: OrbitSampleResult;
}

/**
 * A tier's packed cells: for each stored item (a candidate cell or a
 * refinement job) its index, slot and first row. Items pack in index order,
 * which keeps neighbouring cells in neighbouring slots and needs no
 * permutation; only when the slot cap binds is the tier repacked in
 * `admissionOrder` and cut there, so the kept set is a spatially uniform
 * prefix rather than a row-major truncation.
 */
interface PackedTier {
  packer: SlotPacker;
  items: Int32Array;
  slots: Int32Array;
  rows: Uint8Array;
  stored: number;
  /** Bytes of the tier's tables, including the admission order when it was needed. */
  bytes: number;
}

function packItems(
  rowsPerItem: Uint8Array,
  storable: number,
  slotCap: number,
  sampleCount: number,
  seed: number,
): PackedTier {
  const items = new Int32Array(storable);
  const slots = new Int32Array(storable);
  const rows = new Uint8Array(storable);
  const tableBytes = items.byteLength + slots.byteLength + rows.byteLength;
  const admit = (order: Uint32Array | null): PackedTier | null => {
    const packer = new SlotPacker(sampleCount);
    let stored = 0;
    for (let index = 0; index < rowsPerItem.length; index += 1) {
      const item = order === null ? index : order[index];
      const itemRows = rowsPerItem[item];
      if (itemRows === 0) continue;
      if (packer.slotCount >= slotCap && !packer.fitsOpenSlot(itemRows)) {
        if (order === null) return null;
        break;
      }
      const placed = packer.placePacked(itemRows);
      items[stored] = item;
      slots[stored] = (placed / sampleCount) | 0;
      rows[stored] = placed % sampleCount;
      stored += 1;
    }
    return {
      packer,
      items,
      slots,
      rows,
      stored,
      bytes: tableBytes + (order === null ? 0 : order.byteLength),
    };
  };
  return admit(null) ?? (admit(admissionOrder(rowsPerItem.length, seed)) as PackedTier);
}

function emptyPackedTier(sampleCount: number): PackedTier {
  return {
    packer: new SlotPacker(sampleCount),
    items: new Int32Array(0),
    slots: new Int32Array(0),
    rows: new Uint8Array(0),
    stored: 0,
    bytes: 0,
  };
}

interface RefinementTier {
  packed: PackedTier;
  /** Rows per job: 0 for an escaped sub-cell, else its distinct points. */
  rowsPerJob: Uint8Array;
  /** Sampled batches covering the jobs in order, with their first job index. */
  batches: SampleBatch[];
  /** Parent cell of each job, for the boundary distance. */
  parents: Int32Array;
  subCells: number;
  rows: number;
  samplerBytes: number;
  layoutBytes: number;
}

function emptyTier(sampleCount: number): RefinementTier {
  return {
    packed: emptyPackedTier(sampleCount),
    rowsPerJob: new Uint8Array(0),
    batches: [],
    parents: new Int32Array(0),
    subCells: 0,
    rows: 0,
    samplerBytes: 0,
    layoutBytes: 0,
  };
}

function sampleResultBytes(result: OrbitSampleResult): number {
  return result.coordinates.byteLength
    + result.samples.byteLength
    + result.periods.byteLength
    + result.interiors.byteLength
    + result.centres.byteLength
    + result.spreads.byteLength
    + result.escaped.byteLength;
}

export function buildGpuOrbitCloud(
  sampler: OrbitSampler,
  options: GpuOrbitCloudOptions,
): OrbitCloudBuffers | null {
  const {
    sampleWidth,
    sampleHeight,
    sampleCount,
    warmupIterations,
    realSliceOnly,
    maxSlots,
    baseSlotCap,
    baselineMaxSlots,
    baselineRefineActive,
    baselineRefineCandidateCap,
    baselineRefineWarmup,
    baselineRefineSubdivision,
    baselineRefinePointWeight,
    refineActive,
    refineCandidateCap,
    refineWarmup,
    refineSubdivision,
    refinePeriodThreshold,
    refinePointWeight,
    boundaryDetailActive,
  } = options;
  const baseCellCount = sampleWidth * sampleHeight;
  const baseCoordinates = new Float64Array(baseCellCount * 2);
  for (let cell = 0; cell < baseCellCount; cell += 1) {
    const x = cell % sampleWidth;
    const y = (cell - x) / sampleWidth;
    baseCoordinates[cell * 2] = cellCoordinate(RE_MIN, RE_MAX, x, sampleWidth);
    baseCoordinates[cell * 2 + 1] =
      realSliceOnly || y === Math.floor(sampleHeight / 2)
        ? 0
        : cellCoordinate(IM_MIN, IM_MAX, y, sampleHeight);
  }
  const base = sampleInBatches(sampler, baseCoordinates, warmupIterations, sampleCount);
  if (!base) return null;
  let samplerBytes = base.reduce((sum, batch) => sum + sampleResultBytes(batch.sample), 0);

  // Every candidate's rows: 0 for an escaped cell, else its distinct points.
  // Read once per cell here, so the admission, candidate and write passes
  // index byte arrays instead of resolving a sample batch per point.
  const escapeMask = new Uint8Array(baseCellCount);
  const tailMask = new Uint8Array(baseCellCount);
  const baseRowsPerCell = new Uint8Array(baseCellCount);
  let boundedCandidates = 0;
  for (const { first, sample } of base) {
    for (let local = 0; local < sample.cellCount; local += 1) {
      const cell = first + local;
      if (sample.escaped[local] === 1) {
        escapeMask[cell] = 1;
        continue;
      }
      boundedCandidates += 1;
      const period = sample.periods[local];
      baseRowsPerCell[cell] = distinctPointCount(period, sampleCount);
      if (period === 0 || period >= refinePeriodThreshold) tailMask[cell] = 1;
    }
  }

  // The base tier keeps every bounded cell when its slot cap allows, packed
  // in grid order; when the cap binds, cells are admitted in `admissionOrder`
  // until it does, and nothing is swapped out afterwards.
  const baseTier = packItems(
    baseRowsPerCell,
    boundedCandidates,
    baseSlotCap,
    sampleCount,
    BASE_ADMISSION_SEED,
  );
  const baseSlots = baseTier.packer.slotCount;

  // Refinement candidates: cascade tails (deep or undetected period) and,
  // with boundary detail, both sides of the escape edge. Reservoir-capped as
  // before; the caps derive from the rows the base tier was planned to leave.
  const baselineRefineCandidates = new Int32Array(
    boundaryDetailActive && baselineRefineActive ? baselineRefineCandidateCap : 0,
  );
  const refineCandidates = new Int32Array(refineActive ? refineCandidateCap : 0);
  let baselineInterestingSeen = 0;
  let interestingSeen = 0;
  for (let cell = 0; cell < baseCellCount; cell += 1) {
    const escaped = escapeMask[cell] === 1;
    const boundaryBand =
      boundaryDetailActive &&
      isEscapeEdgeCell(escapeMask, sampleWidth, sampleHeight, cell);
    if (escaped && !boundaryBand) continue;
    const tailCandidate = !escaped && tailMask[cell] === 1;
    if (boundaryDetailActive && baselineRefineActive && tailCandidate) {
      const candidateSlot = reservoirSlot(
        baselineInterestingSeen,
        baselineRefineCandidateCap,
      );
      baselineInterestingSeen += 1;
      if (candidateSlot >= 0) baselineRefineCandidates[candidateSlot] = cell;
    }
    if (refineActive && (tailCandidate || boundaryBand)) {
      const candidateSlot = reservoirSlot(interestingSeen, refineCandidateCap);
      interestingSeen += 1;
      if (candidateSlot >= 0) refineCandidates[candidateSlot] = cell;
    }
  }

  const refineTier = (
    candidates: Int32Array,
    candidatesSeen: number,
    capacitySlots: number,
    warmup: number,
    subdivision: number,
  ): RefinementTier | null => {
    const candidateCount = Math.min(candidatesSeen, candidates.length);
    const subCells = subdivision * subdivision;
    const jobs = candidateCount * subCells;
    if (jobs === 0 || capacitySlots <= 0) return emptyTier(sampleCount);
    const parents = new Int32Array(jobs);
    const coordinates = new Float64Array(jobs * 2);
    const cellWidth = (RE_MAX - RE_MIN) / sampleWidth;
    const cellHeight = (IM_MAX - IM_MIN) / sampleHeight;
    for (let job = 0; job < jobs; job += 1) {
      const parent = candidates[(job / subCells) | 0];
      const sub = job % subCells;
      const px = parent % sampleWidth;
      const py = (parent - px) / sampleWidth;
      const centreRe = cellCoordinate(RE_MIN, RE_MAX, px, sampleWidth);
      const centreIm = py === Math.floor(sampleHeight / 2)
        ? 0
        : cellCoordinate(IM_MIN, IM_MAX, py, sampleHeight);
      const sx = sub % subdivision;
      const sy = (sub - sx) / subdivision;
      parents[job] = parent;
      coordinates[job * 2] =
        centreRe + ((sx + 0.5) / subdivision - 0.5) * cellWidth;
      coordinates[job * 2 + 1] =
        centreIm + ((sy + 0.5) / subdivision - 0.5) * cellHeight;
    }
    const batches = sampleInBatches(sampler, coordinates, warmup, sampleCount);
    if (!batches) return null;
    const rowsPerJob = new Uint8Array(jobs);
    let storable = 0;
    for (const { first, sample } of batches) {
      for (let local = 0; local < sample.cellCount; local += 1) {
        if (sample.escaped[local] === 1) continue;
        rowsPerJob[first + local] = distinctPointCount(sample.periods[local], sampleCount);
        storable += 1;
      }
    }
    // Surviving sub-cells pack in job order; a tier that cannot hold them
    // all is repacked in a uniform order over the jobs and thins evenly.
    const packed = packItems(
      rowsPerJob,
      storable,
      capacitySlots,
      sampleCount,
      REFINEMENT_ADMISSION_SEED,
    );
    return {
      packed,
      rowsPerJob,
      batches,
      parents,
      subCells: packed.stored,
      rows: packed.packer.rowCount,
      samplerBytes: batches.reduce((sum, batch) => sum + sampleResultBytes(batch.sample), 0),
      layoutBytes: packed.bytes + rowsPerJob.byteLength + parents.byteLength,
    };
  };

  let baselineRefine = emptyTier(sampleCount);
  if (boundaryDetailActive && baselineRefineActive) {
    // The detail-0 refinement sits in front of the raised tier so a fully
    // gated draw submits the genuine baseline cloud.
    const built = refineTier(
      baselineRefineCandidates,
      baselineInterestingSeen,
      Math.max(0, baselineMaxSlots - baseSlots),
      baselineRefineWarmup,
      baselineRefineSubdivision,
    );
    if (!built) return null;
    baselineRefine = built;
  }
  const boundaryDetailBaseSlots = baseSlots + baselineRefine.packed.packer.slotCount;
  let refine = emptyTier(sampleCount);
  if (refineActive) {
    const built = refineTier(
      refineCandidates,
      interestingSeen,
      Math.max(0, maxSlots - boundaryDetailBaseSlots),
      refineWarmup,
      refineSubdivision,
    );
    if (!built) return null;
    refine = built;
  }
  samplerBytes += baselineRefine.samplerBytes + refine.samplerBytes;

  const slotCount = boundaryDetailBaseSlots + refine.packed.packer.slotCount;
  const pointCount = slotCount * sampleCount;
  const positions = new Float32Array(pointCount * 3);
  const periods = new Float32Array(pointCount);
  const centres = new Float32Array(pointCount);
  const boundaries = new Float32Array(pointCount);
  const weights = new Float32Array(pointCount);
  const sampleIndices = new Float32Array(pointCount).fill(sampleCount);
  const rowsBySampleIndex = new Uint32Array(sampleCount);
  const cellScale = realSliceOnly
    ? (RE_MAX - RE_MIN) / sampleWidth
    : ((RE_MAX - RE_MIN) / sampleWidth + (IM_MAX - IM_MIN) / sampleHeight) / 2;
  const distances = boundaryDistanceField(escapeMask, sampleWidth, sampleHeight);

  // Each stored cell writes its distinct points down its slot: rows
  // firstRow..firstRow+rows-1 carry orbit samples 0..rows-1 in order.
  const writeTier = (
    tier: PackedTier,
    rowsPerItem: Uint8Array,
    slotOffset: number,
    batches: SampleBatch[],
    parents: Int32Array | null,
    weight: number,
  ): void => {
    const batchOf = batchIndexLookup(batches);
    for (let stored = 0; stored < tier.stored; stored += 1) {
      const item = tier.items[stored];
      const batch = batches[batchOf(item)];
      const sample = batch.sample;
      const local = item - batch.first;
      const slot = slotOffset + tier.slots[stored];
      const firstRow = tier.rows[stored];
      const rows = rowsPerItem[item];
      const re = sample.coordinates[local * 2];
      const im = sample.coordinates[local * 2 + 1];
      const period = sample.periods[local];
      const centre = sample.centres[local];
      const boundary = Math.min(
        1,
        distances[parents === null ? item : parents[item]] * cellScale,
      );
      for (let k = 0; k < rows; k += 1) {
        const point = (firstRow + k) * slotCount + slot;
        const position = point * 3;
        positions[position] = re;
        positions[position + 1] = im;
        positions[position + 2] = sample.samples[k * sample.cellCount + local];
        periods[point] = period;
        centres[point] = centre;
        boundaries[point] = boundary;
        weights[point] = weight;
        sampleIndices[point] = k;
        rowsBySampleIndex[k] += 1;
      }
    }
  };
  writeTier(baseTier, baseRowsPerCell, 0, base, null, 1);
  writeTier(
    baselineRefine.packed,
    baselineRefine.rowsPerJob,
    baseSlots,
    baselineRefine.batches,
    baselineRefine.parents,
    baselineRefinePointWeight,
  );
  writeTier(
    refine.packed,
    refine.rowsPerJob,
    boundaryDetailBaseSlots,
    refine.batches,
    refine.parents,
    refinePointWeight,
  );

  const buildBytes = positions.byteLength
    + periods.byteLength
    + centres.byteLength
    + boundaries.byteLength
    + weights.byteLength
    + sampleIndices.byteLength
    + escapeMask.byteLength
    + tailMask.byteLength
    + baseRowsPerCell.byteLength
    + baseTier.bytes
    + distances.byteLength
    + baselineRefineCandidates.byteLength
    + refineCandidates.byteLength
    + baselineRefine.layoutBytes
    + refine.layoutBytes;
  return {
    positions,
    periods,
    centres,
    boundaries,
    weights,
    sampleIndices,
    sampleCount,
    slotCount,
    boundaryDetailBaseSlots: boundaryDetailActive ? boundaryDetailBaseSlots : 0,
    candidateCells: baseCellCount,
    boundedCandidates,
    baseCells: baseTier.stored,
    baseRows: baseTier.packer.rowCount,
    refinedSubCells: baselineRefine.subCells + refine.subCells,
    refinedRows: baselineRefine.rows + refine.rows,
    rowsBySampleIndex,
    buildBytes,
    samplerBytes,
  };
}

/**
 * Sample `coordinates` in calls of at most MAX_SAMPLE_JOBS_PER_CALL jobs.
 * Null when any call fails; a failed batch is never dropped silently.
 */
function sampleInBatches(
  sampler: OrbitSampler,
  coordinates: Float64Array,
  warmupIterations: number,
  sampleCount: number,
): SampleBatch[] | null {
  const jobs = coordinates.length / 2;
  const batches: SampleBatch[] = [];
  for (let first = 0; first < jobs; first += MAX_SAMPLE_JOBS_PER_CALL) {
    const count = Math.min(MAX_SAMPLE_JOBS_PER_CALL, jobs - first);
    const slice = first === 0 && count === jobs
      ? coordinates
      : coordinates.slice(first * 2, (first + count) * 2);
    const sample = sampler.sample(slice, warmupIterations, sampleCount);
    if (!sample) return null;
    batches.push({ first, sample });
  }
  return batches;
}

/** Resolve a global job index to the index of its batch in `batches`. */
function batchIndexLookup(batches: SampleBatch[]): (job: number) => number {
  if (batches.length === 1) return () => 0;
  return (job) => {
    let low = 0;
    let high = batches.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (batches[middle].first <= job) low = middle;
      else high = middle - 1;
    }
    return low;
  };
}

/** True on either sampled side of an escaped/non-escaped cell boundary. */
function isEscapeEdgeCell(
  escapeMask: Uint8Array,
  width: number,
  height: number,
  index: number,
): boolean {
  const x = index % width;
  const y = (index - x) / width;
  const escaped = escapeMask[index];
  for (let dy = -1; dy <= 1; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      if (escapeMask[ny * width + nx] !== escaped) return true;
    }
  }
  return false;
}

/** Two-pass chamfer distance from each cell to the sampled escape boundary. */
export function boundaryDistanceField(
  escapeMask: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const distances = new Float32Array(escapeMask.length);
  const far = 1e9;
  const diagonal = Math.SQRT2;
  for (let index = 0; index < escapeMask.length; index += 1) {
    distances[index] = escapeMask[index] === 1 ? 0 : far;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let best = distances[index];
      if (x > 0) best = Math.min(best, distances[index - 1] + 1);
      if (y > 0) {
        best = Math.min(best, distances[index - width] + 1);
        if (x > 0) best = Math.min(best, distances[index - width - 1] + diagonal);
        if (x < width - 1) {
          best = Math.min(best, distances[index - width + 1] + diagonal);
        }
      }
      distances[index] = best;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      let best = distances[index];
      if (x < width - 1) best = Math.min(best, distances[index + 1] + 1);
      if (y < height - 1) {
        best = Math.min(best, distances[index + width] + 1);
        if (x < width - 1) {
          best = Math.min(best, distances[index + width + 1] + diagonal);
        }
        if (x > 0) best = Math.min(best, distances[index + width - 1] + diagonal);
      }
      distances[index] = best;
    }
  }
  return distances;
}

/** Deterministic reservoir sampling keeps a full-domain point budget. */
export function reservoirSlot(itemIndex: number, capacity: number): number {
  if (itemIndex < capacity) return itemIndex;
  let hash = (itemIndex + 0x9e3779b9) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
  hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
  hash = (hash ^ (hash >>> 15)) >>> 0;
  const candidate = Math.floor(hash / 0x1_0000_0000 * (itemIndex + 1));
  return candidate < capacity ? candidate : -1;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = requireResource(gl.createProgram(), "orbit sampler program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`Orbit sampler program link failed: ${message}`);
  }
  return program;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = requireResource(gl.createShader(type), "orbit sampler shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "unknown compile error";
    gl.deleteShader(shader);
    throw new Error(`Orbit sampler shader compile failed: ${message}`);
  }
  return shader;
}

function createTexture2D(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  data: Float32Array | null,
): WebGLTexture {
  const texture = requireResource(gl.createTexture(), "orbit sampler texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  setNearestTextureParameters(gl, gl.TEXTURE_2D);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    width,
    height,
    0,
    gl.RGBA,
    gl.FLOAT,
    data,
  );
  return texture;
}

function setNearestTextureParameters(gl: WebGL2RenderingContext, target: number): void {
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function bindTexture(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  texture: WebGLTexture,
  unit: number,
): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(gl.getUniformLocation(program, name), unit);
}

function requireCompleteFramebuffer(gl: WebGL2RenderingContext): void {
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("orbit sampler framebuffer is incomplete");
  }
}

function requireResource<T>(resource: T | null, label: string): T {
  if (resource === null) throw new Error(`Unable to create ${label}`);
  return resource;
}
