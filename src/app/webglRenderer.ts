import {
  buildMapper,
  isCyclic,
  type ColourMapOptions,
  type ColourPreset,
} from "./colormap.ts";
import {
  containRect,
  type DisplayOptions,
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
uniform bool u_paletteCyclic;
uniform int u_steps;
uniform int u_dotRadius;
uniform bool u_smoothSampling;
uniform float u_palettePhase;
uniform bool u_boidsGlyph;
uniform float u_boidsGlyphRadius;
uniform vec2 u_boidsMeanDir;
uniform bool u_trailMode;
uniform bool u_streamerMode;
uniform float u_streamerWidth;

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

  if (preset == 9) {
    if (x <= 0.25) return mixRgb(vec3(0.0, 0.0, 4.0), vec3(80.0, 18.0, 123.0), x / 0.25) / 255.0;
    if (x <= 0.5) return mixRgb(vec3(80.0, 18.0, 123.0), vec3(182.0, 54.0, 121.0), (x - 0.25) / 0.25) / 255.0;
    if (x <= 0.75) return mixRgb(vec3(182.0, 54.0, 121.0), vec3(251.0, 136.0, 97.0), (x - 0.5) / 0.25) / 255.0;
    return mixRgb(vec3(251.0, 136.0, 97.0), vec3(252.0, 253.0, 191.0), (x - 0.75) / 0.25) / 255.0;
  }

  if (preset == 10) {
    if (x <= 0.14) return mixRgb(vec3(48.0, 18.0, 59.0), vec3(50.0, 100.0, 220.0), x / 0.14) / 255.0;
    if (x <= 0.29) return mixRgb(vec3(50.0, 100.0, 220.0), vec3(30.0, 175.0, 235.0), (x - 0.14) / 0.15) / 255.0;
    if (x <= 0.43) return mixRgb(vec3(30.0, 175.0, 235.0), vec3(40.0, 220.0, 160.0), (x - 0.29) / 0.14) / 255.0;
    if (x <= 0.57) return mixRgb(vec3(40.0, 220.0, 160.0), vec3(140.0, 230.0, 70.0), (x - 0.43) / 0.14) / 255.0;
    if (x <= 0.71) return mixRgb(vec3(140.0, 230.0, 70.0), vec3(240.0, 200.0, 50.0), (x - 0.57) / 0.14) / 255.0;
    if (x <= 0.86) return mixRgb(vec3(240.0, 200.0, 50.0), vec3(240.0, 110.0, 40.0), (x - 0.71) / 0.15) / 255.0;
    return mixRgb(vec3(240.0, 110.0, 40.0), vec3(140.0, 20.0, 20.0), (x - 0.86) / 0.14) / 255.0;
  }

  if (preset == 11) {
    if (x <= 0.25) return mixRgb(vec3(226.0, 217.0, 226.0), vec3(65.0, 110.0, 175.0), x / 0.25) / 255.0;
    if (x <= 0.5) return mixRgb(vec3(65.0, 110.0, 175.0), vec3(30.0, 20.0, 55.0), (x - 0.25) / 0.25) / 255.0;
    if (x <= 0.75) return mixRgb(vec3(30.0, 20.0, 55.0), vec3(150.0, 70.0, 90.0), (x - 0.5) / 0.25) / 255.0;
    return mixRgb(vec3(150.0, 70.0, 90.0), vec3(226.0, 217.0, 226.0), (x - 0.75) / 0.25) / 255.0;
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

float streamerSignal(vec2 uv) {
  return normalise(sampleChannels(uv).r, u_ranges[0]);
}

float quantise(float t) {
  if (u_steps <= 0) return t;
  if (u_steps == 1) return 0.0;
  float n = float(u_steps);
  return clamp01(floor(clamp01(t) * n) / (n - 1.0));
}

vec3 singleChannelColour(float t) {
  float base = quantise(clamp01(t));
  float shifted;
  if (u_palettePhase == 0.0) {
    shifted = base;
  } else if (u_paletteCyclic) {
    // Cyclic ramp (matching endpoints): a modular phase offset tiles with no
    // seam, so the whole field can rotate through the palette continuously.
    shifted = fract(base + u_palettePhase);
  } else if (base <= 0.001 || base >= 0.999) {
    // Non-cyclic ramp: pin the extremes so the hard seam at the wrap point
    // stays parked in the background instead of sweeping across the image.
    shifted = base;
  } else {
    shifted = fract(base + u_palettePhase);
  }
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
    float glyphMix = min(coverage * 0.92, 1.0);
    if (u_trailMode) {
      // Trail accumulation: emit only the glyph with coverage alpha so the
      // faded previous frame shows through everywhere else.
      outColor = vec4(dotColour, glyphMix);
    } else {
      outColor = vec4(mix(bg, dotColour, glyphMix), 1.0);
    }
    return;
  }

  if (u_streamerMode) {
    vec2 texel = 1.0 / u_sourceSize;
    float radius = clamp(u_streamerWidth, 0.75, 4.0);
    vec2 nearX = vec2(texel.x * radius, 0.0);
    vec2 nearY = vec2(0.0, texel.y * radius);
    vec2 diagonal = vec2(texel.x, texel.y) * radius * 0.72;
    float centre = streamerSignal(v_uv);
    float cardinalAverage = (
      streamerSignal(v_uv + nearX) +
      streamerSignal(v_uv - nearX) +
      streamerSignal(v_uv + nearY) +
      streamerSignal(v_uv - nearY)
    ) * 0.25;
    float diagonalAverage = (
      streamerSignal(v_uv + diagonal) +
      streamerSignal(v_uv - diagonal) +
      streamerSignal(v_uv + vec2(diagonal.x, -diagonal.y)) +
      streamerSignal(v_uv + vec2(-diagonal.x, diagonal.y))
    ) * 0.25;
    float innerSignal = centre * 0.46 + cardinalAverage * 0.34 + diagonalAverage * 0.2;
    vec2 farX = nearX * 2.1;
    vec2 farY = nearY * 2.1;
    float farAverage = (
      streamerSignal(v_uv + farX) +
      streamerSignal(v_uv - farX) +
      streamerSignal(v_uv + farY) +
      streamerSignal(v_uv - farY)
    ) * 0.25;

    float bodySignal = clamp01(innerSignal * 0.88 + farAverage * 0.12);
    float body = smoothstep(0.012, 0.3, bodySignal);
    float veil = smoothstep(0.004, 0.13, farAverage * 0.65 + bodySignal * 0.35);
    float hotCore = smoothstep(0.48, 0.88, bodySignal);
    float paletteValue = min(0.76, bodySignal * 0.9);
    vec3 silk = colourFromRaw(vec4(paletteValue, 0.0, 0.0, 0.0));
    vec3 violetVeil = vec3(48.0, 8.0, 92.0) / 255.0;
    vec3 ember = vec3(255.0, 178.0, 72.0) / 255.0;
    vec3 colour = violetVeil * veil * 0.65;
    colour = mix(colour, silk, body * 0.94);
    colour += ember * hotCore * 0.22;
    outColor = vec4(colour, 1.0);
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
  float alpha = u_trailMode ? (signalAt(raw) > 0.02 ? 1.0 : 0.0) : 1.0;
  outColor = vec4(colourFromRaw(raw), alpha);
}
`;

const FRACTAL_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

uniform int u_kind;
uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_zoom;
uniform int u_maxIterations;
uniform vec2 u_juliaC;
uniform sampler2D u_palette;
uniform float u_modelPhase;
uniform float u_palettePhase;
uniform bool u_paletteReverse;
uniform bool u_paletteCyclic;

in vec2 v_uv;
out vec4 outColor;

const int MAX_ITERATIONS = 4096;

bool mandelbrotMainBody(vec2 c) {
  float x = c.x - 0.25;
  float q = x * x + c.y * c.y;
  if (q * (q + x) <= 0.25 * c.y * c.y) return true;
  vec2 bulb = c - vec2(-1.0, 0.0);
  return dot(bulb, bulb) <= 0.0625;
}

vec2 complexCoordinate() {
  vec2 pixel = v_uv * u_resolution - vec2(0.5);
  vec2 centrePixel = (u_resolution - vec2(1.0)) * 0.5;
  if (u_kind == 0) {
    float scale = 3.0 / (min(u_resolution.x, u_resolution.y) * u_zoom);
    return u_center + (pixel - centrePixel) * scale;
  }
  if (u_kind == 1) {
    float viewHeight = 3.0 / u_zoom;
    float viewWidth = viewHeight * (u_resolution.x / u_resolution.y);
    vec2 divisor = max(u_resolution - vec2(1.0), vec2(1.0));
    return u_center - vec2(viewWidth, viewHeight) * 0.5 +
      pixel / divisor * vec2(viewWidth, viewHeight);
  }
  float viewWidth = 3.4 / u_zoom;
  float viewHeight = viewWidth * (u_resolution.y / u_resolution.x);
  vec2 divisor = max(u_resolution - vec2(1.0), vec2(1.0));
  return u_center + (pixel / divisor - vec2(0.5)) * vec2(viewWidth, viewHeight);
}

float escapeValue(vec2 point) {
  if (u_kind == 0 && mandelbrotMainBody(point)) return 0.0;

  vec2 z = u_kind == 1 ? point : vec2(0.0);
  float magnitudeSquared = dot(z, z);
  int escapedAt = -1;
  for (int iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    if (iteration >= u_maxIterations) break;
    if (u_kind != 2 && magnitudeSquared > 4.0) {
      escapedAt = iteration;
      break;
    }

    vec2 source = u_kind == 2 ? abs(z) : z;
    vec2 constant = u_kind == 1 ? u_juliaC : point;
    z = vec2(
      source.x * source.x - source.y * source.y,
      2.0 * source.x * source.y
    ) + constant;
    magnitudeSquared = dot(z, z);
    if (u_kind == 2 && magnitudeSquared > 4.0) {
      escapedAt = iteration;
      break;
    }
  }

  if (escapedAt < 0) return 0.0;
  float magnitude = sqrt(max(magnitudeSquared, 4.000001));
  float smoothValue = float(escapedAt) + 1.0 - log2(max(log2(magnitude), 0.000001));
  return clamp(smoothValue / float(max(u_maxIterations, 1)), 0.0, 1.0);
}

void main() {
  float value = escapeValue(complexCoordinate());
  if (value > 0.001) value = fract(value + u_modelPhase);
  if (u_paletteReverse) value = 1.0 - value;
  float shifted = value;
  if (u_palettePhase != 0.0) {
    if (u_paletteCyclic) shifted = fract(value + u_palettePhase);
    else if (value > 0.001 && value < 0.999) shifted = fract(value + u_palettePhase);
  }
  vec3 colour = texture(u_palette, vec2(clamp(shifted, 0.0, 1.0), 0.5)).rgb;
  outColor = vec4(colour, 1.0);
}
`;

// Fade previous accumulation toward the background (u_mix < 1) or copy a
// texture verbatim (u_mix == 1). Shared by the trail fade and present passes.
const POST_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform float u_mix;
uniform vec3 u_bg;

in vec2 v_uv;
out vec4 outColor;

void main() {
  vec3 colour = texture(u_tex, v_uv).rgb;
  outColor = vec4(mix(u_bg, colour, u_mix), 1.0);
}
`;

// Bloom pass 1: keep only pixels brighter than the threshold (soft knee).
const BLOOM_EXTRACT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform float u_threshold;

in vec2 v_uv;
out vec4 outColor;

void main() {
  vec3 colour = texture(u_tex, v_uv).rgb;
  float luma = dot(colour, vec3(0.299, 0.587, 0.114));
  float weight = smoothstep(u_threshold, u_threshold + 0.25, luma);
  outColor = vec4(colour * weight, 1.0);
}
`;

// Bloom pass 2: separable 9-tap gaussian, run horizontally then vertically.
const BLOOM_BLUR_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform vec2 u_direction;

in vec2 v_uv;
out vec4 outColor;

void main() {
  float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec3 sum = texture(u_tex, v_uv).rgb * weights[0];
  for (int i = 1; i < 5; i += 1) {
    vec2 offset = u_direction * float(i);
    sum += texture(u_tex, v_uv + offset).rgb * weights[i];
    sum += texture(u_tex, v_uv - offset).rgb * weights[i];
  }
  outColor = vec4(sum, 1.0);
}
`;

// Bloom pass 3: additive composite of the scene and the blurred bright pass.
const BLOOM_COMPOSITE_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_intensity;

in vec2 v_uv;
out vec4 outColor;

void main() {
  vec3 scene = texture(u_scene, v_uv).rgb;
  vec3 bloom = texture(u_bloom, v_uv).rgb;
  outColor = vec4(scene + bloom * u_intensity, 1.0);
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
  paletteCyclic: WebGLUniformLocation;
  steps: WebGLUniformLocation;
  dotRadius: WebGLUniformLocation;
  smoothSampling: WebGLUniformLocation;
  palettePhase: WebGLUniformLocation;
  boidsGlyph: WebGLUniformLocation;
  boidsGlyphRadius: WebGLUniformLocation;
  boidsMeanDir: WebGLUniformLocation;
  trailMode: WebGLUniformLocation;
  streamerMode: WebGLUniformLocation;
  streamerWidth: WebGLUniformLocation;
}

interface PostUniformLocations {
  tex: WebGLUniformLocation;
  mix: WebGLUniformLocation;
  bg: WebGLUniformLocation;
}

interface FractalUniformLocations {
  kind: WebGLUniformLocation;
  resolution: WebGLUniformLocation;
  center: WebGLUniformLocation;
  zoom: WebGLUniformLocation;
  maxIterations: WebGLUniformLocation;
  juliaC: WebGLUniformLocation;
  modelPhase: WebGLUniformLocation;
  palettePhase: WebGLUniformLocation;
  paletteReverse: WebGLUniformLocation;
  paletteCyclic: WebGLUniformLocation;
}

export class WebGLRendererBackend implements RendererBackend {
  readonly kind = "webgl2" as const;
  readonly maxTextureSize: number;

  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly fractalProgram: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly fractalPaletteTexture: WebGLTexture;
  private readonly fractalPaletteData = new Uint8Array(256 * 4);
  private fractalPaletteKey = "";
  private readonly quadBuffer: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly fractalVao: WebGLVertexArrayObject;
  private readonly postProgram: WebGLProgram;
  private readonly postVao: WebGLVertexArrayObject;
  private readonly extractProgram: WebGLProgram;
  private readonly extractVao: WebGLVertexArrayObject;
  private readonly blurProgram: WebGLProgram;
  private readonly blurVao: WebGLVertexArrayObject;
  private readonly compositeProgram: WebGLProgram;
  private readonly compositeVao: WebGLVertexArrayObject;
  private readonly extractThreshold: WebGLUniformLocation;
  private readonly blurDirection: WebGLUniformLocation;
  private readonly compositeIntensity: WebGLUniformLocation;
  private readonly uniforms: UniformLocations;
  private readonly fractalUniforms: FractalUniformLocations;
  private readonly postUniforms: PostUniformLocations;
  private textureFormat: TextureFormat | null = null;
  private uploadBuffer: Float32Array | null = null;
  private textureWidth = 0;
  private textureHeight = 0;
  private gridWidth = 1;
  private gridHeight = 1;
  private displayWidth = 1;
  private displayHeight = 1;
  private trailTextures: [WebGLTexture, WebGLTexture] | null = null;
  private trailFbos: [WebGLFramebuffer, WebGLFramebuffer] | null = null;
  private trailWidth = 0;
  private trailHeight = 0;
  private trailIndex = 0;
  private sceneTexture: WebGLTexture | null = null;
  private sceneFbo: WebGLFramebuffer | null = null;
  private sceneWidth = 0;
  private sceneHeight = 0;
  private bloomTextures: [WebGLTexture, WebGLTexture] | null = null;
  private bloomFbos: [WebGLFramebuffer, WebGLFramebuffer] | null = null;
  private bloomWidth = 0;
  private bloomHeight = 0;

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
    this.fractalProgram = createProgram(gl, VERTEX_SHADER, FRACTAL_FRAGMENT_SHADER);
    this.postProgram = createProgram(gl, VERTEX_SHADER, POST_FRAGMENT_SHADER);
    this.texture = mustCreate(gl.createTexture(), "texture");
    this.fractalPaletteTexture = mustCreate(
      gl.createTexture(),
      "fractal palette texture",
    );
    this.quadBuffer = mustCreate(gl.createBuffer(), "quad buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    this.extractProgram = createProgram(gl, VERTEX_SHADER, BLOOM_EXTRACT_SHADER);
    this.blurProgram = createProgram(gl, VERTEX_SHADER, BLOOM_BLUR_SHADER);
    this.compositeProgram = createProgram(gl, VERTEX_SHADER, BLOOM_COMPOSITE_SHADER);
    this.vao = this.createQuadVao(this.program);
    this.fractalVao = this.createQuadVao(this.fractalProgram);
    this.postVao = this.createQuadVao(this.postProgram);
    this.extractVao = this.createQuadVao(this.extractProgram);
    this.blurVao = this.createQuadVao(this.blurProgram);
    this.compositeVao = this.createQuadVao(this.compositeProgram);
    this.uniforms = this.getUniformLocations();
    this.fractalUniforms = this.getFractalUniformLocations();
    this.postUniforms = this.getPostUniformLocations();
    this.extractThreshold = mustCreate(
      gl.getUniformLocation(this.extractProgram, "u_threshold"),
      "u_threshold uniform",
    );
    this.blurDirection = mustCreate(
      gl.getUniformLocation(this.blurProgram, "u_direction"),
      "u_direction uniform",
    );
    this.compositeIntensity = mustCreate(
      gl.getUniformLocation(this.compositeProgram, "u_intensity"),
      "u_intensity uniform",
    );

    // Sampler bindings are fixed: unit 0 = sim state, 1 = scene, 2 = bloom.
    gl.useProgram(this.extractProgram);
    gl.uniform1i(gl.getUniformLocation(this.extractProgram, "u_tex"), 1);
    gl.useProgram(this.blurProgram);
    gl.uniform1i(gl.getUniformLocation(this.blurProgram, "u_tex"), 1);
    gl.useProgram(this.compositeProgram);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, "u_scene"), 1);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, "u_bloom"), 2);

    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "u_state"), 0);
    gl.useProgram(this.fractalProgram);
    gl.uniform1i(gl.getUniformLocation(this.fractalProgram, "u_palette"), 3);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.fractalPaletteTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.fractalPaletteData,
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.clearColor(0, 0, 0, 1);
  }

  resizeDisplay(displayWidth: number, displayHeight: number): void {
    this.displayWidth = Math.max(1, Math.floor(displayWidth));
    this.displayHeight = Math.max(1, Math.floor(displayHeight));
  }

  supportsDirectRendering(
    mode: RenderMode,
    kernel: SimKernel,
    params: Record<string, number | boolean | string>,
  ): boolean {
    if (mode !== "fractal" || fractalKind(kernel) < 0) return false;
    // WebGL2 highp fragment arithmetic is normally 32-bit. Beyond this point
    // adjacent complex coordinates collapse together, so retain the CPU
    // double-precision kernel for very deep views.
    const zoom = numericParam(params, "zoom", 1);
    const pixelSpan = 3 / (Math.max(1, Math.min(this.displayWidth, this.displayHeight)) * zoom);
    return pixelSpan >= 1e-7;
  }

  setGrid(
    gridWidth: number,
    gridHeight: number,
    kernel: SimKernel,
    mode: RenderMode = "grid",
    params: Record<string, number | boolean | string> = {},
  ): void {
    this.gridWidth = Math.max(1, Math.floor(gridWidth));
    this.gridHeight = Math.max(1, Math.floor(gridHeight));
    if (this.supportsDirectRendering(mode, kernel, params)) return;
    this.configureTexture(kernel.channelCount);
  }

  draw(frame: RendererBackendFrame): void {
    const { state, kernel, colourOptions, displayOptions, mode } = frame;
    if (this.supportsDirectRendering(mode, kernel, frame.params)) {
      this.drawGpuFractal(frame);
      return;
    }
    delete (this.gl.canvas as HTMLCanvasElement).dataset.fractalRenderer;
    delete (this.gl.canvas as HTMLCanvasElement).dataset.fractalSupersample;
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
    const rect = containRect(
      this.displayWidth,
      this.displayHeight,
      this.gridWidth,
      this.gridHeight,
    );

    const trailFade = trailFadeFor(mode, displayOptions);
    const bloom = bloomIntensityFor(displayOptions);

    if (trailFade <= 0 && bloom <= 0) {
      // Clear the whole canvas to black, then draw the grid into a centred,
      // aspect-preserving rectangle (letterbox). clear() ignores the viewport,
      // so the bars stay black while the quad fills only the contain rect.
      gl.viewport(0, 0, this.displayWidth, this.displayHeight);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.viewport(rect.x, rect.y, rect.width, rect.height);
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
    }

    // Trails and/or bloom: render the scene into an offscreen texture first,
    // then present it (with the bloom post-pass when enabled).
    const sceneTexture =
      trailFade > 0
        ? this.renderTrailScene(rect, trailFade, backgroundFor(kernel))
        : this.renderPlainScene(rect);
    if (!sceneTexture) return;
    this.present(rect, sceneTexture, bloom);
  }

  private drawGpuFractal(frame: RendererBackendFrame): void {
    const rect = containRect(
      this.displayWidth,
      this.displayHeight,
      this.gridWidth,
      this.gridHeight,
    );
    const basePixels = Math.max(1, rect.width * rect.height);
    const qualityScale = Math.min(
      1,
      this.gridWidth / Math.max(1, this.displayWidth),
      this.gridHeight / Math.max(1, this.displayHeight),
    );
    const scale =
      qualityScale < 0.99
        ? Math.max(0.2, qualityScale)
        : Math.max(
            1,
            Math.min(
              1.5,
              this.maxTextureSize / Math.max(rect.width, rect.height),
              Math.sqrt(8_388_608 / basePixels),
            ),
          );
    const renderWidth = Math.max(1, Math.round(rect.width * scale));
    const renderHeight = Math.max(1, Math.round(rect.height * scale));
    this.ensureSceneTarget(renderWidth, renderHeight);
    if (!this.sceneTexture || !this.sceneFbo) return;

    const canvas = this.gl.canvas as HTMLCanvasElement;
    canvas.dataset.fractalRenderer = "gpu-fragment";
    canvas.dataset.fractalSupersample = scale.toFixed(2);

    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.viewport(0, 0, renderWidth, renderHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.setFractalUniforms(frame, renderWidth, renderHeight);
    gl.useProgram(this.fractalProgram);
    gl.bindVertexArray(this.fractalVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.present(
      rect,
      this.sceneTexture,
      bloomIntensityFor(frame.displayOptions),
    );
  }

  private setFractalUniforms(
    frame: RendererBackendFrame,
    width: number,
    height: number,
  ): void {
    const gl = this.gl;
    const kind = fractalKind(frame.kernel);
    const params = frame.params;
    const zoom = Math.max(0.25, numericParam(params, "zoom", 1));
    const fallbackCenterX = kind === 0 ? -0.5 : 0;
    const baseIterations = numericParam(
      params,
      "maxIterations",
      kind === 0 ? 128 : 180,
    );
    const maxIterations = fractalIterationLimit(
      baseIterations,
      zoom,
      params.autoIterations !== false,
    );

    this.updateFractalPalette(frame.colourOptions);
    gl.useProgram(this.fractalProgram);
    gl.uniform1i(this.fractalUniforms.kind, kind);
    gl.uniform2f(this.fractalUniforms.resolution, width, height);
    gl.uniform2f(
      this.fractalUniforms.center,
      numericParam(params, "centerX", fallbackCenterX),
      numericParam(params, "centerY", 0),
    );
    gl.uniform1f(this.fractalUniforms.zoom, zoom);
    gl.uniform1i(this.fractalUniforms.maxIterations, maxIterations);
    gl.uniform2f(
      this.fractalUniforms.juliaC,
      numericParam(params, "cRe", -0.74543),
      numericParam(params, "cIm", 0.11301),
    );
    gl.uniform1f(
      this.fractalUniforms.modelPhase,
      numericParam(params, "palettePhase", 0),
    );
    gl.uniform1f(
      this.fractalUniforms.palettePhase,
      palettePhase(
        params,
        frame.elapsedTime,
        frame.colourOptions,
        frame.speedScale,
      ),
    );
    gl.uniform1i(
      this.fractalUniforms.paletteReverse,
      frame.colourOptions.paletteCycleReverse ? 1 : 0,
    );
    gl.uniform1i(
      this.fractalUniforms.paletteCyclic,
      isCyclic(frame.colourOptions.preset) ? 1 : 0,
    );
  }

  private updateFractalPalette(options: ColourMapOptions): void {
    const key = [
      options.preset,
      options.invert ? 1 : 0,
      options.gamma,
      options.contrast,
      options.steps,
    ].join(":");
    if (key === this.fractalPaletteKey) return;
    this.fractalPaletteKey = key;
    const mapper = buildMapper(1, [[0, 1]], {
      ...options,
      paletteCycleReverse: false,
    });
    const sample = new Float32Array(1);
    for (let index = 0; index < 256; index += 1) {
      sample[0] = index / 255;
      const [r, g, b] = mapper(sample, 0);
      const offset = index * 4;
      this.fractalPaletteData[offset] = r;
      this.fractalPaletteData[offset + 1] = g;
      this.fractalPaletteData[offset + 2] = b;
      this.fractalPaletteData[offset + 3] = 255;
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.fractalPaletteTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      256,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.fractalPaletteData,
    );
  }

  /**
   * Accumulate-and-fade: previous frame is faded toward the background into
   * the write target, the current frame is alpha-blended on top (the main
   * shader emits per-fragment alpha in trail mode). Ping-pong avoids sampling
   * a texture while rendering into it. Returns the accumulated scene texture.
   */
  private renderTrailScene(
    rect: { x: number; y: number; width: number; height: number },
    fade: number,
    bg: [number, number, number],
  ): WebGLTexture | null {
    const gl = this.gl;
    this.ensureTrailTargets(rect.width, rect.height, bg);
    const textures = this.trailTextures;
    const fbos = this.trailFbos;
    if (!textures || !fbos) return null;

    const read = this.trailIndex;
    const write = 1 - this.trailIndex;

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[write]);
    gl.viewport(0, 0, this.trailWidth, this.trailHeight);
    gl.useProgram(this.postProgram);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures[read]);
    gl.uniform1i(this.postUniforms.tex, 1);
    gl.uniform1f(this.postUniforms.mix, fade);
    gl.uniform3f(this.postUniforms.bg, bg[0], bg[1], bg[2]);
    gl.bindVertexArray(this.postVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);

    this.trailIndex = write;
    return textures[write];
  }

  /** Render the main shader into the offscreen scene texture (bloom input). */
  private renderPlainScene(
    rect: { x: number; y: number; width: number; height: number },
  ): WebGLTexture | null {
    const gl = this.gl;
    this.ensureSceneTarget(rect.width, rect.height);
    if (!this.sceneTexture || !this.sceneFbo) return null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.viewport(0, 0, this.sceneWidth, this.sceneHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.sceneTexture;
  }

  /** Letterbox the scene texture onto the canvas, adding bloom when enabled. */
  private present(
    rect: { x: number; y: number; width: number; height: number },
    sceneTexture: WebGLTexture,
    bloom: number,
  ): void {
    const gl = this.gl;
    const bloomTexture =
      bloom > 0
        ? this.renderBloomTexture(sceneTexture, rect.width, rect.height)
        : null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.displayWidth, this.displayHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(rect.x, rect.y, rect.width, rect.height);

    if (bloomTexture) {
      gl.useProgram(this.compositeProgram);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, bloomTexture);
      gl.uniform1f(this.compositeIntensity, bloom);
      gl.bindVertexArray(this.compositeVao);
    } else {
      gl.useProgram(this.postProgram);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
      gl.uniform1i(this.postUniforms.tex, 1);
      gl.uniform1f(this.postUniforms.mix, 1);
      gl.bindVertexArray(this.postVao);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Threshold-extract the scene into a half-resolution target, then blur it
   * with a separable gaussian (horizontal, then vertical). Returns the
   * blurred bright-pass texture.
   */
  private renderBloomTexture(
    sceneTexture: WebGLTexture,
    sceneWidth: number,
    sceneHeight: number,
  ): WebGLTexture | null {
    const gl = this.gl;
    this.ensureBloomTargets(
      Math.max(1, Math.floor(sceneWidth / 2)),
      Math.max(1, Math.floor(sceneHeight / 2)),
    );
    const textures = this.bloomTextures;
    const fbos = this.bloomFbos;
    if (!textures || !fbos) return null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[0]);
    gl.viewport(0, 0, this.bloomWidth, this.bloomHeight);
    gl.useProgram(this.extractProgram);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.uniform1f(this.extractThreshold, 0.6);
    gl.bindVertexArray(this.extractVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.useProgram(this.blurProgram);
    gl.bindVertexArray(this.blurVao);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[1]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures[0]);
    gl.uniform2f(this.blurDirection, 1 / this.bloomWidth, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures[1]);
    gl.uniform2f(this.blurDirection, 0, 1 / this.bloomHeight);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return textures[0];
  }

  /** (Re)allocate the ping-pong accumulation targets; clears trails on resize. */
  private ensureTrailTargets(
    width: number,
    height: number,
    bg: [number, number, number],
  ): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (this.trailTextures && this.trailWidth === w && this.trailHeight === h) {
      return;
    }

    const gl = this.gl;
    this.releaseTrailTargets();
    this.trailWidth = w;
    this.trailHeight = h;

    const clearToBg = (fbo: WebGLFramebuffer): void => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    };

    const [texA, fboA] = this.createRenderTarget(w, h);
    const [texB, fboB] = this.createRenderTarget(w, h);
    clearToBg(fboA);
    clearToBg(fboB);
    this.trailTextures = [texA, texB];
    this.trailFbos = [fboA, fboB];
    this.trailIndex = 0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
  }

  /** (Re)allocate the offscreen scene target used as the bloom input. */
  private ensureSceneTarget(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (this.sceneTexture && this.sceneWidth === w && this.sceneHeight === h) {
      return;
    }

    this.releaseSceneTarget();
    const [texture, fbo] = this.createRenderTarget(w, h);
    this.sceneTexture = texture;
    this.sceneFbo = fbo;
    this.sceneWidth = w;
    this.sceneHeight = h;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  /** (Re)allocate the half-resolution bloom ping-pong targets. */
  private ensureBloomTargets(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (this.bloomTextures && this.bloomWidth === w && this.bloomHeight === h) {
      return;
    }

    this.releaseBloomTargets();
    const [texA, fboA] = this.createRenderTarget(w, h);
    const [texB, fboB] = this.createRenderTarget(w, h);
    this.bloomTextures = [texA, texB];
    this.bloomFbos = [fboA, fboB];
    this.bloomWidth = w;
    this.bloomHeight = h;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  private createRenderTarget(
    width: number,
    height: number,
  ): [WebGLTexture, WebGLFramebuffer] {
    const gl = this.gl;
    const texture = mustCreate(gl.createTexture(), "render target texture");
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    const fbo = mustCreate(gl.createFramebuffer(), "render target framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return [texture, fbo];
  }

  private releaseTrailTargets(): void {
    const gl = this.gl;
    if (this.trailTextures) {
      gl.deleteTexture(this.trailTextures[0]);
      gl.deleteTexture(this.trailTextures[1]);
      this.trailTextures = null;
    }
    if (this.trailFbos) {
      gl.deleteFramebuffer(this.trailFbos[0]);
      gl.deleteFramebuffer(this.trailFbos[1]);
      this.trailFbos = null;
    }
    this.trailWidth = 0;
    this.trailHeight = 0;
  }

  private releaseSceneTarget(): void {
    const gl = this.gl;
    if (this.sceneTexture) {
      gl.deleteTexture(this.sceneTexture);
      this.sceneTexture = null;
    }
    if (this.sceneFbo) {
      gl.deleteFramebuffer(this.sceneFbo);
      this.sceneFbo = null;
    }
    this.sceneWidth = 0;
    this.sceneHeight = 0;
  }

  private releaseBloomTargets(): void {
    const gl = this.gl;
    if (this.bloomTextures) {
      gl.deleteTexture(this.bloomTextures[0]);
      gl.deleteTexture(this.bloomTextures[1]);
      this.bloomTextures = null;
    }
    if (this.bloomFbos) {
      gl.deleteFramebuffer(this.bloomFbos[0]);
      gl.deleteFramebuffer(this.bloomFbos[1]);
      this.bloomFbos = null;
    }
    this.bloomWidth = 0;
    this.bloomHeight = 0;
  }

  destroy(): void {
    const gl = this.gl;
    this.releaseTrailTargets();
    this.releaseSceneTarget();
    this.releaseBloomTargets();
    gl.deleteTexture(this.texture);
    gl.deleteTexture(this.fractalPaletteTexture);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.fractalVao);
    gl.deleteVertexArray(this.postVao);
    gl.deleteVertexArray(this.extractVao);
    gl.deleteVertexArray(this.blurVao);
    gl.deleteVertexArray(this.compositeVao);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteProgram(this.program);
    gl.deleteProgram(this.fractalProgram);
    gl.deleteProgram(this.postProgram);
    gl.deleteProgram(this.extractProgram);
    gl.deleteProgram(this.blurProgram);
    gl.deleteProgram(this.compositeProgram);
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
      paletteCyclic: mustCreate(
        this.gl.getUniformLocation(this.program, "u_paletteCyclic"),
        "u_paletteCyclic uniform",
      ),
      steps: mustCreate(
        this.gl.getUniformLocation(this.program, "u_steps"),
        "u_steps uniform",
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
      trailMode: mustCreate(
        this.gl.getUniformLocation(this.program, "u_trailMode"),
        "u_trailMode uniform",
      ),
      streamerMode: mustCreate(
        this.gl.getUniformLocation(this.program, "u_streamerMode"),
        "u_streamerMode uniform",
      ),
      streamerWidth: mustCreate(
        this.gl.getUniformLocation(this.program, "u_streamerWidth"),
        "u_streamerWidth uniform",
      ),
    };
  }

  private getPostUniformLocations(): PostUniformLocations {
    return {
      tex: mustCreate(
        this.gl.getUniformLocation(this.postProgram, "u_tex"),
        "u_tex uniform",
      ),
      mix: mustCreate(
        this.gl.getUniformLocation(this.postProgram, "u_mix"),
        "u_mix uniform",
      ),
      bg: mustCreate(
        this.gl.getUniformLocation(this.postProgram, "u_bg"),
        "u_bg uniform",
      ),
    };
  }

  private getFractalUniformLocations(): FractalUniformLocations {
    const uniform = (name: string): WebGLUniformLocation =>
      mustCreate(
        this.gl.getUniformLocation(this.fractalProgram, name),
        `${name} uniform`,
      );
    return {
      kind: uniform("u_kind"),
      resolution: uniform("u_resolution"),
      center: uniform("u_center"),
      zoom: uniform("u_zoom"),
      maxIterations: uniform("u_maxIterations"),
      juliaC: uniform("u_juliaC"),
      modelPhase: uniform("u_modelPhase"),
      palettePhase: uniform("u_palettePhase"),
      paletteReverse: uniform("u_paletteReverse"),
      paletteCyclic: uniform("u_paletteCyclic"),
    };
  }

  private createQuadVao(program: WebGLProgram): WebGLVertexArrayObject {
    const gl = this.gl;
    const positionLocation = gl.getAttribLocation(program, "a_position");
    if (positionLocation < 0) {
      throw new Error("WebGL2 renderer could not locate a_position attribute.");
    }

    const vao = mustCreate(gl.createVertexArray(), "vertex array");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
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
    displayOptions: DisplayOptions,
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
    gl.uniform1i(this.uniforms.paletteCyclic, isCyclic(colourOptions.preset) ? 1 : 0);
    gl.uniform1i(this.uniforms.steps, Math.max(0, Math.floor(colourOptions.steps || 0)));
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
    gl.uniform1i(this.uniforms.trailMode, trailFadeFor(mode, displayOptions) > 0 ? 1 : 0);
    gl.uniform1i(this.uniforms.streamerMode, isAttractorState(kernel) ? 1 : 0);
    gl.uniform1f(this.uniforms.streamerWidth, numericParam(params, "ribbonWidth", 2.1));
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
    case "magma":
      return 9;
    case "turbo":
      return 10;
    case "twilight":
      return 11;
  }
}

function shouldSmoothSample(mode: RenderMode): boolean {
  return mode === "field" || mode === "smooth" || mode === "fractal";
}

/** Effective trail fade factor; trails apply to particle mode only. */
function trailFadeFor(mode: RenderMode, displayOptions: DisplayOptions): number {
  if (mode !== "particle") return 0;
  const fade = displayOptions.trailFade;
  if (typeof fade !== "number" || !Number.isFinite(fade) || fade <= 0) return 0;
  return Math.min(0.985, fade);
}

/** Effective bloom intensity, clamped to [0, 1]. 0 disables the post-pass. */
function bloomIntensityFor(displayOptions: DisplayOptions): number {
  const bloom = displayOptions.bloom;
  if (typeof bloom !== "number" || !Number.isFinite(bloom) || bloom <= 0) return 0;
  return Math.min(1, bloom);
}

/** Trail background: the boids glyph path paints its own dark blue; else black. */
function backgroundFor(kernel: SimKernel): [number, number, number] {
  if (isBoidsState(kernel)) {
    return [5 / 255, 8 / 255, 18 / 255];
  }
  return [0, 0, 0];
}

function isBoidsState(kernel: SimKernel): boolean {
  return (
    kernel.name === "Boids" &&
    kernel.channelCount >= 4 &&
    kernel.channelLabels[2] === "Velocity X" &&
    kernel.channelLabels[3] === "Velocity Y"
  );
}

function isAttractorState(kernel: SimKernel): boolean {
  return kernel.name === "Strange Attractor" && kernel.channelLabels[0] === "Density";
}

function numericParam(
  params: Record<string, number | boolean | string>,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function fractalKind(kernel: SimKernel): number {
  if (kernel.name === "Mandelbrot") return 0;
  if (kernel.name === "Julia Set") return 1;
  if (kernel.name === "Burning Ship") return 2;
  return -1;
}

function fractalIterationLimit(
  base: number,
  zoom: number,
  automatic: boolean,
): number {
  const boundedBase = Math.max(16, Math.min(2048, Math.round(base)));
  if (!automatic) return boundedBase;
  const boost = Math.floor(48 * Math.log2(Math.max(1, zoom)));
  return Math.min(4096, boundedBase + boost);
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
