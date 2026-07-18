import {
  DEFAULT_SAMPLE_COUNT,
  DEFAULT_WARMUP_ITERATIONS,
  ESCAPED,
  IM_MAX,
  IM_MIN,
  RE_MAX,
  RE_MIN,
  SAMPLE_CLIP,
  cellCoordinate,
  sampleAttractorCell,
} from "../sims/logistic-mandelbrot/model.ts";

const POINT_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 a_position;
in float a_period;
in float a_interior;
uniform mat4 u_viewProjection;
uniform float u_pointSize;
uniform int u_colourMode;
uniform sampler2D u_palette;
uniform float u_phase;
uniform float u_markerRe;
uniform float u_fanActive;
out vec3 v_colour;
out float v_fanGlow;
out float v_sliceGlow;
out float v_markerGlow;

// Categorical hues for periods 1..7 drawn from the repo's ramp language
// (viridis teal/green, twilight blue/violet, plasma rose, amber, ice cyan);
// periods above seven reuse the wheel. Every hue is softened toward white in
// main() so additive stacking saturates gracefully instead of clipping.
vec3 periodHue(int p) {
  int index = (p - 1) % 7;
  if (index == 0) return vec3(0.129, 0.569, 0.549);
  if (index == 1) return vec3(0.255, 0.431, 0.686);
  if (index == 2) return vec3(0.800, 0.278, 0.471);
  if (index == 3) return vec3(0.933, 0.612, 0.094);
  if (index == 4) return vec3(0.165, 0.863, 0.863);
  if (index == 5) return vec3(0.369, 0.788, 0.384);
  return vec3(0.549, 0.314, 0.745);
}

// Ice-family ramp over normalised Re(z), lifted at the dark end so low sheets
// stay visible against the near-black background.
vec3 heightRamp(float t) {
  vec3 deep = vec3(0.06, 0.16, 0.40);
  vec3 mid = vec3(0.10, 0.45, 0.72);
  vec3 glow = vec3(0.35, 0.85, 0.86);
  vec3 pale = vec3(0.93, 0.98, 1.00);
  if (t < 0.4) return mix(deep, mid, t / 0.4);
  if (t < 0.75) return mix(mid, glow, (t - 0.4) / 0.35);
  return mix(glow, pale, (t - 0.75) / 0.25);
}

void main() {
  vec3 world = vec3(
    (a_position.x + 0.5) * 0.78,
    a_position.z * 0.56,
    a_position.y * 0.85
  );
  gl_Position = u_viewProjection * vec4(world, 1.0);

  float height = clamp((a_position.z + 2.0) * 0.25, 0.0, 1.0);
  if (u_colourMode == 0) {
    int p = int(a_period + 0.5);
    vec3 hue = p <= 0 ? vec3(0.44, 0.47, 0.53) : periodHue(p);
    v_colour = mix(hue, vec3(1.0), 0.2) * 1.1;
  } else if (u_colourMode == 1) {
    v_colour = mix(heightRamp(height), vec3(1.0), 0.12) * 1.1;
  } else if (u_colourMode == 3) {
    vec3 hue = texture(
      u_palette,
      vec2(fract(a_interior + u_phase), 0.5)
    ).rgb;
    v_colour = mix(hue, vec3(1.0), 0.16) * 1.1;
  } else {
    float offAxis = clamp(abs(a_position.y), 0.0, 1.0);
    vec3 low = vec3(0.08, 0.38, 0.92);
    vec3 high = vec3(1.0, 0.35, 0.12);
    v_colour = mix(low, high, height) * mix(1.35, 0.82, offAxis);
  }

  v_sliceGlow = 1.0 - smoothstep(0.0, 0.025, abs(a_position.y));

  // The real-axis tracer leaves a tapered wake through the complex c-plane.
  // Points farther behind the moving front spread farther from Im(c)=0,
  // revealing the off-axis continuation without generating new geometry.
  float age = a_position.x - u_markerRe;
  float behindFront = smoothstep(-0.02, 0.04, age);
  float wake = 1.0 - smoothstep(0.55, 1.8, age);
  float reach = min(1.48, 0.04 + max(age, 0.0) * 0.9);
  float lateral = 1.0 - smoothstep(max(0.0, reach - 0.16), reach, abs(a_position.y));
  float rim = 1.0 - smoothstep(0.035, 0.13, abs(abs(a_position.y) - reach));
  float front = (1.0 - smoothstep(0.015, 0.06, abs(age)))
    * (1.0 - smoothstep(0.03, 0.14, abs(a_position.y)));
  // Light every Im(c) depth at the active Re(c), forming a full orbit slice.
  v_markerGlow = u_fanActive
    * (1.0 - smoothstep(0.006, 0.025, abs(age)));
  gl_PointSize = u_pointSize * mix(1.0, 5.5, v_markerGlow);
  v_fanGlow = u_fanActive
    * max(front, behindFront * wake * max(lateral * 0.3, rim * 0.8));
}
`;

const POINT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 v_colour;
in float v_fanGlow;
in float v_sliceGlow;
in float v_markerGlow;
out vec4 outColor;

void main() {
  vec2 offset = gl_PointCoord - vec2(0.5);
  float radius = length(offset);
  float haze = 1.0 - smoothstep(0.08, 0.5, radius);
  float core = 1.0 - smoothstep(0.035, 0.25, radius);
  float sparkle = 1.0 - smoothstep(0.0, 0.09, radius);
  vec3 fanColour = mix(v_colour, vec3(0.45, 0.92, 1.0), 0.58);
  vec3 pointLight =
    v_colour * (haze * 0.026 + core * 0.046)
    + vec3(0.72, 0.9, 1.0) * haze * 0.008
    + vec3(1.0) * sparkle * 0.024;
  vec3 fanLight = fanColour * v_fanGlow * (haze * 0.055 + core * 0.052);
  vec3 sliceColour = mix(v_colour, vec3(0.78, 0.94, 1.0), 0.45);
  vec3 sliceLight = sliceColour * v_sliceGlow * (haze * 0.02 + core * 0.025);
  vec3 markerLight = v_markerGlow * (
    vec3(0.18, 0.82, 1.0) * haze * 0.7
    + vec3(0.72, 0.96, 1.0) * core * 0.85
    + vec3(1.0) * sparkle * 1.8
  );
  outColor = vec4(
    pointLight + fanLight + sliceLight + markerLight,
    max(core, haze * 0.62)
  );
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
  float radius = length(offset);
  float halo = 1.0 - smoothstep(0.22, 0.5, radius);
  float body = 1.0 - smoothstep(0.12, 0.31, radius);
  float core = 1.0 - smoothstep(0.0, 0.11, radius);
  vec3 colour =
    u_colour * (halo * 0.22 + body * 0.62) + vec3(1.0) * core * 1.35;
  outColor = vec4(colour, max(body, halo * 0.55));
}
`;

const GROUND_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
uniform mat4 u_viewProjection;
uniform vec2 u_planeCentre;
uniform vec2 u_planeHalfSpan;
uniform float u_planeHeight;
out vec2 v_complex;

void main() {
  vec2 c = u_planeCentre + a_position * u_planeHalfSpan;
  v_complex = c;
  vec3 world = vec3((c.x + 0.5) * 0.78, u_planeHeight, c.y * 0.85);
  gl_Position = u_viewProjection * vec4(world, 1.0);
}
`;

// The plane writes into the shared HDR accumulation target before the additive
// point passes, so its colours are scaled well below the cloud's saturation
// point to keep the sheets legible above it.
const GROUND_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texCentre;
uniform vec2 u_texSpan;
uniform float u_markerRe;
uniform float u_fanActive;
in vec2 v_complex;
out vec4 outColor;

void main() {
  vec2 uv = (v_complex - u_texCentre) / u_texSpan + 0.5;
  vec3 colour = texture(u_texture, uv).rgb;
  float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  vec3 planeInk = pow(
    clamp(mix(vec3(luma), colour, 0.45), vec3(0.0), vec3(1.0)),
    vec3(1.45)
  ) * 0.04;
  float axis = 1.0 - smoothstep(0.003, 0.014, abs(v_complex.y));
  float age = v_complex.x - u_markerRe;
  float behindFront = smoothstep(-0.025, 0.035, age);
  float reach = min(1.48, 0.04 + max(age, 0.0) * 0.9);
  float inside = 1.0 - smoothstep(max(0.0, reach - 0.1), reach, abs(v_complex.y));
  float rim = 1.0 - smoothstep(0.005, 0.022, abs(abs(v_complex.y) - reach));
  float wake = (1.0 - smoothstep(0.8, 2.1, age))
    * behindFront * max(inside * 0.025, rim * 0.5);
  float front = (1.0 - smoothstep(0.004, 0.018, abs(age)))
    * (1.0 - smoothstep(0.012, 0.045, abs(v_complex.y)));
  float fan = u_fanActive * max(front, wake);
  vec3 axisLine = vec3(0.01, 0.018, 0.03) * axis;
  vec3 fanLine = vec3(0.012, 0.052, 0.066) * fan;
  outColor = vec4(planeInk + axisLine + fanLine, 1.0);
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
const CAMERA_NEAR_PLANE = 0.1;
const CAMERA_FAR_PLANE = 20;
const CAMERA_MIN_DISTANCE = 2.1;
const CAMERA_MAX_DISTANCE = 12;
const MARKER_PLANE_ORBIT_VALUE = -2.08;
const DEFAULT_CAMERA_EYE = [2.9, 2.15, -3.6] as const;
const DEFAULT_MARKER_RE = -1;
const DEFAULT_MARKER_IM = 0;
const WORLD_RE_SCALE = 0.78;
const WORLD_ORBIT_SCALE = 0.56;
const WORLD_IM_SCALE = 0.85;

type OrbitParams = Record<string, number | boolean | string>;

/** The c-plane rectangle covered by the point cloud and the ground plane. */
export const GROUND_DOMAIN = {
  centre: [(RE_MIN + RE_MAX) / 2, (IM_MIN + IM_MAX) / 2] as const,
  span: [RE_MAX - RE_MIN, IM_MAX - IM_MIN] as const,
};

const ORBIT3D_BOUNDING_RADIUS = Math.hypot(
  Math.max(
    Math.abs((RE_MIN - GROUND_DOMAIN.centre[0]) * WORLD_RE_SCALE),
    Math.abs((RE_MAX - GROUND_DOMAIN.centre[0]) * WORLD_RE_SCALE),
  ),
  Math.max(SAMPLE_CLIP, Math.abs(MARKER_PLANE_ORBIT_VALUE)) * WORLD_ORBIT_SCALE,
  Math.max(Math.abs(IM_MIN), Math.abs(IM_MAX)) * WORLD_IM_SCALE,
);

/** Headless regression evidence for the orbit3d geometry and depth range. */
export const ORBIT3D_GEOMETRY_GUARD = {
  samplerDomain: [RE_MIN, RE_MAX, IM_MIN, IM_MAX] as const,
  planeDomain: [
    GROUND_DOMAIN.centre[0] - GROUND_DOMAIN.span[0] / 2,
    GROUND_DOMAIN.centre[0] + GROUND_DOMAIN.span[0] / 2,
    GROUND_DOMAIN.centre[1] - GROUND_DOMAIN.span[1] / 2,
    GROUND_DOMAIN.centre[1] + GROUND_DOMAIN.span[1] / 2,
  ] as const,
  boundingRadius: ORBIT3D_BOUNDING_RADIUS,
  cameraDistance: [CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE] as const,
  clipPlanes: [CAMERA_NEAR_PLANE, CAMERA_FAR_PLANE] as const,
};

assertOrbit3DGeometry();

export interface Orbit3DGroundPlane {
  texture: WebGLTexture;
  /** (re, im) at the texture's centre. */
  centre: readonly [number, number];
  /** (re, im) extent the texture covers edge to edge. */
  span: readonly [number, number];
}

export type Orbit3DCameraPose = "default" | "side";

export type Orbit3DColourMode = "period" | "height" | "mono" | "cycle";

const COLOUR_MODE_INDEX: Record<Orbit3DColourMode, number> = {
  period: 0,
  height: 1,
  mono: 2,
  cycle: 3,
};

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
  private readonly groundProgram: WebGLProgram;
  private readonly toneMapProgram: WebGLProgram;
  private readonly pointVao: WebGLVertexArrayObject;
  private readonly markerVao: WebGLVertexArrayObject;
  private readonly groundVao: WebGLVertexArrayObject;
  private readonly toneMapVao: WebGLVertexArrayObject;
  private readonly pointBuffer: WebGLBuffer;
  private readonly periodBuffer: WebGLBuffer;
  private readonly interiorBuffer: WebGLBuffer;
  private readonly markerBuffer: WebGLBuffer;
  private readonly quadBuffer: WebGLBuffer;
  private readonly viewProjectionUniform: WebGLUniformLocation;
  private readonly pointSizeUniform: WebGLUniformLocation;
  private readonly colourModeUniform: WebGLUniformLocation;
  private readonly paletteUniform: WebGLUniformLocation;
  private readonly phaseUniform: WebGLUniformLocation;
  private readonly markerReUniform: WebGLUniformLocation;
  private readonly fanActiveUniform: WebGLUniformLocation;
  private readonly markerViewProjectionUniform: WebGLUniformLocation;
  private readonly markerPointSizeUniform: WebGLUniformLocation;
  private readonly markerColourUniform: WebGLUniformLocation;
  private readonly groundViewProjectionUniform: WebGLUniformLocation;
  private readonly groundTexCentreUniform: WebGLUniformLocation;
  private readonly groundTexSpanUniform: WebGLUniformLocation;
  private readonly groundMarkerReUniform: WebGLUniformLocation;
  private readonly groundFanActiveUniform: WebGLUniformLocation;
  private readonly exposureUniform: WebGLUniformLocation;
  private accumulationTexture: WebGLTexture | null = null;
  private accumulationFbo: WebGLFramebuffer | null = null;
  private targetWidth = 0;
  private targetHeight = 0;
  private pointCount = 0;
  private fullPointCount = 0;
  private pointBudget = 0;
  private sampleCount = DEFAULT_SAMPLE_COUNT;
  private visibleIterations = DEFAULT_SAMPLE_COUNT;
  private buildGeneration = 0;
  private buildTimer: number | null = null;
  private building = false;
  private pendingSlice: ((budgetMs: number) => void) | null = null;
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
    this.groundProgram = createProgram(gl, GROUND_VERTEX_SHADER, GROUND_FRAGMENT_SHADER);
    this.toneMapProgram = createProgram(
      gl,
      TONEMAP_VERTEX_SHADER,
      TONEMAP_FRAGMENT_SHADER,
    );
    this.pointBuffer = requireResource(gl.createBuffer(), "orbit3d point buffer");
    this.periodBuffer = requireResource(gl.createBuffer(), "orbit3d period buffer");
    this.interiorBuffer = requireResource(gl.createBuffer(), "orbit3d interior buffer");
    this.markerBuffer = requireResource(gl.createBuffer(), "orbit3d marker buffer");
    this.quadBuffer = requireResource(gl.createBuffer(), "orbit3d quad buffer");
    this.pointVao = requireResource(gl.createVertexArray(), "orbit3d point VAO");
    this.markerVao = requireResource(gl.createVertexArray(), "orbit3d marker VAO");
    this.groundVao = requireResource(gl.createVertexArray(), "orbit3d ground VAO");
    this.toneMapVao = requireResource(gl.createVertexArray(), "orbit3d tone-map VAO");

    gl.bindVertexArray(this.pointVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
    const pointLocation = gl.getAttribLocation(this.pointProgram, "a_position");
    gl.enableVertexAttribArray(pointLocation);
    gl.vertexAttribPointer(pointLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.periodBuffer);
    const periodLocation = gl.getAttribLocation(this.pointProgram, "a_period");
    gl.enableVertexAttribArray(periodLocation);
    gl.vertexAttribPointer(periodLocation, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.interiorBuffer);
    const interiorLocation = gl.getAttribLocation(this.pointProgram, "a_interior");
    gl.enableVertexAttribArray(interiorLocation);
    gl.vertexAttribPointer(interiorLocation, 1, gl.FLOAT, false, 0, 0);

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

    gl.bindVertexArray(this.groundVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const groundLocation = gl.getAttribLocation(this.groundProgram, "a_position");
    gl.enableVertexAttribArray(groundLocation);
    gl.vertexAttribPointer(groundLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.viewProjectionUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_viewProjection"),
      "orbit3d view-projection uniform",
    );
    this.pointSizeUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_pointSize"),
      "orbit3d point-size uniform",
    );
    this.colourModeUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_colourMode"),
      "orbit3d colour-mode uniform",
    );
    this.paletteUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_palette"),
      "orbit3d palette uniform",
    );
    this.phaseUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_phase"),
      "orbit3d palette-phase uniform",
    );
    this.markerReUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_markerRe"),
      "orbit3d marker-re uniform",
    );
    this.fanActiveUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_fanActive"),
      "orbit3d fan-active uniform",
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
    this.groundViewProjectionUniform = requireResource(
      gl.getUniformLocation(this.groundProgram, "u_viewProjection"),
      "orbit3d ground view-projection uniform",
    );
    this.groundTexCentreUniform = requireResource(
      gl.getUniformLocation(this.groundProgram, "u_texCentre"),
      "orbit3d ground texture-centre uniform",
    );
    this.groundTexSpanUniform = requireResource(
      gl.getUniformLocation(this.groundProgram, "u_texSpan"),
      "orbit3d ground texture-span uniform",
    );
    this.groundMarkerReUniform = requireResource(
      gl.getUniformLocation(this.groundProgram, "u_markerRe"),
      "orbit3d ground marker-re uniform",
    );
    this.groundFanActiveUniform = requireResource(
      gl.getUniformLocation(this.groundProgram, "u_fanActive"),
      "orbit3d ground fan-active uniform",
    );
    this.exposureUniform = requireResource(
      gl.getUniformLocation(this.toneMapProgram, "u_exposure"),
      "orbit3d exposure uniform",
    );
    gl.useProgram(this.groundProgram);
    gl.uniform1i(gl.getUniformLocation(this.groundProgram, "u_texture"), 0);
    gl.uniform2f(
      gl.getUniformLocation(this.groundProgram, "u_planeCentre"),
      GROUND_DOMAIN.centre[0],
      GROUND_DOMAIN.centre[1],
    );
    gl.uniform2f(
      gl.getUniformLocation(this.groundProgram, "u_planeHalfSpan"),
      GROUND_DOMAIN.span[0] / 2,
      GROUND_DOMAIN.span[1] / 2,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.groundProgram, "u_planeHeight"),
      MARKER_PLANE_ORBIT_VALUE * 0.56,
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

  get ready(): boolean {
    return !this.building && this.fullPointCount > 0;
  }

  orbit(deltaAzimuth: number, deltaElevation: number): void {
    this.camera.azimuth += deltaAzimuth;
    this.camera.elevation = Math.min(
      Math.PI / 2 - 0.08,
      Math.max(0.08, this.camera.elevation + deltaElevation),
    );
  }

  syncCameraToSweep(progress: number, maxDelta: number): void {
    const start = defaultCameraState();
    const squareOn = sideCameraState();
    const phase = Math.min(1, Math.max(0, progress));
    const targetAzimuth = start.azimuth + (squareOn.azimuth - start.azimuth) * phase;
    const azimuthDelta = Math.atan2(
      Math.sin(targetAzimuth - this.camera.azimuth),
      Math.cos(targetAzimuth - this.camera.azimuth),
    );
    const targetElevation =
      start.elevation + (squareOn.elevation - start.elevation) * phase;
    const targetDistance =
      start.distance + (squareOn.distance - start.distance) * phase;
    this.camera.azimuth += Math.min(
      maxDelta,
      Math.max(-maxDelta, azimuthDelta),
    );
    this.camera.elevation += Math.min(
      maxDelta,
      Math.max(-maxDelta, targetElevation - this.camera.elevation),
    );
    this.camera.distance += Math.min(
      maxDelta * 2,
      Math.max(-maxDelta * 2, targetDistance - this.camera.distance),
    );
  }

  dolly(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.camera.distance = Math.min(
      CAMERA_MAX_DISTANCE,
      Math.max(CAMERA_MIN_DISTANCE, this.camera.distance * factor),
    );
  }

  resetCamera(): void {
    this.camera = defaultCameraState();
  }

  setCameraPose(pose: Orbit3DCameraPose): void {
    this.camera = pose === "side" ? sideCameraState() : defaultCameraState();
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

  setMarker(re: number, im: number): Orbit3DMarkerReadout {
    this.updateMarker(
      Math.min(RE_MAX, Math.max(RE_MIN, re)),
      Math.min(IM_MAX, Math.max(IM_MIN, im)),
    );
    return this.markerReadout;
  }

  setPlottedIterations(value: number): void {
    this.visibleIterations = boundedInteger(value, 1, this.sampleCount, 1);
    this.refreshPointCount();
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
    const density = boundedNumber(params.pointDensity, 0.25, 1, 1);
    const pointBudget = Math.max(
      sampleCount,
      Math.floor(pointBudgetFor(inputWidth * inputHeight) * density),
    );
    const maxSurvivingCells = Math.max(1, Math.floor(pointBudget / sampleCount));
    const desiredCells = Math.ceil(
      pointBudget / (sampleCount * SURVIVING_CELL_ESTIMATE),
    );
    const candidateCells = Math.min(inputWidth * inputHeight, desiredCells);
    const aspect = inputWidth / inputHeight;
    const sampleWidth = realSliceOnly
      ? maxSurvivingCells
      : Math.max(1, Math.min(inputWidth, Math.round(Math.sqrt(candidateCells * aspect))));
    const sampleHeight = realSliceOnly
      ? 1
      : Math.max(1, Math.min(inputHeight, Math.ceil(candidateCells / sampleWidth)));
    const positions = new Float32Array(pointBudget * 3);
    const periods = new Float32Array(pointBudget);
    const interiors = new Float32Array(pointBudget);
    const orbitSamples = new Float32Array(sampleCount);
    const measure = { interior: 1 };
    let cell = 0;
    let survivorsSeen = 0;

    this.pointCount = 0;
    this.fullPointCount = 0;
    this.pointBudget = pointBudget;
    this.sampleCount = sampleCount;
    this.visibleIterations = plottedIterations;
    this.building = true;
    const gl = this.gl;

    const buildSlice = (budgetMs: number): void => {
      if (generation !== this.buildGeneration) return;
      const stopAt = performance.now() + budgetMs;
      while (
        cell < sampleWidth * sampleHeight &&
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
          measure,
        );
        if (result !== ESCAPED) {
          const slot = reservoirSlot(survivorsSeen, maxSurvivingCells);
          survivorsSeen += 1;
          if (slot >= 0) {
            for (let sample = 0; sample < sampleCount; sample += 1) {
              const offset = (sample * maxSurvivingCells + slot) * 3;
              positions[offset] = cRe;
              positions[offset + 1] = cIm;
              positions[offset + 2] = orbitSamples[sample];
              periods[sample * maxSurvivingCells + slot] = result;
              interiors[sample * maxSurvivingCells + slot] = measure.interior;
            }
          }
        }
        cell += 1;
      }

      if (cell < sampleWidth * sampleHeight) {
        this.buildTimer = window.setTimeout(() => buildSlice(BUILD_SLICE_MS), 0);
        return;
      }
      const survivingCells = Math.min(survivorsSeen, maxSurvivingCells);
      for (let sample = 1; sample < sampleCount; sample += 1) {
        const source = sample * maxSurvivingCells * 3;
        const target = sample * survivingCells * 3;
        positions.copyWithin(target, source, source + survivingCells * 3);
        periods.copyWithin(
          sample * survivingCells,
          sample * maxSurvivingCells,
          sample * maxSurvivingCells + survivingCells,
        );
        interiors.copyWithin(
          sample * survivingCells,
          sample * maxSurvivingCells,
          sample * maxSurvivingCells + survivingCells,
        );
      }
      this.fullPointCount = survivingCells * sampleCount;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        positions.subarray(0, this.fullPointCount * 3),
        gl.STATIC_DRAW,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, this.periodBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        periods.subarray(0, this.fullPointCount),
        gl.STATIC_DRAW,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, this.interiorBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        interiors.subarray(0, this.fullPointCount),
        gl.STATIC_DRAW,
      );
      this.refreshPointCount();
      this.buildTimer = null;
      this.building = false;
      this.pendingSlice = null;
    };

    this.pendingSlice = buildSlice;
    buildSlice(BUILD_SLICE_MS);
  }

  /**
   * Run the remaining build slices to completion on the calling thread. Used
   * by one-shot render paths (thumbnails) that cannot wait for timer slices.
   */
  finishBuild(): void {
    while (this.building && this.pendingSlice) {
      if (this.buildTimer !== null) {
        window.clearTimeout(this.buildTimer);
        this.buildTimer = null;
      }
      this.pendingSlice(Number.POSITIVE_INFINITY);
    }
  }

  cancelBuild(): void {
    this.buildGeneration += 1;
    if (this.buildTimer !== null) {
      window.clearTimeout(this.buildTimer);
      this.buildTimer = null;
    }
    this.building = false;
    this.pendingSlice = null;
  }

  private refreshPointCount(): void {
    if (this.fullPointCount === 0 || this.sampleCount <= 0) {
      this.pointCount = 0;
      return;
    }
    const cells = Math.floor(this.fullPointCount / this.sampleCount);
    this.pointCount = cells * this.visibleIterations;
  }

  draw(
    width: number,
    height: number,
    exposure = 1.35,
    ground: Orbit3DGroundPlane | null = null,
    colourMode: Orbit3DColourMode = "period",
    fanActive = false,
    palette: WebGLTexture | null = null,
    phase = 0,
  ): boolean {
    if (!this.available || !this.ensureAccumulationTarget(width, height)) return false;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumulationFbo);
    gl.viewport(0, 0, this.targetWidth, this.targetHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const viewProjection = cameraMatrix(this.targetWidth / this.targetHeight, this.camera);

    if (ground) {
      gl.useProgram(this.groundProgram);
      gl.uniformMatrix4fv(this.groundViewProjectionUniform, false, viewProjection);
      gl.uniform2f(this.groundTexCentreUniform, ground.centre[0], ground.centre[1]);
      gl.uniform2f(this.groundTexSpanUniform, ground.span[0], ground.span[1]);
      gl.uniform1f(this.groundMarkerReUniform, this.marker.re);
      gl.uniform1f(this.groundFanActiveUniform, fanActive ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ground.texture);
      gl.bindVertexArray(this.groundVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.pointProgram);
    gl.uniformMatrix4fv(
      this.viewProjectionUniform,
      false,
      viewProjection,
    );
    gl.uniform1f(
      this.pointSizeUniform,
      Math.min(3, Math.max(1.8, width / 650)),
    );
    gl.uniform1i(this.colourModeUniform, COLOUR_MODE_INDEX[colourMode] ?? 0);
    gl.uniform1i(this.paletteUniform, 3);
    gl.uniform1f(this.phaseUniform, phase);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, palette);
    gl.uniform1f(this.markerReUniform, this.marker.re);
    gl.uniform1f(this.fanActiveUniform, fanActive ? 1 : 0);
    gl.bindVertexArray(this.pointVao);
    gl.drawArrays(gl.POINTS, 0, this.pointCount);

    gl.useProgram(this.markerProgram);
    gl.uniformMatrix4fv(this.markerViewProjectionUniform, false, viewProjection);
    gl.bindVertexArray(this.markerVao);
    gl.uniform1f(
      this.markerPointSizeUniform,
      Math.min(30, Math.max(20, width / 62)),
    );
    gl.uniform3f(this.markerColourUniform, 0.3, 0.12, 0.015);
    gl.drawArrays(gl.POINTS, this.markerOrbitPointCount, 1);
    gl.uniform1f(
      this.markerPointSizeUniform,
      Math.min(20, Math.max(13, width / 82)),
    );
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
    gl.deleteVertexArray(this.groundVao);
    gl.deleteVertexArray(this.toneMapVao);
    gl.deleteBuffer(this.pointBuffer);
    gl.deleteBuffer(this.periodBuffer);
    gl.deleteBuffer(this.interiorBuffer);
    gl.deleteBuffer(this.markerBuffer);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteProgram(this.pointProgram);
    gl.deleteProgram(this.markerProgram);
    gl.deleteProgram(this.groundProgram);
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

function boundedNumber(
  value: number | boolean | string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

/** Deterministic reservoir sampling keeps a full-domain point budget. */
function reservoirSlot(itemIndex: number, capacity: number): number {
  if (itemIndex < capacity) return itemIndex;
  let hash = (itemIndex + 0x9e3779b9) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
  hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
  hash = (hash ^ (hash >>> 15)) >>> 0;
  const candidate = Math.floor(hash / 0x1_0000_0000 * (itemIndex + 1));
  return candidate < capacity ? candidate : -1;
}

function assertOrbit3DGeometry(): void {
  const guard = ORBIT3D_GEOMETRY_GUARD;
  if (guard.planeDomain.some((value, index) => value !== guard.samplerDomain[index])) {
    throw new Error("orbit3d ground plane must match the sampler c-domain");
  }
  if (
    CAMERA_MIN_DISTANCE - guard.boundingRadius <= CAMERA_NEAR_PLANE ||
    CAMERA_MAX_DISTANCE + guard.boundingRadius >= CAMERA_FAR_PLANE
  ) {
    throw new Error("orbit3d camera limits must fit inside the depth clip planes");
  }
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

/** Looking along -z at the re/orbit plane, with the large bifurcation on the right. */
function sideCameraState(): OrbitCameraState {
  return {
    azimuth: Math.PI,
    elevation: 0.14,
    distance: 3.7,
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
    CAMERA_NEAR_PLANE,
    CAMERA_FAR_PLANE,
  );
  const view = lookAtMatrix(cameraEye(camera), camera.target, [0, 1, 0]);
  return multiplyMatrices(projection, view);
}

function markerWorldPosition(re: number, im: number): [number, number, number] {
  return [
    (re - GROUND_DOMAIN.centre[0]) * WORLD_RE_SCALE,
    MARKER_PLANE_ORBIT_VALUE * WORLD_ORBIT_SCALE,
    im * WORLD_IM_SCALE,
  ];
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
