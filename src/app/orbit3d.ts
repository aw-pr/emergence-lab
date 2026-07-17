import {
  DEFAULT_SAMPLE_COUNT,
  DEFAULT_WARMUP_ITERATIONS,
  ESCAPED,
  IM_MAX,
  IM_MIN,
  RE_MAX,
  RE_MIN,
  cellCoordinate,
  sampleAttractorCell,
} from "../sims/logistic-mandelbrot/model.ts";

const POINT_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 a_position;
uniform mat4 u_viewProjection;
uniform float u_pointSize;
out vec3 v_colour;

void main() {
  vec3 world = vec3(
    (a_position.x + 0.5) * 0.78,
    a_position.z * 0.56,
    a_position.y * 0.85
  );
  gl_Position = u_viewProjection * vec4(world, 1.0);
  gl_PointSize = u_pointSize;

  float height = clamp((a_position.z + 2.0) * 0.25, 0.0, 1.0);
  float offAxis = clamp(abs(a_position.y), 0.0, 1.0);
  vec3 low = vec3(0.08, 0.38, 0.92);
  vec3 high = vec3(1.0, 0.35, 0.12);
  v_colour = mix(low, high, height) * mix(1.35, 0.82, offAxis);
}
`;

const POINT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 v_colour;
out vec4 outColor;

void main() {
  vec2 offset = gl_PointCoord - vec2(0.5);
  float coverage = 1.0 - smoothstep(0.18, 0.5, length(offset));
  outColor = vec4(v_colour * coverage * 0.032, coverage);
}
`;

const MARKER_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 a_position;
uniform mat4 u_viewProjection;
uniform float u_pointSize;

void main() {
  vec3 world = vec3(
    (a_position.x + 0.5) * 0.78,
    a_position.z * 0.56,
    a_position.y * 0.85
  );
  gl_Position = u_viewProjection * vec4(world, 1.0);
  gl_PointSize = u_pointSize;
}
`;

const MARKER_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec3 u_colour;
out vec4 outColor;

void main() {
  vec2 offset = gl_PointCoord - vec2(0.5);
  float coverage = 1.0 - smoothstep(0.24, 0.5, length(offset));
  outColor = vec4(u_colour * coverage * 0.42, coverage);
}
`;

const TONEMAP_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const TONEMAP_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_accumulation;
uniform float u_exposure;
in vec2 v_uv;
out vec4 outColor;

void main() {
  vec3 hdr = texture(u_accumulation, v_uv).rgb;
  vec3 mapped = vec3(1.0) - exp(-hdr * u_exposure);
  mapped = pow(mapped, vec3(1.0 / 2.2));
  vec3 background = vec3(0.002, 0.004, 0.012);
  outColor = vec4(background + mapped, 1.0);
}
`;

// Grid dimensions are rounded independently, so allow one percent around the
// preset ceilings when recovering the active quality tier from their product.
const PERFORMANCE_CELL_CEILING = Math.ceil(384 * 384 * 1.01);
const BALANCED_CELL_CEILING = Math.ceil(640 * 640 * 1.01);
const HIGH_CELL_CEILING = Math.ceil(960 * 960 * 1.01);
const POINT_BUDGETS = {
  performance: 1_000_000,
  balanced: 2_400_000,
  high: 3_400_000,
  ultra: 4_800_000,
} as const;

const SURVIVING_CELL_ESTIMATE = 0.22;
const BUILD_SLICE_MS = 8;
const CAMERA_FIELD_OF_VIEW = Math.PI / 4.8;
const MARKER_PLANE_ORBIT_VALUE = -2.08;
const DEFAULT_CAMERA_EYE = [2.9, 2.15, 3.6] as const;
const DEFAULT_MARKER_RE = -1;
const DEFAULT_MARKER_IM = 0;

type OrbitParams = Record<string, number | boolean | string>;

export interface Orbit3DStats {
  pointCount: number;
  pointBudget: number;
  building: boolean;
}

export interface Orbit3DMarkerReadout {
  re: number;
  im: number;
  period: number;
}

export interface Orbit3DProjectedPoint {
  x: number;
  y: number;
}

interface OrbitCameraState {
  azimuth: number;
  elevation: number;
  distance: number;
  target: [number, number, number];
}

export class Orbit3DPointCloud {
  readonly available: boolean;

  private readonly gl: WebGL2RenderingContext;
  private readonly pointProgram: WebGLProgram;
  private readonly markerProgram: WebGLProgram;
  private readonly toneMapProgram: WebGLProgram;
  private readonly pointVao: WebGLVertexArrayObject;
  private readonly markerVao: WebGLVertexArrayObject;
  private readonly toneMapVao: WebGLVertexArrayObject;
  private readonly pointBuffer: WebGLBuffer;
  private readonly markerBuffer: WebGLBuffer;
  private readonly quadBuffer: WebGLBuffer;
  private readonly viewProjectionUniform: WebGLUniformLocation;
  private readonly pointSizeUniform: WebGLUniformLocation;
  private readonly markerViewProjectionUniform: WebGLUniformLocation;
  private readonly markerPointSizeUniform: WebGLUniformLocation;
  private readonly markerColourUniform: WebGLUniformLocation;
  private readonly exposureUniform: WebGLUniformLocation;
  private accumulationTexture: WebGLTexture | null = null;
  private accumulationFbo: WebGLFramebuffer | null = null;
  private targetWidth = 0;
  private targetHeight = 0;
  private pointCount = 0;
  private pointBudget = 0;
  private buildGeneration = 0;
  private buildTimer: number | null = null;
  private building = false;
  private camera = defaultCameraState();
  private marker: Orbit3DMarkerReadout = {
    re: DEFAULT_MARKER_RE,
    im: DEFAULT_MARKER_IM,
    period: 0,
  };
  private markerOrbitPointCount = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.pointProgram = createProgram(gl, POINT_VERTEX_SHADER, POINT_FRAGMENT_SHADER);
    this.markerProgram = createProgram(gl, MARKER_VERTEX_SHADER, MARKER_FRAGMENT_SHADER);
    this.toneMapProgram = createProgram(
      gl,
      TONEMAP_VERTEX_SHADER,
      TONEMAP_FRAGMENT_SHADER,
    );
    this.pointBuffer = requireResource(gl.createBuffer(), "orbit3d point buffer");
    this.markerBuffer = requireResource(gl.createBuffer(), "orbit3d marker buffer");
    this.quadBuffer = requireResource(gl.createBuffer(), "orbit3d quad buffer");
    this.pointVao = requireResource(gl.createVertexArray(), "orbit3d point VAO");
    this.markerVao = requireResource(gl.createVertexArray(), "orbit3d marker VAO");
    this.toneMapVao = requireResource(gl.createVertexArray(), "orbit3d tone-map VAO");

    gl.bindVertexArray(this.pointVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
    const pointLocation = gl.getAttribLocation(this.pointProgram, "a_position");
    gl.enableVertexAttribArray(pointLocation);
    gl.vertexAttribPointer(pointLocation, 3, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(this.markerVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.markerBuffer);
    const markerLocation = gl.getAttribLocation(this.markerProgram, "a_position");
    gl.enableVertexAttribArray(markerLocation);
    gl.vertexAttribPointer(markerLocation, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.bindVertexArray(this.toneMapVao);
    const quadLocation = gl.getAttribLocation(this.toneMapProgram, "a_position");
    gl.enableVertexAttribArray(quadLocation);
    gl.vertexAttribPointer(quadLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.viewProjectionUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_viewProjection"),
      "orbit3d view-projection uniform",
    );
    this.pointSizeUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_pointSize"),
      "orbit3d point-size uniform",
    );
    this.markerViewProjectionUniform = requireResource(
      gl.getUniformLocation(this.markerProgram, "u_viewProjection"),
      "orbit3d marker view-projection uniform",
    );
    this.markerPointSizeUniform = requireResource(
      gl.getUniformLocation(this.markerProgram, "u_pointSize"),
      "orbit3d marker point-size uniform",
    );
    this.markerColourUniform = requireResource(
      gl.getUniformLocation(this.markerProgram, "u_colour"),
      "orbit3d marker colour uniform",
    );
    this.exposureUniform = requireResource(
      gl.getUniformLocation(this.toneMapProgram, "u_exposure"),
      "orbit3d exposure uniform",
    );
    gl.useProgram(this.toneMapProgram);
    gl.uniform1i(gl.getUniformLocation(this.toneMapProgram, "u_accumulation"), 0);

    this.updateMarker(DEFAULT_MARKER_RE, DEFAULT_MARKER_IM);

    this.available = this.createAccumulationTarget(1, 1);
  }

  get stats(): Orbit3DStats {
    return {
      pointCount: this.pointCount,
      pointBudget: this.pointBudget,
      building: this.building,
    };
  }

  get markerReadout(): Orbit3DMarkerReadout {
    return { ...this.marker };
  }

  orbit(deltaAzimuth: number, deltaElevation: number): void {
    this.camera.azimuth += deltaAzimuth;
    this.camera.elevation = Math.min(
      Math.PI / 2 - 0.08,
      Math.max(0.08, this.camera.elevation + deltaElevation),
    );
  }

  dolly(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.camera.distance = Math.min(12, Math.max(1.6, this.camera.distance * factor));
  }

  resetCamera(): void {
    this.camera = defaultCameraState();
  }

  projectMarker(width: number, height: number): Orbit3DProjectedPoint | null {
    const aspect = Math.max(0.25, width / Math.max(1, height));
    const matrix = cameraMatrix(aspect, this.camera);
    const world = markerWorldPosition(this.marker.re, this.marker.im);
    const clip = transformPoint(matrix, world);
    if (clip[3] <= 0) return null;
    return {
      x: clip[0] / clip[3] * 0.5 + 0.5,
      y: 0.5 - clip[1] / clip[3] * 0.5,
    };
  }

  setMarkerFromViewport(
    viewportX: number,
    viewportY: number,
    width: number,
    height: number,
  ): Orbit3DMarkerReadout | null {
    const aspect = Math.max(0.25, width / Math.max(1, height));
    const eye = cameraEye(this.camera);
    const forward = normalise3([
      this.camera.target[0] - eye[0],
      this.camera.target[1] - eye[1],
      this.camera.target[2] - eye[2],
    ]);
    const right = normalise3(cross3(forward, [0, 1, 0]));
    const cameraUp = normalise3(cross3(right, forward));
    const tangent = Math.tan(CAMERA_FIELD_OF_VIEW / 2);
    const ndcX = viewportX * 2 - 1;
    const ndcY = 1 - viewportY * 2;
    const ray = normalise3([
      forward[0] + right[0] * ndcX * tangent * aspect + cameraUp[0] * ndcY * tangent,
      forward[1] + right[1] * ndcX * tangent * aspect + cameraUp[1] * ndcY * tangent,
      forward[2] + right[2] * ndcX * tangent * aspect + cameraUp[2] * ndcY * tangent,
    ]);
    const planeY = MARKER_PLANE_ORBIT_VALUE * 0.56;
    if (Math.abs(ray[1]) < 1e-6) return null;
    const distance = (planeY - eye[1]) / ray[1];
    if (distance <= 0) return null;
    const worldX = eye[0] + ray[0] * distance;
    const worldZ = eye[2] + ray[2] * distance;
    const re = Math.min(RE_MAX, Math.max(RE_MIN, worldX / 0.78 - 0.5));
    const im = Math.min(IM_MAX, Math.max(IM_MIN, worldZ / 0.85));
    this.updateMarker(re, im);
    return this.markerReadout;
  }

  rebuild(width: number, height: number, params: OrbitParams): void {
    this.cancelBuild();
    const generation = this.buildGeneration;
    const inputWidth = Math.max(1, Math.floor(width));
    const inputHeight = Math.max(1, Math.floor(height));
    const sampleCount = boundedInteger(
      params.sampleCount,
      8,
      96,
      DEFAULT_SAMPLE_COUNT,
    );
    const plottedIterations = Math.min(
      sampleCount,
      boundedInteger(params.plottedIterations, 1, 96, sampleCount),
    );
    const warmupIterations = boundedInteger(
      params.warmupIterations,
      16,
      2000,
      DEFAULT_WARMUP_ITERATIONS,
    );
    const realSliceOnly = params.realSliceOnly === true;
    const pointBudget = pointBudgetFor(inputWidth * inputHeight);
    const desiredCells = Math.ceil(
      pointBudget / (plottedIterations * SURVIVING_CELL_ESTIMATE),
    );
    const candidateCells = Math.min(inputWidth * inputHeight, desiredCells);
    const aspect = inputWidth / inputHeight;
    const sampleWidth = realSliceOnly
      ? candidateCells
      : Math.max(1, Math.min(inputWidth, Math.round(Math.sqrt(candidateCells * aspect))));
    const sampleHeight = realSliceOnly
      ? 1
      : Math.max(1, Math.min(inputHeight, Math.ceil(candidateCells / sampleWidth)));
    const positions = new Float32Array(pointBudget * 3);
    const orbitSamples = new Float32Array(sampleCount);
    let cell = 0;
    let points = 0;
    let uploadedPoints = 0;

    this.pointCount = 0;
    this.pointBudget = pointBudget;
    this.building = true;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions.byteLength, gl.DYNAMIC_DRAW);

    const buildSlice = (): void => {
      if (generation !== this.buildGeneration) return;
      const stopAt = performance.now() + BUILD_SLICE_MS;
      while (
        cell < sampleWidth * sampleHeight &&
        points < pointBudget &&
        performance.now() < stopAt
      ) {
        const x = cell % sampleWidth;
        const y = (cell - x) / sampleWidth;
        const cRe = cellCoordinate(RE_MIN, RE_MAX, x, sampleWidth);
        const cIm =
          realSliceOnly || y === Math.floor(sampleHeight / 2)
            ? 0
            : cellCoordinate(IM_MIN, IM_MAX, y, sampleHeight);
        const result = sampleAttractorCell(
          cRe,
          cIm,
          warmupIterations,
          sampleCount,
          orbitSamples,
          0,
        );
        if (result !== ESCAPED) {
          const count = Math.min(plottedIterations, pointBudget - points);
          for (let sample = 0; sample < count; sample += 1) {
            const offset = (points + sample) * 3;
            positions[offset] = cRe;
            positions[offset + 1] = cIm;
            positions[offset + 2] = orbitSamples[sample];
          }
          points += count;
        }
        cell += 1;
      }

      if (points > uploadedPoints) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          uploadedPoints * 3 * Float32Array.BYTES_PER_ELEMENT,
          positions.subarray(uploadedPoints * 3, points * 3),
        );
        uploadedPoints = points;
        this.pointCount = points;
      }

      if (cell < sampleWidth * sampleHeight && points < pointBudget) {
        this.buildTimer = window.setTimeout(buildSlice, 0);
        return;
      }
      this.buildTimer = null;
      this.building = false;
    };

    buildSlice();
  }

  cancelBuild(): void {
    this.buildGeneration += 1;
    if (this.buildTimer !== null) {
      window.clearTimeout(this.buildTimer);
      this.buildTimer = null;
    }
    this.building = false;
  }

  draw(width: number, height: number, exposure = 1.35): boolean {
    if (!this.available || !this.ensureAccumulationTarget(width, height)) return false;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumulationFbo);
    gl.viewport(0, 0, this.targetWidth, this.targetHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.pointProgram);
    const viewProjection = cameraMatrix(this.targetWidth / this.targetHeight, this.camera);
    gl.uniformMatrix4fv(
      this.viewProjectionUniform,
      false,
      viewProjection,
    );
    gl.uniform1f(this.pointSizeUniform, Math.min(2, Math.max(1, width / 900)));
    gl.bindVertexArray(this.pointVao);
    gl.drawArrays(gl.POINTS, 0, this.pointCount);

    gl.useProgram(this.markerProgram);
    gl.uniformMatrix4fv(this.markerViewProjectionUniform, false, viewProjection);
    gl.bindVertexArray(this.markerVao);
    if (this.markerOrbitPointCount > 0) {
      gl.uniform1f(this.markerPointSizeUniform, Math.min(8, Math.max(5, width / 180)));
      gl.uniform3f(this.markerColourUniform, 0.12, 0.95, 1);
      gl.drawArrays(gl.POINTS, 0, this.markerOrbitPointCount);
    }
    gl.uniform1f(this.markerPointSizeUniform, Math.min(14, Math.max(9, width / 100)));
    gl.uniform3f(this.markerColourUniform, 1, 0.72, 0.12);
    gl.drawArrays(gl.POINTS, this.markerOrbitPointCount, 1);
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.002, 0.004, 0.012, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.toneMapProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumulationTexture);
    gl.uniform1f(this.exposureUniform, Math.max(0.1, exposure));
    gl.bindVertexArray(this.toneMapVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    return true;
  }

  destroy(): void {
    this.cancelBuild();
    this.releaseAccumulationTarget();
    const gl = this.gl;
    gl.deleteVertexArray(this.pointVao);
    gl.deleteVertexArray(this.markerVao);
    gl.deleteVertexArray(this.toneMapVao);
    gl.deleteBuffer(this.pointBuffer);
    gl.deleteBuffer(this.markerBuffer);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteProgram(this.pointProgram);
    gl.deleteProgram(this.markerProgram);
    gl.deleteProgram(this.toneMapProgram);
  }

  private ensureAccumulationTarget(width: number, height: number): boolean {
    const targetWidth = Math.max(1, Math.floor(width));
    const targetHeight = Math.max(1, Math.floor(height));
    if (
      this.accumulationTexture &&
      this.targetWidth === targetWidth &&
      this.targetHeight === targetHeight
    ) {
      return true;
    }
    return this.createAccumulationTarget(targetWidth, targetHeight);
  }

  private createAccumulationTarget(width: number, height: number): boolean {
    this.releaseAccumulationTarget();
    const gl = this.gl;
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!texture || !fbo) return false;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      width,
      height,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(texture);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return false;
    }
    this.accumulationTexture = texture;
    this.accumulationFbo = fbo;
    this.targetWidth = width;
    this.targetHeight = height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  private releaseAccumulationTarget(): void {
    if (this.accumulationTexture) this.gl.deleteTexture(this.accumulationTexture);
    if (this.accumulationFbo) this.gl.deleteFramebuffer(this.accumulationFbo);
    this.accumulationTexture = null;
    this.accumulationFbo = null;
    this.targetWidth = 0;
    this.targetHeight = 0;
  }

  private updateMarker(re: number, im: number): void {
    const samples = new Float32Array(DEFAULT_SAMPLE_COUNT);
    const detected = sampleAttractorCell(
      re,
      im,
      DEFAULT_WARMUP_ITERATIONS,
      DEFAULT_SAMPLE_COUNT,
      samples,
      0,
    );
    const period = detected === ESCAPED ? 0 : detected;
    const highlighted = Math.min(period, DEFAULT_SAMPLE_COUNT);
    const positions = new Float32Array((highlighted + 1) * 3);
    for (let index = 0; index < highlighted; index += 1) {
      const offset = index * 3;
      positions[offset] = re;
      positions[offset + 1] = im;
      positions[offset + 2] = samples[index];
    }
    const markerOffset = highlighted * 3;
    positions[markerOffset] = re;
    positions[markerOffset + 1] = im;
    positions[markerOffset + 2] = MARKER_PLANE_ORBIT_VALUE;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.markerBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.DYNAMIC_DRAW);
    this.markerOrbitPointCount = highlighted;
    this.marker = { re, im, period };
  }
}

function pointBudgetFor(cellCount: number): number {
  if (cellCount <= PERFORMANCE_CELL_CEILING) return POINT_BUDGETS.performance;
  if (cellCount <= BALANCED_CELL_CEILING) return POINT_BUDGETS.balanced;
  if (cellCount <= HIGH_CELL_CEILING) return POINT_BUDGETS.high;
  return POINT_BUDGETS.ultra;
}

function boundedInteger(
  value: number | boolean | string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

function defaultCameraState(): OrbitCameraState {
  const distance = Math.hypot(...DEFAULT_CAMERA_EYE);
  return {
    azimuth: Math.atan2(DEFAULT_CAMERA_EYE[0], DEFAULT_CAMERA_EYE[2]),
    elevation: Math.asin(DEFAULT_CAMERA_EYE[1] / distance),
    distance,
    target: [0, 0, 0],
  };
}

function cameraEye(camera: OrbitCameraState): [number, number, number] {
  const horizontal = Math.cos(camera.elevation) * camera.distance;
  return [
    camera.target[0] + Math.sin(camera.azimuth) * horizontal,
    camera.target[1] + Math.sin(camera.elevation) * camera.distance,
    camera.target[2] + Math.cos(camera.azimuth) * horizontal,
  ];
}

function cameraMatrix(aspect: number, camera: OrbitCameraState): Float32Array {
  const projection = perspectiveMatrix(
    CAMERA_FIELD_OF_VIEW,
    Math.max(0.25, aspect),
    0.1,
    20,
  );
  const view = lookAtMatrix(cameraEye(camera), camera.target, [0, 1, 0]);
  return multiplyMatrices(projection, view);
}

function markerWorldPosition(re: number, im: number): [number, number, number] {
  return [(re + 0.5) * 0.78, MARKER_PLANE_ORBIT_VALUE * 0.56, im * 0.85];
}

function transformPoint(
  matrix: Float32Array,
  point: readonly [number, number, number],
): [number, number, number, number] {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
  ];
}

function perspectiveMatrix(
  fieldOfView: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array {
  const f = 1 / Math.tan(fieldOfView / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, 2 * far * near * range, 0,
  ]);
}

function lookAtMatrix(
  eye: readonly [number, number, number],
  centre: readonly [number, number, number],
  up: readonly [number, number, number],
): Float32Array {
  const z = normalise3([
    eye[0] - centre[0],
    eye[1] - centre[1],
    eye[2] - centre[2],
  ]);
  const x = normalise3(cross3(up, z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1,
  ]);
}

function multiplyMatrices(left: Float32Array, right: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value += left[index * 4 + row] * right[column * 4 + index];
      }
      out[column * 4 + row] = value;
    }
  }
  return out;
}

function normalise3(value: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function cross3(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dot3(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = requireResource(gl.createProgram(), "orbit3d shader program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`Unable to link orbit3d shader program: ${info}`);
  }
  return program;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = requireResource(gl.createShader(type), "orbit3d shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "unknown compile error";
    gl.deleteShader(shader);
    throw new Error(`Unable to compile orbit3d shader: ${info}`);
  }
  return shader;
}

function requireResource<T>(resource: T | null, label: string): T {
  if (resource === null) throw new Error(`Unable to create ${label}.`);
  return resource;
}
