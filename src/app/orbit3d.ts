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
import {
  buildOrbitSurface,
  planOrbitSurfaceCellRefinement,
  orbitSurfaceDiagnosticMode,
  ORBIT_SURFACE_CONTOUR_BISECTION_STEPS,
  ORBIT_SURFACE_MAX_HEIGHT_JUMP,
  type OrbitSurfaceDiagnosticMode,
  type OrbitSurfaceMesh,
  type OrbitSurfaceRefinedCell,
  type OrbitSurfaceSample,
} from "./orbitSurface.ts";

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
uniform float u_boundaryDetailBaseCellCount;
uniform float u_boundaryDetailOpacity;
uniform float u_hybridMode;
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
  if (u_hybridMode > 0.5 && period > 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  // Density culls whole cells (every sample of a c-value together), matching
  // the old build-time semantics — fewer c-plane sites, full orbit columns —
  // but resolved here per frame so the slider needs no rebuild. The layout is
  // sample-major, so the cell index is the vertex id modulo the cell count;
  // hashing it gives a spatially fair, frame-stable keep set.
  float cellId = mod(float(gl_VertexID), max(u_cellCount, 1.0));
  float cellSelector = fract(sin(cellId * 12.9898) * 43758.5453);
  float dissolveDensity = u_hybridMode > 0.5 && period < 0.5 ? a_weight : 1.0;
  if (cellSelector > u_drawDensity * dissolveDensity) {
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
  float boundaryDetailOpacity = cellId >= u_boundaryDetailBaseCellCount
    ? u_boundaryDetailOpacity
    : 1.0;
  v_energy *= a_weight * boundaryDetailOpacity;
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

const SURFACE_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_normal;
in float a_period;
in float a_interior;
in float a_boundary;
in float a_rank;
in float a_edgeFade;
in float a_dissolve;
uniform mat4 u_viewProjection;
uniform vec2 u_gridSize;
uniform int u_colourMode;
uniform sampler2D u_palette;
uniform float u_phase;
uniform float u_paletteReverse;
uniform float u_visibleIterations;
uniform float u_markerRe;
uniform float u_fanActive;
out vec3 v_world;
out vec3 v_normal;
out vec3 v_colour;
out float v_fanGlow;
out float v_markerGlow;
out float v_edgeFade;
out float v_dissolve;

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
  if (a_rank + 0.5 >= u_visibleIterations) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_world = vec3(0.0);
    v_normal = vec3(0.0, 1.0, 0.0);
    v_colour = vec3(0.0);
    v_fanGlow = 0.0;
    v_markerGlow = 0.0;
    v_edgeFade = 0.0;
    v_dissolve = 0.0;
    return;
  }

  float cIm = -1.0 + ((a_position.y + 0.5) / max(u_gridSize.y, 1.0)) * 2.0;
  if (abs(a_position.y - floor(u_gridSize.y * 0.5)) < 0.25) cIm = 0.0;
  vec2 c = vec2(
    -2.0 + ((a_position.x + 0.5) / max(u_gridSize.x, 1.0)) * 3.0,
    cIm
  );
  v_world = vec3((c.x + 0.5) * 0.78, a_position.z * 0.56, c.y * 0.85);
  v_normal = normalize(vec3(
    a_normal.x * max(u_gridSize.x, 1.0) / (3.0 * 0.78),
    a_normal.z / 0.56,
    a_normal.y * max(u_gridSize.y, 1.0) / (2.0 * 0.85)
  ));
  gl_Position = u_viewProjection * vec4(v_world, 1.0);

  float height = clamp((a_position.z + 2.0) * 0.25, 0.0, 1.0);
  if (u_colourMode == 0) {
    v_colour = mix(periodHue(int(a_period + 0.5)), vec3(1.0), 0.2) * 1.1;
  } else if (u_colourMode == 1) {
    float t = clamp(a_interior, 0.0, 1.0);
    if (u_paletteReverse > 0.5) t = 1.0 - t;
    v_colour = mix(texture(u_palette, vec2(t, 0.5)).rgb, vec3(1.0), 0.12) * 1.1;
  } else if (u_colourMode == 3) {
    float band = a_boundary * 3.0;
    if (u_paletteReverse > 0.5) band = -band;
    vec3 cycling = texture(u_palette, vec2(fract(band + u_phase), 0.5)).rgb;
    v_colour = mix(vec3(0.44, 0.47, 0.53), cycling, step(a_period, 0.5));
  } else {
    float offAxis = clamp(abs(c.y), 0.0, 1.0);
    v_colour = mix(vec3(0.08, 0.38, 0.92), vec3(1.0, 0.35, 0.12), height)
      * mix(1.35, 0.82, offAxis);
  }

  float age = c.x - u_markerRe;
  float behindFront = smoothstep(-0.02, 0.04, age);
  float wake = 1.0 - smoothstep(0.55, 1.8, age);
  float reach = min(1.48, 0.04 + max(age, 0.0) * 0.9);
  float lateral = 1.0 - smoothstep(max(0.0, reach - 0.16), reach, abs(c.y));
  float rim = 1.0 - smoothstep(0.035, 0.13, abs(abs(c.y) - reach));
  float front = (1.0 - smoothstep(0.015, 0.06, abs(age)))
    * (1.0 - smoothstep(0.03, 0.14, abs(c.y)));
  v_fanGlow = u_fanActive
    * max(front, behindFront * wake * max(lateral * 0.3, rim * 0.8));
  v_markerGlow = u_fanActive * (1.0 - smoothstep(0.006, 0.025, abs(age)));
  v_edgeFade = a_edgeFade;
  v_dissolve = a_dissolve;
}
`;

const SURFACE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec3 u_cameraPosition;
uniform float u_opacity;
uniform int u_opaqueMode;
uniform int u_diagnosticMode;
in vec3 v_world;
in vec3 v_normal;
in vec3 v_colour;
in float v_fanGlow;
in float v_markerGlow;
in float v_edgeFade;
in float v_dissolve;
out vec4 outColor;

void main() {
  vec3 normal = normalize(v_normal);
  if (u_diagnosticMode == 1) {
    vec3 flatColour = vec3(0.42, 0.78, 0.94);
    outColor = vec4(flatColour * u_opacity, u_opacity);
    return;
  }
  if (u_diagnosticMode == 2) {
    vec3 normalColour = normal * 0.5 + 0.5;
    outColor = vec4(normalColour * u_opacity, u_opacity);
    return;
  }
  vec3 viewDirection = normalize(u_cameraPosition - v_world);
  if (dot(normal, viewDirection) < 0.0) normal = -normal;
  vec3 keyDirection = normalize(vec3(-0.42, 0.7, 0.55));
  float key = max(0.0, dot(normal, keyDirection));
  float fill = 0.5 + 0.5 * max(0.0, dot(normal, vec3(0.35, 0.2, -0.91)));
  float fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 2.6);
  vec3 rim = mix(vec3(0.16, 0.82, 1.0), vec3(1.0), fresnel) * fresnel;
  vec3 beam = mix(v_colour, vec3(0.48, 0.94, 1.0), 0.7)
    * (v_fanGlow * 0.34 + v_markerGlow * 0.75);
  vec3 energy = v_colour * (0.2 + key * 0.48 + fill * 0.14) + rim * 0.52 + beam;
  float edgeFade = smoothstep(0.0, 1.0, v_edgeFade);
  float coverage = edgeFade * smoothstep(0.0, 1.0, v_dissolve);
  if (u_opaqueMode == 1) {
    float threshold = fract(52.9829189 * fract(dot(
      floor(gl_FragCoord.xy),
      vec2(0.06711056, 0.00583715)
    )));
    if (threshold > coverage) discard;
    outColor = vec4(energy, 1.0);
    return;
  }
  float alpha = u_opacity * coverage;
  outColor = vec4(energy * alpha, alpha);
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
  boundaryDetail: 16_000_000,
} as const;
const SURFACE_GRID_SIZES = {
  performance: 192,
  balanced: 256,
  high: 384,
  ultra: 512,
  extreme: 768,
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
const BOUNDARY_DETAIL_SUBDIVISION = 5;
const BOUNDARY_DETAIL_WARMUP = 20_000;
// A 5x5 sub-grid contributes 25 samples per parent cell. Slightly above
// 1/25 energy parity keeps the finer structure legible without brightening
// smooth bulb interiors.
const BOUNDARY_DETAIL_POINT_WEIGHT = 0.05;

const BUILD_SLICE_MS = 8;
export const ORBIT_SURFACE_EDGE_ERROR_PX = 0.75;
export const ORBIT_SURFACE_MAX_REFINEMENT_DEPTH = 4;
/** Deterministic ceiling on adaptive boundary leaf cells. */
export const ORBIT_SURFACE_REFINEMENT_CELL_BUDGET = 32_768;
export const ORBIT_SURFACE_DISSOLVE_BAND_CELLS = 2.5;
const CAMERA_FIELD_OF_VIEW = Math.PI / 4.8;
const CAMERA_NEAR_PLANE = 0.05;
const CAMERA_FAR_PLANE = 20;
const CAMERA_MIN_DISTANCE = 0.35;
const CAMERA_PAN_LIMIT = 1.6;
const CAMERA_MAX_DISTANCE = 12;
// The full raised tier fits under the reference display's vsync boundary only
// once the camera is this close. A small exit hysteresis prevents a camera
// hovering at the threshold from repeatedly restarting the temporal fade.
const BOUNDARY_DETAIL_SHOW_DISTANCE = 0.9;
const BOUNDARY_DETAIL_HIDE_DISTANCE = 0.95;
const BOUNDARY_DETAIL_FADE_MS = 300;
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

export type Orbit3DGeometryMode = "cloud" | "hybrid";

export type Orbit3DSurfaceDiagnosticMode = OrbitSurfaceDiagnosticMode;
export const orbit3dSurfaceDiagnosticMode = orbitSurfaceDiagnosticMode;

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
  boundaryDetail: "off" | "active" | "degraded";
  geometryMode: Orbit3DGeometryMode;
  triangleCount: number;
  refinedCellCount: number;
  refinedCellShare: number;
  buildMedianSliceMs: number;
  buildMaxSliceMs: number;
  finalisationMs: number;
  surfaceAvailable: boolean;
  surfaceFallback: string | null;
}

interface SurfaceResources {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  positionBuffer: WebGLBuffer;
  normalBuffer: WebGLBuffer;
  periodBuffer: WebGLBuffer;
  interiorBuffer: WebGLBuffer;
  boundaryBuffer: WebGLBuffer;
  rankBuffer: WebGLBuffer;
  edgeFadeBuffer: WebGLBuffer;
  dissolveBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  viewProjectionUniform: WebGLUniformLocation;
  gridSizeUniform: WebGLUniformLocation;
  colourModeUniform: WebGLUniformLocation;
  paletteUniform: WebGLUniformLocation | null;
  phaseUniform: WebGLUniformLocation;
  paletteReverseUniform: WebGLUniformLocation;
  visibleIterationsUniform: WebGLUniformLocation;
  markerReUniform: WebGLUniformLocation;
  fanActiveUniform: WebGLUniformLocation;
  cameraPositionUniform: WebGLUniformLocation;
  opacityUniform: WebGLUniformLocation;
  opaqueModeUniform: WebGLUniformLocation;
  diagnosticModeUniform: WebGLUniformLocation;
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
  private readonly boundaryDetailBaseCellCountUniform: WebGLUniformLocation;
  private readonly boundaryDetailOpacityUniform: WebGLUniformLocation;
  private readonly hybridModeUniform: WebGLUniformLocation;
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
  private readonly surface: SurfaceResources | null;
  private accumulationTexture: WebGLTexture | null = null;
  private accumulationFbo: WebGLFramebuffer | null = null;
  private accumulationDepth: WebGLRenderbuffer | null = null;
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
  private boundaryDetail: Orbit3DStats["boundaryDetail"] = "off";
  private boundaryDetailBaseCellCount = 0;
  private boundaryDetailTierVisible = false;
  private boundaryDetailFadeProgress = 0;
  private boundaryDetailFadeUpdatedAt: number | null = null;
  private camera = defaultCameraState();
  private marker: Orbit3DMarkerReadout = {
    re: DEFAULT_MARKER_RE,
    im: DEFAULT_MARKER_IM,
    period: 0,
  };
  private markerOrbitPointCount = 0;
  private geometryMode: Orbit3DGeometryMode = "cloud";
  private triangleCount = 0;
  private refinedCellCount = 0;
  private refinedCellShare = 0;
  private buildMedianSliceMs = 0;
  private buildMaxSliceMs = 0;
  private finalisationMs = 0;
  private surfaceGridWidth = 1;
  private surfaceGridHeight = 1;
  private surfaceVisibleIterations = DEFAULT_SAMPLE_COUNT;
  private pointHybridCull = false;
  private surfaceFallback: string | null = null;
  private surfaceResourceFailed = false;

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
    this.boundaryDetailBaseCellCountUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_boundaryDetailBaseCellCount"),
      "orbit3d boundary-detail base-cell-count uniform",
    );
    this.boundaryDetailOpacityUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_boundaryDetailOpacity"),
      "orbit3d boundary-detail opacity uniform",
    );
    this.hybridModeUniform = requireResource(
      gl.getUniformLocation(this.pointProgram, "u_hybridMode"),
      "orbit3d hybrid-mode uniform",
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
    this.surface = createSurfaceResources(gl);
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
    const surfaceAvailable =
      this.geometryMode === "hybrid" &&
      this.surface !== null &&
      this.accumulationDepth !== null &&
      !this.surfaceResourceFailed &&
      this.surfaceFallback === null;
    return {
      pointCount: this.pointCount,
      pointBudget: this.pointBudget,
      building: this.building,
      samplingPath: this.samplingPath,
      boundaryDetail: this.boundaryDetail,
      geometryMode: this.geometryMode,
      triangleCount: this.triangleCount,
      refinedCellCount: this.refinedCellCount,
      refinedCellShare: this.refinedCellShare,
      buildMedianSliceMs: this.buildMedianSliceMs,
      buildMaxSliceMs: this.buildMaxSliceMs,
      finalisationMs: this.finalisationMs,
      surfaceAvailable,
      surfaceFallback: this.surfaceFallback,
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
    this.surfaceVisibleIterations = boundedInteger(value, 1, 96, 1);
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
    this.boundaryDetail = "off";
    this.boundaryDetailBaseCellCount = 0;
    this.resetBoundaryDetailFade();
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

  rebuild(
    width: number,
    height: number,
    params: OrbitParams,
    viewportWidth = width,
    viewportHeight = height,
  ): void {
    this.cancelBuild();
    this.resetBoundaryDetailFade();
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
    this.geometryMode = params.geometryMode === "hybrid" ? "hybrid" : "cloud";
    this.triangleCount = 0;
    this.refinedCellCount = 0;
    this.refinedCellShare = 0;
    this.buildMedianSliceMs = 0;
    this.buildMaxSliceMs = 0;
    this.finalisationMs = 0;
    this.surfaceVisibleIterations = plottedIterations;
    this.pointHybridCull = false;
    this.surfaceFallback = null;
    if (this.geometryMode === "hybrid") {
      if (realSliceOnly) {
        this.surfaceFallback = "real-slice-only";
      } else if (!this.surface || this.surfaceResourceFailed) {
        this.surfaceFallback = "surface-resources";
      } else if (!this.accumulationDepth) {
        this.surfaceFallback = "depth-target";
      } else {
        this.samplingPath = "cpu-sampled";
        this.boundaryDetail = "off";
        this.boundaryDetailBaseCellCount = 0;
        try {
          this.rebuildHybrid(
            inputWidth,
            inputHeight,
            sampleCount,
            plottedIterations,
            warmupIterations,
            generation,
            viewportWidth,
            viewportHeight,
          );
          return;
        } catch (error) {
          console.error(
            "logistic-mandelbrot: hybrid surface build failed; falling back to cloud",
            error,
          );
          this.surfaceResourceFailed = true;
          this.surfaceFallback = "surface-allocation";
        }
      }
    }
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
    const boundaryDetailLevel =
      typeof params.boundaryDetail === "number" &&
      Number.isFinite(params.boundaryDetail)
        ? Math.max(0, Math.min(1, params.boundaryDetail))
        : 0;
    // A requested bake owns the cloud once it arrives, so boundary detail is
    // limited to explicit live builds rather than inflating the temporary
    // cloud underneath a prebake.
    const boundaryDetailRequested =
      bakedFile === null && !realSliceOnly && boundaryDetailLevel > 0;
    const boundaryDetailActive =
      boundaryDetailRequested && this.orbitSampler !== null;
    const gpuPointBudget = boundaryDetailActive
      ? Math.floor(
          pointBudget +
            (POINT_BUDGETS.boundaryDetail - pointBudget) * boundaryDetailLevel,
        )
      : pointBudget;
    const gpuMaxSurvivingCells = Math.max(
      1,
      Math.floor(gpuPointBudget / sampleCount),
    );
    const gpuRefineActive = refineActive || boundaryDetailActive;
    const gpuRefineSubdivision = boundaryDetailActive
      ? BOUNDARY_DETAIL_SUBDIVISION
      : REFINE_SUBDIVISION;
    const gpuRefineSubCells = gpuRefineSubdivision * gpuRefineSubdivision;
    const gpuRefineCandidateCap = gpuRefineActive
      ? Math.max(
          64,
          Math.ceil(
            ((gpuMaxSurvivingCells - baseSlotCap) * 2) /
              gpuRefineSubCells,
          ),
        )
      : 0;

    this.pointCount = 0;
    this.fullPointCount = 0;
    this.pointBudget = gpuPointBudget;
    this.sampleCount = sampleCount;
    this.visibleIterations = plottedIterations;
    this.building = true;
    this.boundaryDetail = boundaryDetailRequested
      ? boundaryDetailActive
        ? "active"
        : "degraded"
      : "off";
    this.boundaryDetailBaseCellCount = 0;
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
          maxSurvivingCells: gpuMaxSurvivingCells,
          baseSlotCap,
          baselineMaxSurvivingCells: maxSurvivingCells,
          baselineRefineActive: refineActive,
          baselineRefineCandidateCap: refineCandidateCap,
          baselineRefineWarmup: refineWarmup,
          baselineRefineSubdivision: REFINE_SUBDIVISION,
          baselineRefinePointWeight: REFINE_POINT_WEIGHT,
          refineActive: gpuRefineActive,
          refineCandidateCap: gpuRefineCandidateCap,
          refineWarmup: boundaryDetailActive
            ? BOUNDARY_DETAIL_WARMUP
            : refineWarmup,
          refineSubdivision: gpuRefineSubdivision,
          refinePeriodThreshold: REFINE_PERIOD_THRESHOLD,
          refinePointWeight: boundaryDetailActive
            ? BOUNDARY_DETAIL_POINT_WEIGHT
            : REFINE_POINT_WEIGHT,
          boundaryDetailActive,
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
    this.pointBudget = pointBudget;
    if (boundaryDetailRequested) this.boundaryDetail = "degraded";
    this.boundaryDetailBaseCellCount = 0;
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

  private rebuildHybrid(
    inputWidth: number,
    inputHeight: number,
    sampleCount: number,
    plottedIterations: number,
    warmupIterations: number,
    generation: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    const gridSize = surfaceGridSizeFor(inputWidth * inputHeight);
    const sampleWidth = gridSize;
    const sampleHeight = gridSize;
    const cellCount = sampleWidth * sampleHeight;
    const coarseQuadCount = Math.max(0, (sampleWidth - 1) * (sampleHeight - 1));
    const pointBudget = Math.max(sampleCount, pointBudgetFor(inputWidth * inputHeight));
    const samples = new Float32Array(cellCount * sampleCount);
    const periods = new Int16Array(cellCount);
    const interiors = new Float32Array(cellCount);
    const boundaries = new Float32Array(cellCount);
    const dissolves = new Float32Array(cellCount).fill(1);
    const escaped = new Uint8Array(cellCount);
    const measure = { interior: 1 };
    const refinedCells: OrbitSurfaceRefinedCell[] = [];
    const refinedCellIndices = new Set<number>();
    const refinedLeavesByCell = new Map<number, OrbitSurfaceRefinedCell[]>();
    const adaptiveSamples = new Map<number, OrbitSurfaceSample>();
    let contourSampleValues = new Float32Array(0);
    let contourPeriods = new Int16Array(0);
    let contourInteriors = new Float32Array(0);
    let contourEscaped = new Uint8Array(0);
    const contourSamples = new Map<number, number>();
    let contourSampleCount = 0;
    const transitionEdges: number[] = [];
    const transitionEdgeKeys = new Set<number>();
    const sliceDurations: number[] = [];
    const refinementDivisions = 2 ** ORBIT_SURFACE_MAX_REFINEMENT_DEPTH;
    const contourCoordinateScale =
      refinementDivisions * 2 ** (ORBIT_SURFACE_CONTOUR_BISECTION_STEPS + 1);
    const contourCoordinateWidth =
      (sampleWidth - 1) * contourCoordinateScale + 1;
    const edgeCoordinateWidth = (sampleWidth - 1) * refinementDivisions + 1;
    const edgeCoordinateCount =
      edgeCoordinateWidth * ((sampleHeight - 1) * refinementDivisions + 1);
    const refinementMatrix = cameraMatrix(
      Math.max(0.25, viewportWidth / Math.max(1, viewportHeight)),
      this.camera,
    );
    let phase: "coarse" | "refinement-scan" | "edge-scan" | "contour-sample" = "coarse";
    let cell = 0;
    let refinementScan = 0;
    let edgeScan = 0;
    let transitionEdge = 0;
    let periodicDistances: Float32Array = new Float32Array(cellCount);

    this.pointCount = 0;
    this.fullPointCount = 0;
    this.pointBudget = pointBudget;
    this.sampleCount = sampleCount;
    this.visibleIterations = plottedIterations;
    this.surfaceVisibleIterations = plottedIterations;
    this.surfaceGridWidth = sampleWidth;
    this.surfaceGridHeight = sampleHeight;
    this.building = true;

    const buildSlice = (budgetMs: number): void => {
      if (generation !== this.buildGeneration) return;
      this.buildTimer = null;
      const sliceStart = performance.now();
      const stopAt = sliceStart + budgetMs;
      while (true) {
        if (phase === "coarse") {
          if (cell >= cellCount) {
            prepareDissolveCoverages();
            phase = "refinement-scan";
            continue;
          }
          const x = cell % sampleWidth;
          const y = (cell - x) / sampleWidth;
          measure.interior = 1;
          const result = sampleAttractorCell(
            gridCoordinate(RE_MIN, RE_MAX, x, sampleWidth),
            y === Math.floor(sampleHeight / 2)
              ? 0
              : gridCoordinate(IM_MIN, IM_MAX, y, sampleHeight),
            warmupIterations,
            sampleCount,
            samples,
            cell * sampleCount,
            measure,
          );
          if (result === ESCAPED) escaped[cell] = 1;
          else {
            periods[cell] = result;
            interiors[cell] = measure.interior;
          }
          cell += 1;
        } else if (phase === "refinement-scan") {
          if (refinementScan >= coarseQuadCount) {
            phase = "edge-scan";
            continue;
          }
          const x = refinementScan % (sampleWidth - 1);
          const y = (refinementScan - x) / (sampleWidth - 1);
          const topLeft = y * sampleWidth + x;
          const topLeftPeriod = coarsePeriod(topLeft);
          const topRightPeriod = coarsePeriod(topLeft + 1);
          const bottomLeftPeriod = coarsePeriod(topLeft + sampleWidth);
          const bottomRightPeriod = coarsePeriod(topLeft + sampleWidth + 1);
          const boundary =
            (
              topLeftPeriod > 0 ||
              topRightPeriod > 0 ||
              bottomLeftPeriod > 0 ||
              bottomRightPeriod > 0
            ) &&
            (
              topRightPeriod !== topLeftPeriod ||
              bottomLeftPeriod !== topLeftPeriod ||
              bottomRightPeriod !== topLeftPeriod
            );
          if (boundary) {
            const remaining = ORBIT_SURFACE_REFINEMENT_CELL_BUDGET - refinedCells.length;
            if (remaining > 0) {
              const plan = planOrbitSurfaceCellRefinement(
                x,
                y,
                sampleSurfacePoint,
                sampleCount,
                projectSurfacePoint,
                ORBIT_SURFACE_EDGE_ERROR_PX,
                ORBIT_SURFACE_MAX_REFINEMENT_DEPTH,
                remaining,
              );
              refinedCells.push(...plan.cells);
              refinedCellIndices.add(refinementScan);
              refinedLeavesByCell.set(refinementScan, plan.cells);
            }
          }
          refinementScan += 1;
        } else if (phase === "edge-scan") {
          if (edgeScan >= coarseQuadCount) {
            const contourCapacity =
              transitionEdges.length / 4 * ORBIT_SURFACE_CONTOUR_BISECTION_STEPS;
            contourSampleValues = new Float32Array(contourCapacity * sampleCount);
            contourPeriods = new Int16Array(contourCapacity);
            contourInteriors = new Float32Array(contourCapacity);
            contourEscaped = new Uint8Array(contourCapacity);
            phase = "contour-sample";
            continue;
          }
          const x = edgeScan % (sampleWidth - 1);
          const y = (edgeScan - x) / (sampleWidth - 1);
          if (refinedCellIndices.has(edgeScan)) {
            for (const leaf of refinedLeavesByCell.get(edgeScan) ?? []) {
              const size = leaf.size ?? 1 / 2 ** leaf.depth;
              queueQuadEdges(leaf.x, leaf.y, leaf.x + size, leaf.y + size);
            }
          } else {
            queueQuadEdges(x, y, x + 1, y + 1);
          }
          edgeScan += 1;
        } else {
          if (transitionEdge * 4 >= transitionEdges.length) {
            recordSlice(sliceStart, budgetMs);
            finaliseHybrid();
            return;
          }
          const edgeOffset = transitionEdge * 4;
          const x0 = transitionEdges[edgeOffset];
          const y0 = transitionEdges[edgeOffset + 1];
          const x1 = transitionEdges[edgeOffset + 2];
          const y1 = transitionEdges[edgeOffset + 3];
          prepareContourEdge(x0, y0, x1, y1);
          transitionEdge += 1;
        }

        if (performance.now() >= stopAt) {
          recordSlice(sliceStart, budgetMs);
          this.buildTimer = window.setTimeout(() => buildSlice(BUILD_SLICE_MS), 0);
          return;
        }
      }
    };

    const coarsePeriod = (index: number): number =>
      escaped[index] === 0 && periods[index] > 0 ? periods[index] : 0;

    const lookupPreparedSample = (x: number, y: number): OrbitSurfaceSample | null => {
      if (
        Number.isInteger(x) &&
        Number.isInteger(y) &&
        x >= 0 &&
        x < sampleWidth &&
        y >= 0 &&
        y < sampleHeight
      ) {
        const index = y * sampleWidth + x;
        return {
          samples,
          sampleOffset: index * sampleCount,
          period: periods[index],
          interior: interiors[index],
          boundary: boundaries[index],
          dissolve: dissolves[index],
          escaped: escaped[index] !== 0,
        };
      }
      const key = surfacePointId(x, y);
      const adaptive = adaptiveSamples.get(key);
      if (adaptive) {
        return {
          ...adaptive,
          boundary: boundaryAtGrid(x, y),
          dissolve: dissolveAtGrid(x, y),
        };
      }
      const contourIndex = contourSamples.get(key);
      if (contourIndex === undefined) return null;
      return {
        samples: contourSampleValues,
        sampleOffset: contourIndex * sampleCount,
        period: contourPeriods[contourIndex],
        interior: contourInteriors[contourIndex],
        boundary: boundaryAtGrid(x, y),
        dissolve: dissolveAtGrid(x, y),
        escaped: contourEscaped[contourIndex] !== 0,
      };
    };

    const preparedSample = (x: number, y: number): OrbitSurfaceSample => {
      const sample = lookupPreparedSample(x, y);
      if (!sample) {
        throw new Error(`Orbit surface sample was not prepared at ${x},${y}.`);
      }
      return sample;
    };

    const lookupPreparedPeriod = (x: number, y: number): number | undefined => {
      if (
        Number.isInteger(x) &&
        Number.isInteger(y) &&
        x >= 0 &&
        x < sampleWidth &&
        y >= 0 &&
        y < sampleHeight
      ) {
        return coarsePeriod(y * sampleWidth + x);
      }
      const key = surfacePointId(x, y);
      const adaptive = adaptiveSamples.get(key);
      if (adaptive) return adaptive.escaped ? 0 : adaptive.period;
      const contourIndex = contourSamples.get(key);
      if (contourIndex === undefined) return undefined;
      return contourEscaped[contourIndex] === 0 ? contourPeriods[contourIndex] : 0;
    };

    const sampleSurfacePoint = (x: number, y: number): OrbitSurfaceSample => {
      const prepared = lookupPreparedSample(x, y);
      if (prepared) return prepared;
      const values = new Float32Array(sampleCount);
      measure.interior = 1;
      const result = sampleAttractorCell(
        gridCoordinate(RE_MIN, RE_MAX, x, sampleWidth),
        y === Math.floor(sampleHeight / 2)
          ? 0
          : gridCoordinate(IM_MIN, IM_MAX, y, sampleHeight),
        warmupIterations,
        sampleCount,
        values,
        0,
        measure,
      );
      const sample: OrbitSurfaceSample = {
        samples: values,
        period: result === ESCAPED ? 0 : result,
        interior: result === ESCAPED ? 1 : measure.interior,
        boundary: boundaryAtGrid(x, y),
        dissolve: dissolveAtGrid(x, y),
        escaped: result === ESCAPED,
      };
      adaptiveSamples.set(surfacePointId(x, y), sample);
      return sample;
    };

    const projectSurfacePoint = (x: number, y: number, height: number) => {
      const cRe = gridCoordinate(RE_MIN, RE_MAX, x, sampleWidth);
      const cIm = y === Math.floor(sampleHeight / 2)
        ? 0
        : gridCoordinate(IM_MIN, IM_MAX, y, sampleHeight);
      const clip = transformPoint(refinementMatrix, [
        (cRe + 0.5) * WORLD_RE_SCALE,
        height * WORLD_ORBIT_SCALE,
        cIm * WORLD_IM_SCALE,
      ]);
      const reciprocalW = clip[3] > Number.EPSILON ? 1 / clip[3] : 0;
      return {
        x: (clip[0] * reciprocalW * 0.5 + 0.5) * Math.max(1, viewportWidth),
        y: (0.5 - clip[1] * reciprocalW * 0.5) * Math.max(1, viewportHeight),
      };
    };

    const preparedOrSampleContourPeriod = (x: number, y: number): number => {
      const prepared = lookupPreparedPeriod(x, y);
      if (prepared !== undefined) return prepared;
      measure.interior = 1;
      const result = sampleAttractorCell(
        gridCoordinate(RE_MIN, RE_MAX, x, sampleWidth),
        y === Math.floor(sampleHeight / 2)
          ? 0
          : gridCoordinate(IM_MIN, IM_MAX, y, sampleHeight),
        warmupIterations,
        sampleCount,
        contourSampleValues,
        contourSampleCount * sampleCount,
        measure,
      );
      contourPeriods[contourSampleCount] = result === ESCAPED ? 0 : result;
      contourInteriors[contourSampleCount] = result === ESCAPED ? 1 : measure.interior;
      contourEscaped[contourSampleCount] = result === ESCAPED ? 1 : 0;
      contourSamples.set(surfacePointId(x, y), contourSampleCount);
      contourSampleCount += 1;
      return result === ESCAPED ? 0 : result;
    };

    const prepareContourEdge = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
    ): void => {
      const firstIsLow = x0 < x1 || (x0 === x1 && y0 <= y1);
      let lowX = firstIsLow ? x0 : x1;
      let lowY = firstIsLow ? y0 : y1;
      let highX = firstIsLow ? x1 : x0;
      let highY = firstIsLow ? y1 : y0;
      const lowPeriod = lookupPreparedPeriod(lowX, lowY) ?? 0;
      for (let step = 0; step < ORBIT_SURFACE_CONTOUR_BISECTION_STEPS; step += 1) {
        const x = (lowX + highX) * 0.5;
        const y = (lowY + highY) * 0.5;
        if (preparedOrSampleContourPeriod(x, y) === lowPeriod) {
          lowX = x;
          lowY = y;
        } else {
          highX = x;
          highY = y;
        }
      }
    };

    const queueQuadEdges = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
    ): void => {
      queueTransitionEdge(x0, y0, x0, y1);
      queueTransitionEdge(x0, y1, x1, y0);
      queueTransitionEdge(x1, y0, x0, y0);
      queueTransitionEdge(x0, y1, x1, y1);
      queueTransitionEdge(x1, y1, x1, y0);
    };

    const queueTransitionEdge = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
    ): void => {
      const firstPeriod = lookupPreparedPeriod(x0, y0) ?? 0;
      const secondPeriod = lookupPreparedPeriod(x1, y1) ?? 0;
      if (firstPeriod === secondPeriod || (firstPeriod <= 0 && secondPeriod <= 0)) {
        return;
      }
      const first = edgePointId(x0, y0);
      const second = edgePointId(x1, y1);
      const key = first < second
        ? first * edgeCoordinateCount + second
        : second * edgeCoordinateCount + first;
      if (transitionEdgeKeys.has(key)) return;
      transitionEdgeKeys.add(key);
      transitionEdges.push(x0, y0, x1, y1);
    };

    const surfacePointId = (x: number, y: number): number =>
      Math.round(y * contourCoordinateScale) * contourCoordinateWidth
      + Math.round(x * contourCoordinateScale);

    const edgePointId = (x: number, y: number): number =>
      Math.round(y * refinementDivisions) * edgeCoordinateWidth
      + Math.round(x * refinementDivisions);

    const prepareDissolveCoverages = (): void => {
      const chaosMask = new Uint8Array(cellCount);
      const periodicMask = new Uint8Array(cellCount);
      for (let index = 0; index < cellCount; index += 1) {
        const period = coarsePeriod(index);
        chaosMask[index] = escaped[index] === 0 && period === 0 ? 1 : 0;
        periodicMask[index] = period > 0 ? 1 : 0;
      }
      const chaosDistances = boundaryDistanceField(chaosMask, sampleWidth, sampleHeight);
      periodicDistances = boundaryDistanceField(periodicMask, sampleWidth, sampleHeight);
      for (let index = 0; index < cellCount; index += 1) {
        dissolves[index] = dissolveCoverage(chaosDistances[index]);
      }
    };

    const boundaryAtGrid = (x: number, y: number): number =>
      interpolateGrid(boundaries, x, y);

    const dissolveAtGrid = (x: number, y: number): number =>
      interpolateGrid(dissolves, x, y);

    const interpolateGrid = (values: Float32Array, x: number, y: number): number => {
      const left = Math.max(0, Math.min(sampleWidth - 1, Math.floor(x)));
      const right = Math.max(0, Math.min(sampleWidth - 1, Math.ceil(x)));
      const top = Math.max(0, Math.min(sampleHeight - 1, Math.floor(y)));
      const bottom = Math.max(0, Math.min(sampleHeight - 1, Math.ceil(y)));
      const tx = x - Math.floor(x);
      const ty = y - Math.floor(y);
      const topValue = values[top * sampleWidth + left] * (1 - tx)
        + values[top * sampleWidth + right] * tx;
      const bottomValue = values[bottom * sampleWidth + left] * (1 - tx)
        + values[bottom * sampleWidth + right] * tx;
      return topValue * (1 - ty) + bottomValue * ty;
    };

    const dissolveCoverage = (distance: number): number =>
      Math.min(1, Math.max(0, distance - 0.5) / ORBIT_SURFACE_DISSOLVE_BAND_CELLS);

    const recordSlice = (startedAt: number, budgetMs: number): void => {
      if (Number.isFinite(budgetMs)) {
        sliceDurations.push(performance.now() - startedAt);
      }
    };

    const finaliseHybrid = (): void => {
      const finalisationStart = performance.now();
      const cellScale =
        ((RE_MAX - RE_MIN) / sampleWidth + (IM_MAX - IM_MIN) / sampleHeight) / 2;
      const distances = boundaryDistanceField(escaped, sampleWidth, sampleHeight);
      for (let index = 0; index < cellCount; index += 1) {
        boundaries[index] = Math.min(1, distances[index] * cellScale);
      }

      let mesh: OrbitSurfaceMesh | null = null;
      try {
        mesh = buildOrbitSurface(
          {
            width: sampleWidth,
            height: sampleHeight,
            sampleCount,
            samples,
            periods,
            interiors,
            boundaries,
            dissolves,
            escaped,
          },
          ORBIT_SURFACE_MAX_HEIGHT_JUMP,
          { sampler: preparedSample, refinedCells },
        );
      } catch {
        this.surfaceResourceFailed = true;
        this.surfaceFallback = "surface-allocation";
      }
      const surfaceReady = mesh ? this.uploadSurfaceMesh(mesh) : false;
      this.pointHybridCull = surfaceReady;
      this.triangleCount = surfaceReady && mesh ? mesh.indices.length / 3 : 0;
      this.refinedCellCount = refinedCells.length;
      this.refinedCellShare = coarseQuadCount > 0
        ? refinedCellIndices.size / coarseQuadCount
        : 0;

      const boundedCells = new Int32Array(cellCount);
      let boundedCount = 0;
      for (let index = 0; index < cellCount; index += 1) {
        if (escaped[index] === 0) {
          boundedCells[boundedCount] = index;
          boundedCount += 1;
        }
      }
      const pointSampleCount = boundedCount === 0
        ? sampleCount
        : Math.max(1, Math.min(sampleCount, Math.floor(pointBudget / boundedCount)));
      const fullPointCount = boundedCount * pointSampleCount;
      const positions = new Float32Array(fullPointCount * 3);
      const pointPeriods = new Float32Array(fullPointCount);
      const pointInteriors = new Float32Array(fullPointCount);
      const pointBoundaries = new Float32Array(fullPointCount);
      const pointWeights = new Float32Array(fullPointCount).fill(1);
      for (let slot = 0; slot < boundedCount; slot += 1) {
        const sourceCell = boundedCells[slot];
        const x = sourceCell % sampleWidth;
        const y = (sourceCell - x) / sampleWidth;
        const cRe = cellCoordinate(RE_MIN, RE_MAX, x, sampleWidth);
        const cIm = y === Math.floor(sampleHeight / 2)
          ? 0
          : cellCoordinate(IM_MIN, IM_MAX, y, sampleHeight);
        for (let sample = 0; sample < pointSampleCount; sample += 1) {
          const point = sample * boundedCount + slot;
          const offset = point * 3;
          positions[offset] = cRe;
          positions[offset + 1] = cIm;
          positions[offset + 2] = samples[sourceCell * sampleCount + sample];
          pointPeriods[point] = periods[sourceCell];
          pointInteriors[point] = interiors[sourceCell];
          pointBoundaries[point] = boundaries[sourceCell];
          if (periods[sourceCell] === 0) {
            pointWeights[point] = dissolveCoverage(periodicDistances[sourceCell]);
          }
        }
      }

      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.periodBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, pointPeriods, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.interiorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, pointInteriors, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.boundaryBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, pointBoundaries, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.weightBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, pointWeights, gl.STATIC_DRAW);
      this.fullPointCount = fullPointCount;
      this.sampleCount = pointSampleCount;
      this.visibleIterations = Math.min(plottedIterations, pointSampleCount);
      this.refreshPointCount();

      const orderedSlices = [...sliceDurations].sort((left, right) => left - right);
      const middle = Math.floor(orderedSlices.length / 2);
      this.buildMedianSliceMs = orderedSlices.length === 0
        ? 0
        : orderedSlices.length % 2 === 0
          ? (orderedSlices[middle - 1] + orderedSlices[middle]) / 2
          : orderedSlices[middle];
      this.buildMaxSliceMs = orderedSlices.at(-1) ?? 0;
      this.finalisationMs = performance.now() - finalisationStart;
      this.buildTimer = null;
      this.building = false;
      this.pendingSlice = null;
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
    this.boundaryDetailBaseCellCount = cloud.boundaryDetailBaseCells;
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

  private uploadSurfaceMesh(mesh: OrbitSurfaceMesh): boolean {
    const surface = this.surface;
    if (!surface || !this.accumulationDepth || this.surfaceResourceFailed) {
      this.surfaceFallback = !surface ? "surface-resources" : "depth-target";
      return false;
    }
    const gl = this.gl;
    clearGlErrors(gl);
    gl.bindVertexArray(surface.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.periodBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.periods, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.interiorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.interiors, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.boundaryBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.boundaries, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.rankBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.ranks, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.edgeFadeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.edgeFades, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.dissolveBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.dissolves, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surface.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    if (gl.getError() !== gl.NO_ERROR) {
      clearGlErrors(gl);
      this.surfaceResourceFailed = true;
      this.surfaceFallback = "surface-upload";
      return false;
    }
    this.surfaceFallback = null;
    return true;
  }


  draw(
    width: number,
    height: number,
    exposure = 1,
    ground: Orbit3DGroundPlane | null = null,
    colourMode: Orbit3DColourMode = "period",
    fanActive = false,
    palette: WebGLTexture | null = null,
    phase = 0,
    paletteReverse = false,
    drawDensity = 1,
    surfaceOpacity = 0.4,
    edgeGlow = 0.6,
    surfaceDiagnosticMode: Orbit3DSurfaceDiagnosticMode = "off",
  ): boolean {
    if (!this.available || !this.ensureAccumulationTarget(width, height)) return false;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumulationFbo);
    gl.viewport(0, 0, this.targetWidth, this.targetHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const viewProjection = cameraMatrix(this.targetWidth / this.targetHeight, this.camera);
    const cycleBeam = colourMode === "cycle" ? 1 : 0;

    if (ground) {
      if (this.accumulationDepth) gl.enable(gl.DEPTH_TEST);
      else gl.disable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
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

    const surfaceDrawn = this.drawSurface(
      viewProjection,
      colourMode,
      palette,
      phase,
      paletteReverse,
      fanActive,
      surfaceOpacity,
      surfaceDiagnosticMode,
    );
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

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
    const fullCellCount = Math.max(
      1,
      Math.floor(this.fullPointCount / Math.max(1, this.sampleCount)),
    );
    gl.uniform1f(this.cellCountUniform, fullCellCount);
    const boundaryDetailActive = this.boundaryDetail === "active";
    const boundaryDetailBaseCellCount = boundaryDetailActive
      ? Math.min(fullCellCount, this.boundaryDetailBaseCellCount)
      : fullCellCount;
    gl.uniform1f(
      this.boundaryDetailBaseCellCountUniform,
      boundaryDetailBaseCellCount,
    );
    const boundaryDetailOpacity = this.updateBoundaryDetailFade(
      performance.now(),
    );
    const boundaryDetailTierSubmitted = boundaryDetailActive &&
      (this.boundaryDetailTierVisible || this.boundaryDetailFadeProgress > 0);
    const boundaryDetailDrawCellCount = boundaryDetailTierSubmitted
      ? fullCellCount
      : boundaryDetailBaseCellCount;
    gl.uniform1f(
      this.boundaryDetailOpacityUniform,
      boundaryDetailOpacity,
    );
    gl.uniform1f(
      this.hybridModeUniform,
      surfaceDrawn && this.pointHybridCull ? 1 : 0,
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
    if (boundaryDetailDrawCellCount < fullCellCount) {
      // Points are sample-major, so each visible orbit sample owns one
      // contiguous base prefix followed by the raised tier. When detail is
      // hidden, submit exactly that baseline prefix and no raised vertices.
      for (let first = 0; first < this.pointCount; first += fullCellCount) {
        gl.drawArrays(gl.POINTS, first, boundaryDetailDrawCellCount);
      }
    } else {
      gl.drawArrays(gl.POINTS, 0, this.pointCount);
    }

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

  private drawSurface(
    viewProjection: Float32Array,
    colourMode: Orbit3DColourMode,
    palette: WebGLTexture | null,
    phase: number,
    paletteReverse: boolean,
    fanActive: boolean,
    opacityValue: number,
    diagnosticMode: Orbit3DSurfaceDiagnosticMode,
  ): boolean {
    const surface = this.surface;
    if (
      this.geometryMode === "hybrid" &&
      !this.accumulationDepth &&
      this.surfaceFallback === null
    ) {
      this.surfaceFallback = "depth-target";
    }
    if (
      this.geometryMode !== "hybrid" ||
      this.surfaceFallback !== null ||
      this.surfaceResourceFailed ||
      !this.accumulationDepth ||
      !surface ||
      this.triangleCount <= 0
    ) {
      return false;
    }
    const gl = this.gl;
    const opacity = Math.min(1, Math.max(0.1, opacityValue));
    clearGlErrors(gl);
    gl.enable(gl.DEPTH_TEST);
    if (opacity >= 1) {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    } else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
    }
    gl.useProgram(surface.program);
    gl.uniformMatrix4fv(surface.viewProjectionUniform, false, viewProjection);
    gl.uniform2f(
      surface.gridSizeUniform,
      this.surfaceGridWidth,
      this.surfaceGridHeight,
    );
    gl.uniform1i(surface.colourModeUniform, COLOUR_MODE_INDEX[colourMode] ?? 0);
    gl.uniform1i(surface.paletteUniform, 3);
    gl.uniform1f(surface.phaseUniform, phase);
    gl.uniform1f(surface.paletteReverseUniform, paletteReverse ? 1 : 0);
    gl.uniform1f(
      surface.visibleIterationsUniform,
      Math.max(1, this.surfaceVisibleIterations),
    );
    gl.uniform1f(surface.markerReUniform, this.marker.re);
    gl.uniform1f(surface.fanActiveUniform, fanActive ? 1 : 0);
    const eye = cameraEye(this.camera);
    gl.uniform3f(surface.cameraPositionUniform, eye[0], eye[1], eye[2]);
    gl.uniform1f(surface.opacityUniform, opacity);
    gl.uniform1i(surface.opaqueModeUniform, opacity >= 1 ? 1 : 0);
    gl.uniform1i(
      surface.diagnosticModeUniform,
      diagnosticMode === "flat" ? 1 : diagnosticMode === "normals" ? 2 : 0,
    );
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, palette);
    gl.bindVertexArray(surface.vao);
    gl.drawElements(gl.TRIANGLES, this.triangleCount * 3, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    if (gl.getError() !== gl.NO_ERROR) {
      clearGlErrors(gl);
      this.surfaceResourceFailed = true;
      this.surfaceFallback = "surface-draw";
      this.triangleCount = 0;
      return false;
    }
    return true;
  }

  private resetBoundaryDetailFade(): void {
    this.boundaryDetailTierVisible = false;
    this.boundaryDetailFadeProgress = 0;
    this.boundaryDetailFadeUpdatedAt = null;
  }

  private updateBoundaryDetailFade(now: number): number {
    if (this.boundaryDetail !== "active") {
      this.resetBoundaryDetailFade();
      return 1;
    }

    if (this.boundaryDetailTierVisible) {
      if (this.camera.distance >= BOUNDARY_DETAIL_HIDE_DISTANCE) {
        this.boundaryDetailTierVisible = false;
      }
    } else if (this.camera.distance <= BOUNDARY_DETAIL_SHOW_DISTANCE) {
      this.boundaryDetailTierVisible = true;
    }

    const previousUpdate = this.boundaryDetailFadeUpdatedAt;
    this.boundaryDetailFadeUpdatedAt = now;
    if (previousUpdate !== null) {
      const fadeStep = Math.max(0, now - previousUpdate) /
        BOUNDARY_DETAIL_FADE_MS;
      this.boundaryDetailFadeProgress = this.boundaryDetailTierVisible
        ? Math.min(1, this.boundaryDetailFadeProgress + fadeStep)
        : Math.max(0, this.boundaryDetailFadeProgress - fadeStep);
    }

    const progress = this.boundaryDetailFadeProgress;
    return progress * progress * (3 - 2 * progress);
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
    if (this.surface) releaseSurfaceResources(gl, this.surface);
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
    if (!texture || !fbo) {
      if (texture) gl.deleteTexture(texture);
      if (fbo) gl.deleteFramebuffer(fbo);
      return false;
    }
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
    let depth: WebGLRenderbuffer | null = gl.createRenderbuffer();
    if (depth) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.RENDERBUFFER,
        depth,
      );
    }
    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE && depth) {
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.RENDERBUFFER,
        null,
      );
      gl.deleteRenderbuffer(depth);
      depth = null;
      status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(texture);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return false;
    }
    this.accumulationTexture = texture;
    this.accumulationFbo = fbo;
    this.accumulationDepth = depth;
    this.targetWidth = width;
    this.targetHeight = height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  private releaseAccumulationTarget(): void {
    if (this.accumulationTexture) this.gl.deleteTexture(this.accumulationTexture);
    if (this.accumulationFbo) this.gl.deleteFramebuffer(this.accumulationFbo);
    if (this.accumulationDepth) this.gl.deleteRenderbuffer(this.accumulationDepth);
    this.accumulationTexture = null;
    this.accumulationFbo = null;
    this.accumulationDepth = null;
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

function surfaceGridSizeFor(cellCount: number): number {
  if (cellCount <= PERFORMANCE_CELL_CEILING) return SURFACE_GRID_SIZES.performance;
  if (cellCount <= BALANCED_CELL_CEILING) return SURFACE_GRID_SIZES.balanced;
  if (cellCount <= HIGH_CELL_CEILING) return SURFACE_GRID_SIZES.high;
  if (cellCount <= ULTRA_CELL_CEILING) return SURFACE_GRID_SIZES.ultra;
  return SURFACE_GRID_SIZES.extreme;
}

function gridCoordinate(
  min: number,
  max: number,
  gridIndex: number,
  gridSize: number,
): number {
  return min + ((gridIndex + 0.5) / Math.max(1, gridSize)) * (max - min);
}

function createSurfaceResources(
  gl: WebGL2RenderingContext,
): SurfaceResources | null {
  let program: WebGLProgram | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let positionBuffer: WebGLBuffer | null = null;
  let normalBuffer: WebGLBuffer | null = null;
  let periodBuffer: WebGLBuffer | null = null;
  let interiorBuffer: WebGLBuffer | null = null;
  let boundaryBuffer: WebGLBuffer | null = null;
  let rankBuffer: WebGLBuffer | null = null;
  let edgeFadeBuffer: WebGLBuffer | null = null;
  let dissolveBuffer: WebGLBuffer | null = null;
  let indexBuffer: WebGLBuffer | null = null;
  try {
    program = createProgram(gl, SURFACE_VERTEX_SHADER, SURFACE_FRAGMENT_SHADER);
    vao = requireResource(gl.createVertexArray(), "orbit3d surface VAO");
    positionBuffer = requireResource(
      gl.createBuffer(),
      "orbit3d surface position buffer",
    );
    normalBuffer = requireResource(
      gl.createBuffer(),
      "orbit3d surface normal buffer",
    );
    periodBuffer = requireResource(gl.createBuffer(), "orbit3d surface period buffer");
    interiorBuffer = requireResource(
      gl.createBuffer(),
      "orbit3d surface interior buffer",
    );
    boundaryBuffer = requireResource(
      gl.createBuffer(),
      "orbit3d surface boundary buffer",
    );
    rankBuffer = requireResource(gl.createBuffer(), "orbit3d surface rank buffer");
    edgeFadeBuffer = requireResource(
      gl.createBuffer(),
      "orbit3d surface edge-fade buffer",
    );
    dissolveBuffer = requireResource(
      gl.createBuffer(),
      "orbit3d surface dissolve buffer",
    );
    indexBuffer = requireResource(gl.createBuffer(), "orbit3d surface index buffer");

    gl.bindVertexArray(vao);
    bindSurfaceAttribute("a_position", positionBuffer, 3);
    bindSurfaceAttribute("a_normal", normalBuffer, 3);
    bindSurfaceAttribute("a_period", periodBuffer, 1);
    bindSurfaceAttribute("a_interior", interiorBuffer, 1);
    bindSurfaceAttribute("a_boundary", boundaryBuffer, 1);
    bindSurfaceAttribute("a_rank", rankBuffer, 1);
    bindSurfaceAttribute("a_edgeFade", edgeFadeBuffer, 1);
    bindSurfaceAttribute("a_dissolve", dissolveBuffer, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bindVertexArray(null);

    const uniform = (name: string): WebGLUniformLocation =>
      requireResource(
        gl.getUniformLocation(program as WebGLProgram, name),
        `orbit3d surface ${name} uniform`,
      );
    const resources: SurfaceResources = {
      program,
      vao,
      positionBuffer,
      normalBuffer,
      periodBuffer,
      interiorBuffer,
      boundaryBuffer,
      rankBuffer,
      edgeFadeBuffer,
      dissolveBuffer,
      indexBuffer,
      viewProjectionUniform: uniform("u_viewProjection"),
      gridSizeUniform: uniform("u_gridSize"),
      colourModeUniform: uniform("u_colourMode"),
      paletteUniform: uniform("u_palette"),
      phaseUniform: uniform("u_phase"),
      paletteReverseUniform: uniform("u_paletteReverse"),
      visibleIterationsUniform: uniform("u_visibleIterations"),
      markerReUniform: uniform("u_markerRe"),
      fanActiveUniform: uniform("u_fanActive"),
      cameraPositionUniform: uniform("u_cameraPosition"),
      opacityUniform: uniform("u_opacity"),
      opaqueModeUniform: uniform("u_opaqueMode"),
      diagnosticModeUniform: uniform("u_diagnosticMode"),
    };
    gl.useProgram(program);
    gl.uniform1i(resources.paletteUniform, 3);
    return resources;
  } catch {
    if (vao) gl.deleteVertexArray(vao);
    if (positionBuffer) gl.deleteBuffer(positionBuffer);
    if (normalBuffer) gl.deleteBuffer(normalBuffer);
    if (periodBuffer) gl.deleteBuffer(periodBuffer);
    if (interiorBuffer) gl.deleteBuffer(interiorBuffer);
    if (boundaryBuffer) gl.deleteBuffer(boundaryBuffer);
    if (rankBuffer) gl.deleteBuffer(rankBuffer);
    if (edgeFadeBuffer) gl.deleteBuffer(edgeFadeBuffer);
    if (dissolveBuffer) gl.deleteBuffer(dissolveBuffer);
    if (indexBuffer) gl.deleteBuffer(indexBuffer);
    if (program) gl.deleteProgram(program);
    gl.bindVertexArray(null);
    clearGlErrors(gl);
    return null;
  }

  function bindSurfaceAttribute(
    name: string,
    buffer: WebGLBuffer,
    size: number,
  ): void {
    const location = gl.getAttribLocation(program as WebGLProgram, name);
    if (location < 0) throw new Error(`Unable to locate orbit3d surface ${name}.`);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }
}

function releaseSurfaceResources(
  gl: WebGL2RenderingContext,
  surface: SurfaceResources,
): void {
  gl.deleteVertexArray(surface.vao);
  gl.deleteBuffer(surface.positionBuffer);
  gl.deleteBuffer(surface.normalBuffer);
  gl.deleteBuffer(surface.periodBuffer);
  gl.deleteBuffer(surface.interiorBuffer);
  gl.deleteBuffer(surface.boundaryBuffer);
  gl.deleteBuffer(surface.rankBuffer);
  gl.deleteBuffer(surface.edgeFadeBuffer);
  gl.deleteBuffer(surface.dissolveBuffer);
  gl.deleteBuffer(surface.indexBuffer);
  gl.deleteProgram(surface.program);
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
