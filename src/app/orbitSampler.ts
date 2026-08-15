import {
  IM_MAX,
  IM_MIN,
  MAX_DETECTABLE_PERIOD,
  PERIOD_TOLERANCE,
  RE_MAX,
  RE_MIN,
  SAMPLE_CLIP,
  cellCoordinate,
} from "../sims/logistic-mandelbrot/model.ts";

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
layout(location = 0) out vec4 outMetadata;

${DOUBLE_SINGLE_GLSL}

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

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  int index = pixel.y * u_width + pixel.x;
  vec4 packedState = texelFetch(u_state, pixel, 0);
  if (index >= u_cellCount || packedState.x > 2.0) {
    outMetadata = vec4(0.0, 1.0, 1.0, 0.0);
    return;
  }

  int period = 0;
  for (int q = 1; q <= ${MAX_DETECTABLE_PERIOD}; q += 1) {
    if (q >= u_sampleCount) break;
    bool matches = true;
    for (int lane = 0; lane < ${MAX_SAMPLE_COUNT}; lane += 1) {
      if (lane + q >= u_sampleCount) break;
      float delta = orbitSample(pixel, lane + q) - orbitSample(pixel, lane);
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

  float interior = 1.0;
  if (period > 0) {
    vec4 coordinate = texelFetch(u_coords, pixel, 0);
    vec2 cr = coordinate.xy;
    vec2 ci = coordinate.zw;
    vec2 zr = packedState.xy;
    vec2 zi = packedState.zw;
    float multiplier = 1.0;
    for (int step = 0; step < ${MAX_DETECTABLE_PERIOD}; step += 1) {
      if (step >= period) break;
      orbitStep(zr, zi, cr, ci);
      multiplier *= 2.0 * length(vec2(dsValue(zr), dsValue(zi)));
    }
    interior = clamp(multiplier, 0.0, 1.0);
  }
  outMetadata = vec4(float(period), interior, 0.0, 0.0);
}
`;

export interface OrbitCloudBuffers {
  positions: Float32Array;
  periods: Float32Array;
  interiors: Float32Array;
  boundaries: Float32Array;
  weights: Float32Array;
  survivingCells: number;
  boundaryDetailBaseCells: number;
}

export interface GpuOrbitCloudOptions {
  sampleWidth: number;
  sampleHeight: number;
  sampleCount: number;
  warmupIterations: number;
  realSliceOnly: boolean;
  maxSurvivingCells: number;
  baseSlotCap: number;
  baselineMaxSurvivingCells: number;
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

interface OrbitSampleResult {
  cellCount: number;
  sampleCount: number;
  coordinates: Float64Array;
  samples: Float32Array;
  periods: Float32Array;
  interiors: Float32Array;
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
    const escaped = new Uint8Array(cellCount);
    for (let cell = 0; cell < cellCount; cell += 1) {
      periods[cell] = metadata[cell * 4];
      interiors[cell] = metadata[cell * 4 + 1];
      escaped[cell] = metadata[cell * 4 + 2] > 0.5 ? 1 : 0;
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
    return { cellCount, sampleCount, coordinates, samples, periods, interiors, escaped };
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
    maxSurvivingCells,
    baseSlotCap,
    baselineMaxSurvivingCells,
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
  const base = sampler.sample(baseCoordinates, warmupIterations, sampleCount);
  if (!base) return null;

  const escapeMask = base.escaped.slice();
  const baseSlots = new Int32Array(baseSlotCap);
  const baselineRefineCandidates = new Int32Array(
    boundaryDetailActive ? baselineRefineCandidateCap : 0,
  );
  const refineCandidates = new Int32Array(refineCandidateCap);
  let survivorsSeen = 0;
  let baselineInterestingSeen = 0;
  let interestingSeen = 0;
  for (let cell = 0; cell < base.cellCount; cell += 1) {
    const escaped = base.escaped[cell] === 1;
    const boundaryBand =
      boundaryDetailActive &&
      isEscapeEdgeCell(base.escaped, sampleWidth, sampleHeight, cell);
    if (escaped && !boundaryBand) continue;
    if (!escaped) {
      const slot = reservoirSlot(survivorsSeen, baseSlotCap);
      survivorsSeen += 1;
      if (slot >= 0) baseSlots[slot] = cell;
    }
    const period = escaped ? 0 : base.periods[cell];
    const tailCandidate = !escaped &&
      (period === 0 || period >= refinePeriodThreshold);
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

  const refineStart = Math.min(survivorsSeen, baseSlotCap);
  type RefinementBatch = {
    sample: OrbitSampleResult | null;
    parents: Int32Array;
    slots: Int32Array;
    count: number;
  };
  const emptyBatch = (): RefinementBatch => ({
    sample: null,
    parents: new Int32Array(0),
    slots: new Int32Array(0),
    count: 0,
  });
  const buildRefinement = (
    candidates: Int32Array,
    candidatesSeen: number,
    capacity: number,
    warmup: number,
    subdivision: number,
    countReduction = 0,
  ): RefinementBatch | null => {
    const candidateCount = Math.min(candidatesSeen, candidates.length);
    const subCells = subdivision * subdivision;
    const jobs = candidateCount * subCells;
    if (jobs === 0 || capacity <= 0) return emptyBatch();
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
    const sampled = sampler.sample(coordinates, warmup, sampleCount);
    if (!sampled) return null;
    let seen = 0;
    for (let job = 0; job < sampled.cellCount; job += 1) {
      if (sampled.escaped[job] === 1) continue;
      seen += 1;
    }
    const count = Math.max(
      0,
      Math.min(seen, capacity) - countReduction,
    );
    const slots = new Int32Array(count);
    let selectionSeen = 0;
    for (let job = 0; job < sampled.cellCount; job += 1) {
      if (sampled.escaped[job] === 1) continue;
      const slot = reservoirSlot(selectionSeen, count);
      selectionSeen += 1;
      if (slot >= 0) slots[slot] = job;
    }
    return {
      sample: sampled,
      parents,
      slots,
      count,
    };
  };

  let baselineRefine = emptyBatch();
  if (boundaryDetailActive && baselineRefineActive) {
    // Keep the ordinary detail-0 refinement byte-for-byte at the front of
    // each sample so a fully gated draw submits the genuine baseline cloud.
    const baselineCapacity = Math.max(
      0,
      baselineMaxSurvivingCells - refineStart,
    );
    const built = buildRefinement(
      baselineRefineCandidates,
      baselineInterestingSeen,
      baselineCapacity,
      baselineRefineWarmup,
      baselineRefineSubdivision,
    );
    if (!built) return null;
    baselineRefine = built;
  }
  const boundaryDetailBaseCells = refineStart + baselineRefine.count;
  const refineCapacity = Math.max(0, maxSurvivingCells - refineStart);
  let refine = emptyBatch();
  if (refineActive) {
    const built = buildRefinement(
      refineCandidates,
      interestingSeen,
      refineCapacity,
      refineWarmup,
      refineSubdivision,
      boundaryDetailActive ? baselineRefine.count : 0,
    );
    if (!built) return null;
    refine = built;
  }
  const survivingCells = boundaryDetailBaseCells + refine.count;
  const pointCount = survivingCells * sampleCount;
  const positions = new Float32Array(pointCount * 3);
  const periods = new Float32Array(pointCount);
  const interiors = new Float32Array(pointCount);
  const boundaries = new Float32Array(pointCount);
  const weights = new Float32Array(pointCount).fill(1);
  const slotCells = new Int32Array(survivingCells);

  for (let slot = 0; slot < refineStart; slot += 1) {
    slotCells[slot] = baseSlots[slot];
  }
  for (let slot = 0; slot < baselineRefine.count; slot += 1) {
    slotCells[refineStart + slot] =
      baselineRefine.parents[baselineRefine.slots[slot]];
  }
  for (let slot = 0; slot < refine.count; slot += 1) {
    slotCells[boundaryDetailBaseCells + slot] =
      refine.parents[refine.slots[slot]];
  }
  const cellScale = realSliceOnly
    ? (RE_MAX - RE_MIN) / sampleWidth
    : ((RE_MAX - RE_MIN) / sampleWidth + (IM_MAX - IM_MIN) / sampleHeight) / 2;
  const distances = boundaryDistanceField(escapeMask, sampleWidth, sampleHeight);

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const sampleOffset = sample * survivingCells;
    for (let slot = 0; slot < refineStart; slot += 1) {
      const cell = baseSlots[slot];
      const point = sampleOffset + slot;
      const position = point * 3;
      positions[position] = base.coordinates[cell * 2];
      positions[position + 1] = base.coordinates[cell * 2 + 1];
      positions[position + 2] = base.samples[sample * base.cellCount + cell];
      periods[point] = base.periods[cell];
      interiors[point] = base.interiors[cell];
      boundaries[point] = Math.min(1, distances[cell] * cellScale);
    }
    if (baselineRefine.sample) {
      for (let slot = 0; slot < baselineRefine.count; slot += 1) {
        const job = baselineRefine.slots[slot];
        const point = sampleOffset + refineStart + slot;
        const position = point * 3;
        positions[position] = baselineRefine.sample.coordinates[job * 2];
        positions[position + 1] =
          baselineRefine.sample.coordinates[job * 2 + 1];
        positions[position + 2] =
          baselineRefine.sample.samples[
            sample * baselineRefine.sample.cellCount + job
          ];
        periods[point] = baselineRefine.sample.periods[job];
        interiors[point] = baselineRefine.sample.interiors[job];
        boundaries[point] = Math.min(
          1,
          distances[slotCells[refineStart + slot]] * cellScale,
        );
        weights[point] = baselineRefinePointWeight;
      }
    }
    if (!refine.sample) continue;
    for (let slot = 0; slot < refine.count; slot += 1) {
      const job = refine.slots[slot];
      const point = sampleOffset + boundaryDetailBaseCells + slot;
      const position = point * 3;
      positions[position] = refine.sample.coordinates[job * 2];
      positions[position + 1] = refine.sample.coordinates[job * 2 + 1];
      positions[position + 2] =
        refine.sample.samples[sample * refine.sample.cellCount + job];
      periods[point] = refine.sample.periods[job];
      interiors[point] = refine.sample.interiors[job];
      boundaries[point] = Math.min(
        1,
        distances[slotCells[boundaryDetailBaseCells + slot]] * cellScale,
      );
      weights[point] = refinePointWeight;
    }
  }
  return {
    positions,
    periods,
    interiors,
    boundaries,
    weights,
    survivingCells,
    boundaryDetailBaseCells: boundaryDetailActive
      ? boundaryDetailBaseCells
      : 0,
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
