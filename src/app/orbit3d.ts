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
import { bakedFileFor } from "./bakedManifest.ts";
import {
  OrbitSampler,
  boundaryDistanceField,
  buildGpuOrbitCloud,
  reservoirSlot,
  type OrbitCloudBuffers,
} from "./orbitSampler.ts";

const POINT_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 a_position;
in float a_period;
in float a_interior;
in float a_boundary;
in float a_weight;
uniform mat4 u_viewProjection;
uniform float u_pointSize;
uniform int u_colourMode;
uniform sampler2D u_palette;
uniform float u_phase;
uniform float u_paletteReverse;
uniform float u_sampleCount;
uniform float u_markerRe;
uniform float u_fanActive;
uniform float u_drawDensity;
uniform float u_cellCount;
uniform float u_edgeGlow;
// Prebaked clouds upload quantized attributes (u16 positions over the
// sampler domain, u8 periods) as normalized ints; these remap them back.
// Live builds upload raw floats and set offset 0 / scale 1.
uniform vec3 u_posOffset;
uniform vec3 u_posScale;
uniform float u_periodScale;
out vec3 v_colour;
out vec3 v_cycleHue;
out float v_fanGlow;
out float v_sliceGlow;
out float v_markerGlow;
out float v_selfGlow;
out float v_energy;

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

void main() {
  vec3 position = u_posOffset + a_position * u_posScale;
  float period = a_period * u_periodScale;
  vec3 world = vec3(
    (position.x + 0.5) * 0.78,
    position.z * 0.56,
    position.y * 0.85
  );
  // Density culls whole cells (every sample of a c-value together), matching
  // the old build-time semantics — fewer c-plane sites, full orbit columns —
  // but resolved here per frame so the slider needs no rebuild. The layout is
  // sample-major, so the cell index is the vertex id modulo the cell count;
  // hashing it gives a spatially fair, frame-stable keep set.
  float cellId = mod(float(gl_VertexID), max(u_cellCount, 1.0));
  if (fract(sin(cellId * 12.9898) * 43758.5453) > u_drawDensity) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  gl_Position = u_viewProjection * vec4(world, 1.0);

  float height = clamp((position.z + 2.0) * 0.25, 0.0, 1.0);
  v_selfGlow = 0.0;
  v_cycleHue = vec3(0.0);
  // A period-q cell lands sampleCount/q coincident samples on each sheet
  // dot, so additive stacking would brighten with the sample-count setting.
  // Scaling per-point energy by q/sampleCount keeps each distinct sheet
  // location at baseline brightness in every colour mode; chaotic cells
  // (no period) have distinct samples and keep full energy.
  v_energy = period > 0.5
    ? clamp(period / max(u_sampleCount, 1.0), 0.02, 1.0)
    : 1.0;
  // Refined sub-cell points carry a fractional weight so the refinement pass
  // raises local resolution without raising local brightness.
  v_energy *= a_weight;
  if (u_colourMode == 0) {
    int p = int(period + 0.5);
    vec3 hue = p <= 0 ? vec3(0.44, 0.47, 0.53) : periodHue(p);
    v_colour = mix(hue, vec3(1.0), 0.2) * 1.1;
  } else if (u_colourMode == 1) {
    // Inside-out fill: the attracting-cycle multiplier runs from 0 at each
    // bulb's superattracting centre to 1 at its boundary, so sampling the
    // shared fractal palette with it continues the 2D escape-time bands
    // inward from the set's edge instead of ramping on sheet height.
    float t = clamp(a_interior, 0.0, 1.0);
    if (u_paletteReverse > 0.5) t = 1.0 - t;
    vec3 hue = texture(u_palette, vec2(t, 0.5)).rgb;
    v_colour = mix(hue, vec3(1.0), 0.12) * 1.1;
  } else if (u_colourMode == 3) {
    // Cells with a detected period sit inside a black bulb of the 2D view:
    // steady grey, no cycling, no glow. Only the complexity cells (chaotic
    // band and the unresolved fringe at bulb boundaries) take the cycling
    // palette and the self-glow.
    float complexity = period > 0.5 ? 0.0 : 1.0;
    // Faithful to the picker palette: the dots march through the same ramp
    // the plane's bands do, including its dark end, so they wink out and
    // return as the dark band passes. Keyed on c-plane distance inside the
    // escape boundary, a dot at the seam sits at fract(u_phase) — the same
    // coordinate the plane's bands reach at the set's edge — so each colour
    // locus rises from deep in the set, crosses the boundary, and flows on
    // outward across the plane (inward when the palette cycle is reversed).
    float band = a_boundary * 3.0;
    if (u_paletteReverse > 0.5) band = -band;
    vec3 hue = texture(u_palette, vec2(fract(band + u_phase), 0.5)).rgb;
    vec3 steady = vec3(0.44, 0.47, 0.53);
    v_colour = mix(steady, mix(hue, vec3(1.0), 0.06) * 1.1, complexity);
    // The beam borrows the cycling palette colour even over the steady bulb
    // cells, so a sweep through cycle mode lights everything in cycle colours.
    v_cycleHue = hue;
    v_selfGlow = complexity * 1.25;
  } else {
    float offAxis = clamp(abs(position.y), 0.0, 1.0);
    vec3 low = vec3(0.08, 0.38, 0.92);
    vec3 high = vec3(1.0, 0.35, 0.12);
    v_colour = mix(low, high, height) * mix(1.35, 0.82, offAxis);
  }

  // Nascent glow for the outermost structure: a_boundary runs 0 at the
  // escape boundary to 1 deep inside the set, so the cube pulls the halo in
  // tight around the filaments and cascade tails while interior sheets stay
  // matte. Scaled by the user's edge-glow setting, resolved per frame.
  float edge = 1.0 - clamp(a_boundary, 0.0, 1.0);
  v_selfGlow += u_edgeGlow * edge * edge * edge;

  v_sliceGlow = 1.0 - smoothstep(0.0, 0.025, abs(position.y));

  // The real-axis tracer leaves a tapered wake through the complex c-plane.
  // Points farther behind the moving front spread farther from Im(c)=0,
  // revealing the off-axis continuation without generating new geometry.
  float age = position.x - u_markerRe;
  float behindFront = smoothstep(-0.02, 0.04, age);
  float wake = 1.0 - smoothstep(0.55, 1.8, age);
  float reach = min(1.48, 0.04 + max(age, 0.0) * 0.9);
  float lateral = 1.0 - smoothstep(max(0.0, reach - 0.16), reach, abs(position.y));
  float rim = 1.0 - smoothstep(0.035, 0.13, abs(abs(position.y) - reach));
  float front = (1.0 - smoothstep(0.015, 0.06, abs(age)))
    * (1.0 - smoothstep(0.03, 0.14, abs(position.y)));
  // Light every Im(c) depth at the active Re(c), forming a full orbit slice.
  v_markerGlow = u_fanActive
    * (1.0 - smoothstep(0.006, 0.025, abs(age)));
  gl_PointSize = u_pointSize
    * mix(1.0, 5.5, v_markerGlow)
    * mix(1.0, 1.25, min(v_selfGlow, 1.0));
  v_fanGlow = u_fanActive
    * max(front, behindFront * wake * max(lateral * 0.3, rim * 0.8));
}
`;

const POINT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 v_colour;
in vec3 v_cycleHue;
in float v_fanGlow;
in float v_sliceGlow;
in float v_markerGlow;
in float v_selfGlow;
in float v_energy;
// 1.0 in cycle colour mode: the beam trades its fixed cyan for the cycling
// palette hue carried per point in v_cycleHue.
uniform float u_cycleBeam;
out vec4 outColor;

void main() {
  vec2 offset = gl_PointCoord - vec2(0.5);
  float radius = length(offset);
  float haze = 1.0 - smoothstep(0.08, 0.5, radius);
  float core = 1.0 - smoothstep(0.035, 0.25, radius);
  float sparkle = 1.0 - smoothstep(0.0, 0.09, radius);
  vec3 fanColour = mix(
    mix(v_colour, vec3(0.45, 0.92, 1.0), 0.58),
    v_cycleHue,
    u_cycleBeam
  );
  vec3 pointLight =
    v_colour * (haze * 0.026 + core * 0.046)
    + vec3(0.72, 0.9, 1.0) * haze * 0.008
    + vec3(1.0) * sparkle * 0.024;
  vec3 fanLight = fanColour * v_fanGlow * (haze * 0.055 + core * 0.052);
  // Self-glow keeps the tint of the point's own palette colour so the cycling
  // bands stay legible; weights sit well below the marker light to avoid
  // blowing out the dense central mass under additive accumulation.
  vec3 selfLight = v_selfGlow * v_colour
    * (haze * 0.09 + core * 0.13 + sparkle * 0.09);
  vec3 sliceColour = mix(v_colour, vec3(0.78, 0.94, 1.0), 0.45);
  vec3 sliceLight = sliceColour * v_sliceGlow * (haze * 0.02 + core * 0.025);
  vec3 markerLight = v_markerGlow * (
    mix(vec3(0.18, 0.82, 1.0), v_cycleHue, u_cycleBeam) * haze * 0.7
    + mix(vec3(0.72, 0.96, 1.0), mix(v_cycleHue, vec3(1.0), 0.3), u_cycleBeam)
      * core * 0.85
    + vec3(1.0) * sparkle * 1.8
  );
  outColor = vec4(
    (pointLight + fanLight + sliceLight + markerLight + selfLight) * v_energy,
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
uniform float u_cycleBeam;
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
  float age = v_complex.x - u_markerRe;
  // The beam through the cloud lights every Im(c) at the active Re(c); its
  // footprint here is just the matching full-width line, no trailing wake.
  float front = 1.0 - smoothstep(0.004, 0.018, abs(age));
  float fan = u_fanActive * front;
  // In cycle mode the plane texture already carries the cycling palette, so
  // brightening the plane's own colour keeps the footprint in cycle colours.
  vec3 beamTint = mix(
    vec3(0.012, 0.052, 0.066),
    colour * 0.055 + vec3(0.004, 0.005, 0.007),
    u_cycleBeam
  );
  vec3 fanLine = beamTint * fan;
  outColor = vec4(planeInk + fanLine, 1.0);
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
const ULTRA_CELL_CEILING = Math.ceil(1280 * 1280 * 1.01);
const POINT_BUDGETS = {
  performance: 1_000_000,
  balanced: 2_400_000,
  high: 3_400_000,
  ultra: 4_800_000,
  extreme: 9_600_000,
} as const;

const SURVIVING_CELL_ESTIMATE = 0.22;

// Every bulb's period-doubling cascade continues without bound toward its
// accumulation point, so the tails carry real structure at every scale that a
// uniform c-grid starves of samples. A slice of the point budget is therefore
// reserved for a refinement pass: cells whose sample window shows a deep
// period (or none at all — chaotic within the window) are re-sampled on a
// finer sub-grid with a longer warmup, since convergence near the
// accumulation points is critically slow and under-warmed orbits smear
// between the true cascade branches.
const REFINE_BUDGET_FRACTION = 0.3;
const REFINE_PERIOD_THRESHOLD = 8;
const REFINE_SUBDIVISION = 3;
const REFINE_WARMUP_MULTIPLIER = 4;
// Slightly above 1/subdivision² energy parity so the resolved tails read a
// touch brighter than the fuzz they replace without blowing out under
// additive accumulation.
const REFINE_POINT_WEIGHT = 0.15;
const MAX_WARMUP = 2000;

const BUILD_SLICE_MS = 8;
const CAMERA_FIELD_OF_VIEW = Math.PI / 4.8;
const CAMERA_NEAR_PLANE = 0.05;
const CAMERA_FAR_PLANE = 20;
const CAMERA_MIN_DISTANCE = 0.35;
const CAMERA_PAN_LIMIT = 1.6;
const CAMERA_MAX_DISTANCE = 12;
const MARKER_PLANE_ORBIT_VALUE = -2.08;
const DEFAULT_CAMERA_EYE = [2.9, 2.15, -3.6] as const;
const DEFAULT_MARKER_RE = -1;
const DEFAULT_MARKER_IM = 0;
const WORLD_RE_SCALE = 0.78;
const WORLD_ORBIT_SCALE = 0.56;
const WORLD_IM_SCALE = 0.85;

type OrbitParams = Record<string, number | boolean | string>;

/**
 * Prebaked point cloud (ELPC v1) written by scripts/bake-orbit3d.mjs.
 * Sample-major like the live build; positions quantized to u16 over the
 * sampler domain, scalar attributes to u8.
 */
interface PrebakedCloud {
  cellCount: number;
  sampleCount: number;
  /** Quantized u16 over the sampler domain; uploaded as normalized ints. */
  positions: Uint16Array;
  periods: Uint8Array;
  interiors: Uint8Array;
  boundaries: Uint8Array;
  weights: Uint8Array;
}

function parsePrebaked(buffer: ArrayBuffer): PrebakedCloud | null {
  if (buffer.byteLength < 16) return null;
  const view = new DataView(buffer);
  if (
    view.getUint8(0) !== 0x45 ||
    view.getUint8(1) !== 0x4c ||
    view.getUint8(2) !== 0x50 ||
    view.getUint8(3) !== 0x43 ||
    view.getUint32(4, true) !== 1
  ) {
    return null;
  }
  const cellCount = view.getUint32(8, true);
  const sampleCount = view.getUint32(12, true);
  const count = cellCount * sampleCount;
  if (count === 0 || buffer.byteLength !== 16 + count * 10) return null;

  // Views into the fetched buffer, uploaded as-is: the shader dequantizes
  // via u_posOffset/u_posScale/u_periodScale, so a 32M-point cloud costs
  // ~10 bytes per point on the GPU instead of ~28.
  return {
    cellCount,
    sampleCount,
    positions: new Uint16Array(buffer, 16, count * 3),
    periods: new Uint8Array(buffer, 16 + count * 6, count),
    interiors: new Uint8Array(buffer, 16 + count * 7, count),
    boundaries: new Uint8Array(buffer, 16 + count * 8, count),
    weights: new Uint8Array(buffer, 16 + count * 9, count),
  };
}

const prebakedPromises = new Map<string, Promise<PrebakedCloud | null>>();

/**
 * Resolve one baked cloud, once per session per file, so switching back to a
 * bake already loaded this session costs nothing. Null when the file is
 * missing (a stale manifest entry) or malformed.
 */
function fetchPrebaked(file: string): Promise<PrebakedCloud | null> {
  let pending = prebakedPromises.get(file);
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}baked/${file}`)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .then((buffer) => (buffer ? parsePrebaked(buffer) : null))
      .catch(() => null);
    prebakedPromises.set(file, pending);
  }
  return pending;
}

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

export type Orbit3DColourMode = "period" | "inside-out" | "mono" | "cycle";

const COLOUR_MODE_INDEX: Record<Orbit3DColourMode, number> = {
  period: 0,
  "inside-out": 1,
  mono: 2,
  cycle: 3,
};

export interface Orbit3DStats {
  pointCount: number;
  pointBudget: number;
  building: boolean;
  samplingPath: "gpu-sampled" | "cpu-sampled" | "cpu-sampled-gpu-failed" | "prebaked";
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
  private readonly orbitSampler: OrbitSampler | null;
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
  private readonly boundaryBuffer: WebGLBuffer;
  private readonly weightBuffer: WebGLBuffer;
  private readonly markerBuffer: WebGLBuffer;
  private readonly quadBuffer: WebGLBuffer;
  private readonly viewProjectionUniform: WebGLUniformLocation;
  private readonly pointSizeUniform: WebGLUniformLocation;
  private readonly colourModeUniform: WebGLUniformLocation;
  // Nullable: the point shader's dedicated cycle wheel means the palette
  // sampler may be optimised out as inactive; a null location is silently
  // ignored by uniform1i, which is exactly the behaviour wanted here.
  private readonly paletteUniform: WebGLUniformLocation | null;
  private readonly phaseUniform: WebGLUniformLocation;
  private readonly paletteReverseUniform: WebGLUniformLocation;
  private readonly sampleCountUniform: WebGLUniformLocation;
  private readonly drawDensityUniform: WebGLUniformLocation;
  private readonly edgeGlowUniform: WebGLUniformLocation;
  private readonly posOffsetUniform: WebGLUniformLocation;
  private readonly posScaleUniform: WebGLUniformLocation;
  private readonly periodScaleUniform: WebGLUniformLocation;
  private readonly cellCountUniform: WebGLUniformLocation;
  private readonly markerReUniform: WebGLUniformLocation;
  private readonly fanActiveUniform: WebGLUniformLocation;
  private readonly cycleBeamUniform: WebGLUniformLocation;
  private readonly markerViewProjectionUniform: WebGLUniformLocation;
  private readonly markerPointSizeUniform: WebGLUniformLocation;
  private readonly markerColourUniform: WebGLUniformLocation;
  private readonly groundViewProjectionUniform: WebGLUniformLocation;
  private readonly groundTexCentreUniform: WebGLUniformLocation;
  private readonly groundTexSpanUniform: WebGLUniformLocation;
  private readonly groundMarkerReUniform: WebGLUniformLocation;
  private readonly groundFanActiveUniform: WebGLUniformLocation;
  private readonly groundCycleBeamUniform: WebGLUniformLocation;
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
  // A prebaked cloud may carry a different orbit window than the live params,
  // so plotted-iteration requests (and the cascade reveal driving them) are
  // rescaled onto the baked window.
  private plottedScale = 1;
  private lastPlottedRequest = DEFAULT_SAMPLE_COUNT;
  private quantizedAttributes = false;
  private buildGeneration = 0;
  private buildTimer: number | null = null;
  private building = false;
  private buildFailed = false;
  private pendingSlice: ((budgetMs: number) => void) | null = null;
  private samplingPath: Orbit3DStats["samplingPath"] = "cpu-sampled";
  private camera = defaultCameraState();
  private marker: Orbit3DMarkerReadout = {
    re: DEFAULT_MARKER_RE,
    im: DEFAULT_MARKER_IM,
    period: 0,
  };
  private markerOrbitPointCount = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.orbitSampler = OrbitSampler.create(gl);
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
    this.boundaryBuffer = requireResource(gl.createBuffer(), "orbit3d boundary buffer");
    this.weightBuffer = requireResource(gl.createBuffer(), "orbit3d weight buffer");
    this.markerBuffer = requireResource(gl.createBuffer(), "orbit3d marker buffer");
    this.quadBuffer = requireResource(gl.createBuffer(), "orbit3d quad buffer");
    this.pointVao = requireResource(gl.createVertexArray(), "orbit3d point VAO");
    this.markerVao = requireResource(gl.createVertexArray(), "orbit3d marker VAO");
    this.groundVao = requireResource(gl.createVertexArray(), "orbit3d ground VAO");
    this.toneMapVao = requireResource(gl.createVertexArray(), "orbit3d tone-map VAO");

    this.configurePointAttributes(false);

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
    this.paletteUniform = gl.getUniformLocation(this.pointProgram, "u_palette");
    this.phaseUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_phase"),
      "orbit3d palette-phase uniform",
    );
    this.paletteReverseUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_paletteReverse"),
      "orbit3d palette-reverse uniform",
    );
    this.sampleCountUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_sampleCount"),
      "orbit3d sample-count uniform",
    );
    this.drawDensityUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_drawDensity"),
      "orbit3d draw-density uniform",
    );
    this.cellCountUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_cellCount"),
      "orbit3d cell-count uniform",
    );
    this.edgeGlowUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_edgeGlow"),
      "orbit3d edge-glow uniform",
    );
    this.posOffsetUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_posOffset"),
      "orbit3d position-offset uniform",
    );
    this.posScaleUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_posScale"),
      "orbit3d position-scale uniform",
    );
    this.periodScaleUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_periodScale"),
      "orbit3d period-scale uniform",
    );
    this.markerReUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_markerRe"),
      "orbit3d marker-re uniform",
    );
    this.fanActiveUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_fanActive"),
      "orbit3d fan-active uniform",
    );
    this.cycleBeamUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_cycleBeam"),
      "orbit3d cycle-beam uniform",
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
    this.groundCycleBeamUniform = requireResource(
      gl.getUniformLocation(this.groundProgram, "u_cycleBeam"),
      "orbit3d ground cycle-beam uniform",
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
      samplingPath: this.samplingPath,
    };
  }

  get markerReadout(): Orbit3DMarkerReadout {
    return { ...this.marker };
  }

  get ready(): boolean {
    return !this.building && this.fullPointCount > 0;
  }

  get failed(): boolean {
    return this.buildFailed;
  }

  orbit(deltaAzimuth: number, deltaElevation: number): void {
    this.camera.azimuth += deltaAzimuth;
    this.camera.elevation = Math.min(
      Math.PI / 2 - 0.08,
      Math.max(-(Math.PI / 2 - 0.08), this.camera.elevation + deltaElevation),
    );
  }

  /**
   * Slide the orbit target across the camera plane. Deltas are fractions of
   * the viewport height, so a full-height drag moves the target by one view
   * height regardless of zoom level.
   */
  pan(deltaRight: number, deltaUp: number): void {
    if (!Number.isFinite(deltaRight) || !Number.isFinite(deltaUp)) return;
    const eye = cameraEye(this.camera);
    const forward = normalise3([
      this.camera.target[0] - eye[0],
      this.camera.target[1] - eye[1],
      this.camera.target[2] - eye[2],
    ]);
    const right = normalise3(cross3(forward, [0, 1, 0]));
    const up = normalise3(cross3(right, forward));
    const viewHeight =
      2 * this.camera.distance * Math.tan(CAMERA_FIELD_OF_VIEW / 2);
    const dx = -deltaRight * viewHeight;
    const dy = deltaUp * viewHeight;
    for (let axis = 0; axis < 3; axis += 1) {
      this.camera.target[axis] = Math.min(
        CAMERA_PAN_LIMIT,
        Math.max(
          -CAMERA_PAN_LIMIT,
          this.camera.target[axis] + right[axis] * dx + up[axis] * dy,
        ),
      );
    }
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
    this.lastPlottedRequest = value;
    this.visibleIterations = boundedInteger(
      Math.round(value * this.plottedScale),
      1,
      this.sampleCount,
      1,
    );
    this.refreshPointCount();
  }

  /**
   * Point the VAO's attributes at either the live float layout or the
   * prebaked normalized-integer layout. The shader's u_posOffset/u_posScale/
   * u_periodScale uniforms complete the dequantization in the second case.
   */
  private configurePointAttributes(quantized: boolean): void {
    const gl = this.gl;
    gl.bindVertexArray(this.pointVao);
    const attribute = (
      buffer: WebGLBuffer,
      name: string,
      size: number,
      type: number,
      normalized: boolean,
    ): void => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const location = gl.getAttribLocation(this.pointProgram, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, type, normalized, 0, 0);
    };
    const scalarType = quantized ? gl.UNSIGNED_BYTE : gl.FLOAT;
    attribute(
      this.pointBuffer,
      "a_position",
      3,
      quantized ? gl.UNSIGNED_SHORT : gl.FLOAT,
      quantized,
    );
    attribute(this.periodBuffer, "a_period", 1, scalarType, quantized);
    attribute(this.interiorBuffer, "a_interior", 1, scalarType, quantized);
    attribute(this.boundaryBuffer, "a_boundary", 1, scalarType, quantized);
    attribute(this.weightBuffer, "a_weight", 1, scalarType, quantized);
    this.quantizedAttributes = quantized;
  }

  /** Swap in a prebaked cloud, replacing whatever the live build produced. */
  private applyPrebaked(cloud: PrebakedCloud, paramSampleCount: number): void {
    this.cancelBuild();
    const gl = this.gl;
    clearGlErrors(gl);
    const upload = (buffer: WebGLBuffer, data: Uint16Array | Uint8Array): void => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    };
    upload(this.pointBuffer, cloud.positions);
    upload(this.periodBuffer, cloud.periods);
    upload(this.interiorBuffer, cloud.interiors);
    upload(this.boundaryBuffer, cloud.boundaries);
    upload(this.weightBuffer, cloud.weights);
    requireNoGlError(gl, "prebaked orbit3d upload");
    this.configurePointAttributes(true);
    this.samplingPath = "prebaked";
    this.buildFailed = false;
    this.sampleCount = cloud.sampleCount;
    this.plottedScale = cloud.sampleCount / Math.max(1, paramSampleCount);
    this.fullPointCount = cloud.cellCount * cloud.sampleCount;
    this.pointBudget = this.fullPointCount;
    this.visibleIterations = boundedInteger(
      Math.round(this.lastPlottedRequest * this.plottedScale),
      1,
      this.sampleCount,
      1,
    );
    this.refreshPointCount();
  }

  rebuild(width: number, height: number, params: OrbitParams): void {
    this.cancelBuild();
    this.buildFailed = false;
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
    this.plottedScale = 1;
    this.lastPlottedRequest = plottedIterations;
    // A baked cloud supersedes the live build for the full 2D view: the live
    // build still starts (and paints first, since the file is large), then the
    // baked buffers swap in when the fetch resolves. Sampling params are baked
    // into the file, so they only apply to a live build.
    const bakedFile = !realSliceOnly && typeof params.modelSource === "string"
      ? bakedFileFor(params.modelSource)
      : null;
    if (bakedFile) {
      void fetchPrebaked(bakedFile).then((cloud) => {
        if (cloud && generation === this.buildGeneration) {
          try {
            this.applyPrebaked(cloud, sampleCount);
          } catch (error) {
            console.error(
              "logistic-mandelbrot: prebaked cloud upload failed; rebuilding live",
              error,
            );
            this.rebuild(width, height, { ...params, modelSource: "live" });
          }
        }
      });
    }
    // Density no longer scales the build: the full budget is always built and
    // the slider culls cells in the vertex shader, so moving it is instant.
    const pointBudget = Math.max(
      sampleCount,
      pointBudgetFor(inputWidth * inputHeight),
    );
    const maxSurvivingCells = Math.max(1, Math.floor(pointBudget / sampleCount));
    const refineFraction =
      typeof params.tailRefinement === "number" &&
      Number.isFinite(params.tailRefinement)
        ? Math.max(0, Math.min(0.6, params.tailRefinement))
        : REFINE_BUDGET_FRACTION;
    // The real-axis slice already resolves the cascade at full budget width,
    // so refinement applies only to the 2D cloud.
    const refineActive = !realSliceOnly && refineFraction > 0;
    const baseSlotCap = refineActive
      ? Math.max(1, Math.floor(maxSurvivingCells * (1 - refineFraction)))
      : maxSurvivingCells;
    const desiredCells = Math.ceil(baseSlotCap / SURVIVING_CELL_ESTIMATE);
    const candidateCells = Math.min(inputWidth * inputHeight, desiredCells);
    const aspect = inputWidth / inputHeight;
    const sampleWidth = realSliceOnly
      ? maxSurvivingCells
      : Math.max(1, Math.min(inputWidth, Math.round(Math.sqrt(candidateCells * aspect))));
    const sampleHeight = realSliceOnly
      ? 1
      : Math.max(1, Math.min(inputHeight, Math.ceil(candidateCells / sampleWidth)));
    const refineSubCells = REFINE_SUBDIVISION * REFINE_SUBDIVISION;
    // Sized so the reserved slots fill even if roughly half the sub-cells
    // escape; a reservoir keeps the pick spatially uniform beyond the cap.
    const refineCandidateCap = refineActive
      ? Math.max(
          64,
          Math.ceil(((maxSurvivingCells - baseSlotCap) * 2) / refineSubCells),
        )
      : 0;
    const refineWarmup = Math.min(
      MAX_WARMUP,
      warmupIterations * REFINE_WARMUP_MULTIPLIER,
    );

    this.pointCount = 0;
    this.fullPointCount = 0;
    this.pointBudget = pointBudget;
    this.sampleCount = sampleCount;
    this.visibleIterations = plottedIterations;
    this.building = true;
    const gl = this.gl;
    if (this.quantizedAttributes) this.configurePointAttributes(false);

    if (this.orbitSampler) {
      try {
        const cloud = buildGpuOrbitCloud(this.orbitSampler, {
          sampleWidth,
          sampleHeight,
          sampleCount,
          warmupIterations,
          realSliceOnly,
          maxSurvivingCells,
          baseSlotCap,
          refineActive,
          refineCandidateCap,
          refineWarmup,
          refineSubdivision: REFINE_SUBDIVISION,
          refinePeriodThreshold: REFINE_PERIOD_THRESHOLD,
          refinePointWeight: REFINE_POINT_WEIGHT,
        });
        if (cloud) {
          this.applyLiveCloud(cloud);
          this.samplingPath = "gpu-sampled";
          this.building = false;
          return;
        }
      } catch (error) {
        console.error(
          "logistic-mandelbrot: GPU cloud build failed; falling back to CPU sampling",
          error,
        );
      }
    }

    this.samplingPath = "cpu-sampled-gpu-failed";
    const positions = new Float32Array(pointBudget * 3);
    const periods = new Float32Array(pointBudget);
    const interiors = new Float32Array(pointBudget);
    const boundaries = new Float32Array(pointBudget);
    const weights = new Float32Array(pointBudget).fill(1);
    const orbitSamples = new Float32Array(sampleCount);
    const escapeMask = new Uint8Array(sampleWidth * sampleHeight);
    const slotCell = new Int32Array(maxSurvivingCells);
    const measure = { interior: 1 };
    const refineCandidates = new Int32Array(refineCandidateCap);
    let cell = 0;
    let survivorsSeen = 0;
    let interestingSeen = 0;
    let refineCursor = 0;
    let refineSeen = 0;
    let refineStart = -1;

    const runBuildSlice = (budgetMs: number): void => {
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
        if (result === ESCAPED) {
          escapeMask[cell] = 1;
        } else {
          const slot = reservoirSlot(survivorsSeen, baseSlotCap);
          survivorsSeen += 1;
          if (slot >= 0) {
            slotCell[slot] = cell;
            for (let sample = 0; sample < sampleCount; sample += 1) {
              const offset = (sample * maxSurvivingCells + slot) * 3;
              positions[offset] = cRe;
              positions[offset + 1] = cIm;
              positions[offset + 2] = orbitSamples[sample];
              periods[sample * maxSurvivingCells + slot] = result;
              interiors[sample * maxSurvivingCells + slot] = measure.interior;
            }
          }
          if (
            refineActive &&
            (result === 0 || result >= REFINE_PERIOD_THRESHOLD)
          ) {
            const candidateSlot = reservoirSlot(
              interestingSeen,
              refineCandidateCap,
            );
            interestingSeen += 1;
            if (candidateSlot >= 0) refineCandidates[candidateSlot] = cell;
          }
        }
        cell += 1;
      }

      if (cell < sampleWidth * sampleHeight) {
        this.buildTimer = window.setTimeout(() => buildSlice(BUILD_SLICE_MS), 0);
        return;
      }

      if (refineStart < 0) refineStart = Math.min(survivorsSeen, baseSlotCap);
      const refineCapacity = maxSurvivingCells - refineStart;
      const candidateCount = Math.min(interestingSeen, refineCandidateCap);
      const refineJobs = refineActive ? candidateCount * refineSubCells : 0;
      const cellW = (RE_MAX - RE_MIN) / sampleWidth;
      const cellH = (IM_MAX - IM_MIN) / sampleHeight;
      while (refineCursor < refineJobs && performance.now() < stopAt) {
        const parent = refineCandidates[(refineCursor / refineSubCells) | 0];
        const sub = refineCursor % refineSubCells;
        refineCursor += 1;
        const px = parent % sampleWidth;
        const py = (parent - px) / sampleWidth;
        const centreRe = cellCoordinate(RE_MIN, RE_MAX, px, sampleWidth);
        const centreIm =
          py === Math.floor(sampleHeight / 2)
            ? 0
            : cellCoordinate(IM_MIN, IM_MAX, py, sampleHeight);
        const sx = sub % REFINE_SUBDIVISION;
        const sy = (sub - sx) / REFINE_SUBDIVISION;
        const subRe =
          centreRe + ((sx + 0.5) / REFINE_SUBDIVISION - 0.5) * cellW;
        const subIm =
          centreIm + ((sy + 0.5) / REFINE_SUBDIVISION - 0.5) * cellH;
        const result = sampleAttractorCell(
          subRe,
          subIm,
          refineWarmup,
          sampleCount,
          orbitSamples,
          0,
          measure,
        );
        if (result === ESCAPED) continue;
        const slot = reservoirSlot(refineSeen, refineCapacity);
        refineSeen += 1;
        if (slot < 0) continue;
        const target = refineStart + slot;
        slotCell[target] = parent;
        for (let sample = 0; sample < sampleCount; sample += 1) {
          const offset = (sample * maxSurvivingCells + target) * 3;
          positions[offset] = subRe;
          positions[offset + 1] = subIm;
          positions[offset + 2] = orbitSamples[sample];
          periods[sample * maxSurvivingCells + target] = result;
          interiors[sample * maxSurvivingCells + target] = measure.interior;
          weights[sample * maxSurvivingCells + target] = REFINE_POINT_WEIGHT;
        }
      }

      if (refineCursor < refineJobs) {
        this.buildTimer = window.setTimeout(() => buildSlice(BUILD_SLICE_MS), 0);
        return;
      }
      const survivingCells = refineStart + Math.min(refineSeen, refineCapacity);
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
        weights.copyWithin(
          sample * survivingCells,
          sample * maxSurvivingCells,
          sample * maxSurvivingCells + survivingCells,
        );
      }
      // Distance to the escape boundary is only knowable once the whole grid
      // has been swept, so the per-point attribute is written directly into
      // the compacted layout here rather than during the sweep.
      const cellScale = realSliceOnly
        ? (RE_MAX - RE_MIN) / sampleWidth
        : ((RE_MAX - RE_MIN) / sampleWidth + (IM_MAX - IM_MIN) / sampleHeight) / 2;
      const distances = boundaryDistanceField(escapeMask, sampleWidth, sampleHeight);
      for (let slot = 0; slot < survivingCells; slot += 1) {
        const distance = Math.min(1, distances[slotCell[slot]] * cellScale);
        for (let sample = 0; sample < sampleCount; sample += 1) {
          boundaries[sample * survivingCells + slot] = distance;
        }
      }
      const completedPointCount = survivingCells * sampleCount;
      clearGlErrors(gl);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        positions.subarray(0, completedPointCount * 3),
        gl.STATIC_DRAW,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, this.periodBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        periods.subarray(0, completedPointCount),
        gl.STATIC_DRAW,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, this.interiorBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        interiors.subarray(0, completedPointCount),
        gl.STATIC_DRAW,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, this.boundaryBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        boundaries.subarray(0, completedPointCount),
        gl.STATIC_DRAW,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, this.weightBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        weights.subarray(0, completedPointCount),
        gl.STATIC_DRAW,
      );
      requireNoGlError(gl, "CPU orbit3d upload");
      this.fullPointCount = completedPointCount;
      this.refreshPointCount();
      this.buildTimer = null;
      this.building = false;
      this.pendingSlice = null;
    };

    const buildSlice = (budgetMs: number): void => {
      try {
        runBuildSlice(budgetMs);
      } catch (error) {
        if (generation !== this.buildGeneration) return;
        console.error(
          "logistic-mandelbrot: CPU cloud build failed; falling back to the 2D field",
          error,
        );
        this.pointCount = 0;
        this.fullPointCount = 0;
        this.buildTimer = null;
        this.building = false;
        this.buildFailed = true;
        this.pendingSlice = null;
      }
    };

    this.pendingSlice = buildSlice;
    buildSlice(BUILD_SLICE_MS);
  }

  private applyLiveCloud(cloud: OrbitCloudBuffers): void {
    const gl = this.gl;
    clearGlErrors(gl);
    const upload = (buffer: WebGLBuffer, data: Float32Array): void => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    };
    upload(this.pointBuffer, cloud.positions);
    upload(this.periodBuffer, cloud.periods);
    upload(this.interiorBuffer, cloud.interiors);
    upload(this.boundaryBuffer, cloud.boundaries);
    upload(this.weightBuffer, cloud.weights);
    requireNoGlError(gl, "GPU orbit3d upload");
    this.fullPointCount = cloud.survivingCells * this.sampleCount;
    this.refreshPointCount();
    this.buildTimer = null;
    this.pendingSlice = null;
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
    exposure = 0.4,
    ground: Orbit3DGroundPlane | null = null,
    colourMode: Orbit3DColourMode = "period",
    fanActive = false,
    palette: WebGLTexture | null = null,
    phase = 0,
    paletteReverse = false,
    drawDensity = 1,
    edgeGlow = 0.6,
  ): boolean {
    if (!this.available || !this.ensureAccumulationTarget(width, height)) return false;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumulationFbo);
    gl.viewport(0, 0, this.targetWidth, this.targetHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const viewProjection = cameraMatrix(this.targetWidth / this.targetHeight, this.camera);
    const cycleBeam = colourMode === "cycle" ? 1 : 0;

    if (ground) {
      gl.useProgram(this.groundProgram);
      gl.uniformMatrix4fv(this.groundViewProjectionUniform, false, viewProjection);
      gl.uniform2f(this.groundTexCentreUniform, ground.centre[0], ground.centre[1]);
      gl.uniform2f(this.groundTexSpanUniform, ground.span[0], ground.span[1]);
      gl.uniform1f(this.groundMarkerReUniform, this.marker.re);
      gl.uniform1f(this.groundFanActiveUniform, fanActive ? 1 : 0);
      gl.uniform1f(this.groundCycleBeamUniform, cycleBeam);
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
    gl.uniform1f(this.paletteReverseUniform, paletteReverse ? 1 : 0);
    gl.uniform1f(this.sampleCountUniform, Math.max(1, this.sampleCount));
    gl.uniform1f(
      this.drawDensityUniform,
      Math.min(1, Math.max(0.05, drawDensity)),
    );
    gl.uniform1f(
      this.cellCountUniform,
      Math.max(1, Math.floor(this.fullPointCount / Math.max(1, this.sampleCount))),
    );
    gl.uniform1f(this.edgeGlowUniform, Math.max(0, Math.min(2, edgeGlow)));
    if (this.quantizedAttributes) {
      gl.uniform3f(this.posOffsetUniform, RE_MIN, IM_MIN, -SAMPLE_CLIP);
      gl.uniform3f(
        this.posScaleUniform,
        RE_MAX - RE_MIN,
        IM_MAX - IM_MIN,
        SAMPLE_CLIP * 2,
      );
      gl.uniform1f(this.periodScaleUniform, 255);
    } else {
      gl.uniform3f(this.posOffsetUniform, 0, 0, 0);
      gl.uniform3f(this.posScaleUniform, 1, 1, 1);
      gl.uniform1f(this.periodScaleUniform, 1);
    }
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, palette);
    gl.uniform1f(this.markerReUniform, this.marker.re);
    gl.uniform1f(this.fanActiveUniform, fanActive ? 1 : 0);
    gl.uniform1f(this.cycleBeamUniform, cycleBeam);
    gl.bindVertexArray(this.pointVao);
    gl.drawArrays(gl.POINTS, 0, this.pointCount);

    // Cycle mode reads as a self-lit field, so the roaming marker dot stays
    // hidden there unless the light beam is sweeping — then the dot is the
    // beam's anchor on the plane and belongs in view.
    if (colourMode !== "cycle" || fanActive) {
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
    }
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
    this.orbitSampler?.destroy();
    this.releaseAccumulationTarget();
    const gl = this.gl;
    gl.deleteVertexArray(this.pointVao);
    gl.deleteVertexArray(this.markerVao);
    gl.deleteVertexArray(this.groundVao);
    gl.deleteVertexArray(this.toneMapVao);
    gl.deleteBuffer(this.pointBuffer);
    gl.deleteBuffer(this.periodBuffer);
    gl.deleteBuffer(this.interiorBuffer);
    gl.deleteBuffer(this.boundaryBuffer);
    gl.deleteBuffer(this.weightBuffer);
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
  if (cellCount <= ULTRA_CELL_CEILING) return POINT_BUDGETS.ultra;
  return POINT_BUDGETS.extreme;
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

function assertOrbit3DGeometry(): void {
  const guard = ORBIT3D_GEOMETRY_GUARD;
  if (guard.planeDomain.some((value, index) => value !== guard.samplerDomain[index])) {
    throw new Error("orbit3d ground plane must match the sampler c-domain");
  }
  // The pipeline draws without a depth buffer, so the camera is allowed
  // inside the object's bounding sphere at close zoom (geometry nearer than
  // the near plane just clips). The near plane must stay short of the
  // closest dolly distance, and the far plane must contain the whole object
  // at the farthest.
  if (
    CAMERA_MIN_DISTANCE <= CAMERA_NEAR_PLANE ||
    CAMERA_MAX_DISTANCE +
        CAMERA_PAN_LIMIT * Math.sqrt(3) +
        guard.boundingRadius >=
      CAMERA_FAR_PLANE
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

function clearGlErrors(gl: WebGL2RenderingContext): void {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (gl.getError() === gl.NO_ERROR) return;
  }
}

function requireNoGlError(gl: WebGL2RenderingContext, label: string): void {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    throw new Error(`${label} failed (WebGL error ${error})`);
  }
}
