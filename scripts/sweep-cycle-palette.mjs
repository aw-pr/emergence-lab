#!/usr/bin/env node
/**
 * Offline palette sweep for logistic-Mandelbrot Cycle mode.
 *
 * Scores candidate ramps exactly as the renderer's 256-texel palette texture
 * sees them (gamma and contrast applied through colormap's `adjust`), then
 * ranks them on a transparent proxy for "legible bands, not garish":
 *
 *   - seam:    OKLab distance across the wrap (texel 255 -> texel 0). Cycle
 *              mode samples the texture with fract(), so a non-cyclic ramp
 *              produces one hard edge per lap; this is the edge the operator
 *              wants to see the bands sweep from.
 *   - bands:   just-noticeable steps per lap (cumulative OKLab distance / 10).
 *   - hueSpan: chroma-weighted hue travel across the lap, in degrees.
 *   - plateau: share of texels sitting on the floor or ceiling colour. High
 *              contrast clips most of the lap flat; beyond ~45% the ramp reads
 *              as two tones with a fringe (the current amber look).
 *   - chroma / neon: mean OKLab chroma and the share of bright, saturated
 *              texels. Acid-house palettes score high here and are penalised.
 *
 * Usage: node scripts/sweep-cycle-palette.mjs [outDir]
 * Writes report.md, ranked.json and contact-sheet.png under
 * e2e/artifacts/logistic-mandelbrot-palette/ (git-ignored) by default.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { resolve } from "node:path";
import { buildMapper, COLOUR_PRESETS } from "../src/app/colormap.ts";

const OUT = resolve(process.argv[2] ?? "e2e/artifacts/logistic-mandelbrot-palette");
const TEXELS = 256;
const JND = 10;

// ---------------------------------------------------------------- colour math

function srgbToLinear(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(x) {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function rgbToOklab([r8, g8, b8]) {
  const r = srgbToLinear(r8);
  const g = srgbToLinear(g8);
  const b = srgbToLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  return oklabToRgb([L, C * Math.cos(h), C * Math.sin(h)]);
}

function deltaE(p, q) {
  // OKLab distances scaled ×100 so a JND is roughly 1-2 units.
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

// ------------------------------------------------------- palette construction

/** Mirrors colormap.ts adjust(): gamma lift then contrast about mid-grey. */
function adjust(value, gamma, contrast) {
  const corrected = Math.pow(Math.max(0, Math.min(1, value)), 1 / gamma);
  return Math.max(0, Math.min(1, (corrected - 0.5) * contrast + 0.5));
}

/** Mirrors colormap.ts rampColour(): piecewise-linear sRGB between stops. */
function rampColour(stops, t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i += 1) {
    const [rightAt, right] = stops[i];
    const [leftAt, left] = stops[i - 1];
    if (x <= rightAt) {
      const k = (x - leftAt) / (rightAt - leftAt || 1);
      return [0, 1, 2].map((c) => Math.round(left[c] + (right[c] - left[c]) * k));
    }
  }
  return stops[stops.length - 1][1];
}

function textureFromStops(stops, gamma, contrast) {
  const texels = [];
  for (let i = 0; i < TEXELS; i += 1) {
    texels.push(rampColour(stops, adjust(i / (TEXELS - 1), gamma, contrast)));
  }
  return texels;
}

function textureFromPreset(preset, gamma, contrast) {
  const mapper = buildMapper(1, [[0, 1]], {
    preset,
    invert: false,
    gamma,
    contrast,
    paletteCycleReverse: false,
    steps: 0,
  });
  const sample = new Float32Array(1);
  const texels = [];
  for (let i = 0; i < TEXELS; i += 1) {
    sample[0] = i / (TEXELS - 1);
    texels.push(mapper(sample, 0));
  }
  return texels;
}

// --------------------------------------------------------------------- metrics

/**
 * Gaussian preference centred on the target range [lo, hi]: 1 at the centre,
 * about 0.6 at either edge, falling away beyond. A flat plateau inside the
 * range left dozens of candidates tied at 1.0 with nothing to order them.
 */
function pref(x, lo, hi) {
  const centre = (lo + hi) / 2;
  const sigma = (hi - lo) / 2;
  const z = (x - centre) / sigma;
  return Math.exp(-0.5 * z * z);
}

function metrics(texels) {
  const lab = texels.map(rgbToOklab);
  const seam = deltaE(lab[TEXELS - 1], lab[0]);
  let cumulative = 0;
  let maxStep = 0;
  for (let i = 1; i < TEXELS; i += 1) {
    const d = deltaE(lab[i - 1], lab[i]);
    cumulative += d;
    if (d > maxStep) maxStep = d;
  }
  const bands = cumulative / JND;

  const floor = lab[0];
  const ceiling = lab[TEXELS - 1];
  let plateau = 0;
  let hueSpan = 0;
  let chromaSum = 0;
  let chromaMax = 0;
  let neon = 0;
  let previousHue = null;
  for (let i = 0; i < TEXELS; i += 1) {
    const [L, a, b] = lab[i];
    if (deltaE(lab[i], floor) < 1 || deltaE(lab[i], ceiling) < 1) plateau += 1;
    const C = Math.hypot(a, b);
    chromaSum += C;
    if (C > chromaMax) chromaMax = C;
    if (C > 0.16 && L > 0.7) neon += 1;
    if (C > 0.04) {
      const hue = (Math.atan2(b, a) * 180) / Math.PI;
      if (previousHue !== null) {
        let dh = Math.abs(hue - previousHue);
        if (dh > 180) dh = 360 - dh;
        hueSpan += dh * Math.min(1, C / 0.1);
      }
      previousHue = hue;
    } else {
      previousHue = null;
    }
  }
  plateau /= TEXELS;
  neon /= TEXELS;
  const chromaMean = chromaSum / TEXELS;

  // Preference ranges rather than monotone rewards: the brief is "sharp
  // edges but not garish, bands clearly differentiated but not a rainbow",
  // and a monotone term saturates on the extreme it rewards (a 180 degree
  // hue arc at minimum contrast maxed every clamped term in the first pass).
  const seamPref = pref(seam, 60, 100);
  const bandsPref = pref(bands, 7, 12);
  const huePref = pref(hueSpan, 60, 150);
  const plateauPref = pref(plateau, 0.15, 0.4);
  const chromaPref = pref(chromaMean, 0.07, 0.11);
  const neonPref = 1 - Math.min(1, neon / 0.15);
  const legibility = seamPref ** 0.3 * huePref ** 0.3 * bandsPref ** 0.2 * plateauPref ** 0.2;
  const garish = 1 - chromaPref ** 0.5 * neonPref ** 0.5;
  const score = legibility * (1 - garish);
  return { score, legibility, garish, seam, bands, hueSpan, plateau, chromaMean, chromaMax, neon };
}

// ------------------------------------------------------------------ the family

/**
 * "Seam ramp" family: five OKLCH stops from a dark floor to a bright ceiling.
 * The ceiling is either cream (high L, near-grey, the shipped amber's shape)
 * or saturated (lower L, held chroma) so additive sheet stacking keeps hue.
 */
function seamRamp({ h0, arc, chroma, ceiling }) {
  const [topL, topC] = ceiling === "cream" ? [0.95, 0.04] : [0.85, 0.08];
  const lights = [0.1, 0.3, 0.5, 0.7, topL];
  // Chroma humps through the middle of the ramp and thins at both ends so the
  // floor stays near-black and the ceiling never reads neon.
  const chromas = [0.02, chroma * 0.8, chroma, chroma * 0.85, topC];
  return lights.map((L, i) => [i / 4, oklchToRgb(L, chromas[i], h0 + (arc * i) / 4)]);
}

const HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const ARCS = [-150, -100, -50, 0, 50, 100, 150];
const CHROMAS = [0.06, 0.09, 0.12, 0.15];
const CEILINGS = ["cream", "saturated"];
const GAMMAS = [1.2, 1.65];
const CONTRASTS = [1.4, 1.8, 2.4];

const candidates = [];
for (const h0 of HUES) {
  for (const arc of ARCS) {
    for (const chroma of CHROMAS) {
      for (const ceiling of CEILINGS) {
        const stops = seamRamp({ h0, arc, chroma, ceiling });
        for (const gamma of GAMMAS) {
          for (const contrast of CONTRASTS) {
            candidates.push({
              id: `h${h0}_a${arc}_c${chroma}_${ceiling}_g${gamma}_k${contrast}`,
              kind: "family",
              params: { h0, arc, chroma, ceiling, gamma, contrast },
              stops,
              texels: textureFromStops(stops, gamma, contrast),
            });
          }
        }
      }
    }
  }
}

const RAMP_PRESETS = COLOUR_PRESETS.map((p) => p.value).filter(
  (p) => !["sand", "chemical", "lyapunov", "rgb"].includes(p),
);
const references = [];
for (const preset of RAMP_PRESETS) {
  for (const gamma of GAMMAS) {
    for (const contrast of CONTRASTS) {
      references.push({
        id: `${preset}_g${gamma}_k${contrast}`,
        kind: "reference",
        params: { preset, gamma, contrast },
        texels: textureFromPreset(preset, gamma, contrast),
      });
    }
  }
}
references.push({
  id: "amber_shipped_g1.65_k2.4",
  kind: "reference",
  params: { preset: "amber", gamma: 1.65, contrast: 2.4 },
  texels: textureFromPreset("amber", 1.65, 2.4),
});

for (const entry of [...candidates, ...references]) entry.metrics = metrics(entry.texels);
candidates.sort((a, b) => b.metrics.score - a.metrics.score);
references.sort((a, b) => b.metrics.score - a.metrics.score);

// --------------------------------------------------------------------- output

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), out.length - 4);
  return out;
}

function encodeRgbPng(pixels, width, height) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  let p = 0;
  for (let y = 0; y < height; y += 1) {
    raw[p++] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      raw[p++] = pixels[i];
      raw[p++] = pixels[i + 1];
      raw[p++] = pixels[i + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Rows of palette strips, each strip drawn twice so the wrap seam is visible. */
function contactSheet(entries, stripHeight = 18, gap = 4) {
  const width = TEXELS * 2;
  const height = entries.length * (stripHeight + gap);
  const pixels = new Uint8Array(width * height * 3);
  entries.forEach((entry, row) => {
    for (let y = 0; y < stripHeight; y += 1) {
      const py = row * (stripHeight + gap) + y;
      for (let x = 0; x < width; x += 1) {
        const [r, g, b] = entry.texels[x % TEXELS];
        const i = (py * width + x) * 3;
        pixels[i] = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
      }
    }
  });
  return encodeRgbPng(pixels, width, height);
}

function fmt(n, dp = 2) {
  return Number(n).toFixed(dp);
}

function table(entries, paramKeys) {
  const head =
    "| # | id | " + paramKeys.join(" | ") +
    " | score | seam | bands | hueSpan | plateau | chroma | neon |\n|" +
    "---|".repeat(paramKeys.length + 9);
  const rows = entries.map((e, i) => {
    const m = e.metrics;
    const params = paramKeys.map((k) => e.params[k]).join(" | ");
    return `| ${i + 1} | ${e.id} | ${params} | **${fmt(m.score, 3)}** | ${fmt(m.seam, 1)} | ${fmt(m.bands, 1)} | ${fmt(m.hueSpan, 0)} | ${fmt(m.plateau)} | ${fmt(m.chromaMean, 3)} | ${fmt(m.neon)} |`;
  });
  return `${head}\n${rows.join("\n")}`;
}

// De-duplicate the family ranking by ramp so the top table shows distinct
// palettes rather than one ramp at six gamma/contrast settings.
const seenRamps = new Set();
const distinctTop = [];
for (const c of candidates) {
  const rampKey = `${c.params.h0}_${c.params.arc}_${c.params.chroma}_${c.params.ceiling}`;
  if (seenRamps.has(rampKey)) continue;
  seenRamps.add(rampKey);
  distinctTop.push(c);
  if (distinctTop.length === 24) break;
}

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "contact-sheet.png"), contactSheet(distinctTop));
writeFileSync(resolve(OUT, "references.png"), contactSheet(references.slice(0, 24)));
writeFileSync(
  resolve(OUT, "ranked.json"),
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      family: { hues: HUES, arcs: ARCS, chromas: CHROMAS, ceilings: CEILINGS, gammas: GAMMAS, contrasts: CONTRASTS },
      evaluated: candidates.length + references.length,
      top: distinctTop.map(({ texels, ...rest }) => rest),
      references: references.map(({ texels, ...rest }) => rest),
    },
    null,
    2,
  ),
);

const shipped = references.find((r) => r.id === "amber_shipped_g1.65_k2.4");
const report = `# Cycle palette sweep — ${new Date().toISOString().slice(0, 10)}

Family: ${HUES.length} hues × ${ARCS.length} arcs × ${CHROMAS.length} chromas × ${CEILINGS.length} ceilings = ${HUES.length * ARCS.length * CHROMAS.length * CEILINGS.length} ramps, each at ${GAMMAS.length} gammas × ${CONTRASTS.length} contrasts (${candidates.length} textures). References: ${RAMP_PRESETS.length} shipped ramp presets at the same settings plus the shipped amber default (${references.length} textures). Total evaluated: ${candidates.length + references.length}.

Each metric is turned into a preference in [0, 1] that is 1 at the centre of a target range, about 0.6 at its edges and falls away beyond (seam 60–100, bands 7–12 per lap, hue span 60–150°, plateau 15–40%, mean chroma 0.07–0.11, neon share 0 → 15%), and score = seam^0.3 · hue^0.3 · bands^0.2 · plateau^0.2 · chroma^0.5 · neon^0.5, so a candidate has to be acceptable on every axis at once. The number ranks candidates for a human to look at; it does not choose.

Shipped default (amber, gamma 1.65, contrast 2.4): score **${fmt(shipped.metrics.score, 3)}**, seam ${fmt(shipped.metrics.seam, 1)}, bands ${fmt(shipped.metrics.bands, 1)}, hueSpan ${fmt(shipped.metrics.hueSpan, 0)}, plateau ${fmt(shipped.metrics.plateau)}, chroma ${fmt(shipped.metrics.chromaMean, 3)}.

## Top 24 distinct family ramps (best gamma/contrast for each)

Rows match \`contact-sheet.png\` top to bottom; each strip is drawn twice so the wrap seam sits mid-strip.

${table(distinctTop, ["h0", "arc", "chroma", "ceiling", "gamma", "contrast"])}

## Shipped presets, ranked

Rows match \`references.png\`.

${table(references.slice(0, 24), ["preset", "gamma", "contrast"])}
`;
writeFileSync(resolve(OUT, "report.md"), report);
console.log(`evaluated ${candidates.length + references.length}; wrote ${OUT}/report.md`);
console.log(`shipped amber score ${fmt(shipped.metrics.score, 3)}; best family ${distinctTop[0].id} ${fmt(distinctTop[0].metrics.score, 3)}; best reference ${references[0].id} ${fmt(references[0].metrics.score, 3)}`);
