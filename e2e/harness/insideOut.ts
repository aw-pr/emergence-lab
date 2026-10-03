/**
 * Test adapter for the Logistic-Mandelbrot Inside-out colour mode.
 *
 * Everything here drives production code: the sim page through its persisted
 * params and controls, the production orbit sampler and colour mapper imported
 * into the page, and the production shader sources linked against a
 * pass-through fragment stage so the palette lookup can be read back before
 * lighting. Nothing re-implements the mapping; the expected values come from
 * the pure oracle in src/app/orbitColour.ts, closed-form cycles and an
 * independent float64 orbit.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { spreadPaletteCoordinate } from "../../src/app/orbitColour.ts";
import { decodePng, toOklab, type DecodedImage } from "./frame.ts";

export const SLUG = "logistic-mandelbrot";
export const ARTIFACT_DIR = "e2e/artifacts/inside-out-spread";
/** Channels per texel of the renderer's attraction field (webglRenderer.ts). */
export const ATTRACTION_FIELD_CHANNELS = 4;
export const DEFAULT_CYCLE_BANDS = 1.5;
/** Ground plane orbit value (orbit3d MARKER_PLANE_ORBIT_VALUE). */
export const GROUND_PLANE_HEIGHT = -2.08;

export type Rgb = [number, number, number];
export type SimParams = Record<string, number | boolean | string>;

/** Camera parked, reveal and beam off, colour mode and speed as given. */
export function frozenParams(overrides: SimParams = {}): SimParams {
  return {
    autoRotate: false,
    continuousSpin: false,
    cascadeReveal: false,
    realAxisSweep: false,
    zoomGrowth: 0,
    boundaryDetail: 0,
    geometryMode: "cloud",
    colourMode: "inside-out",
    cycleSpeed: 0,
    ...overrides,
  };
}

export async function openSim(page: Page, params: SimParams, query = ""): Promise<Locator> {
  await page.addInitScript(
    ([slug, values]) => {
      localStorage.setItem(`el:values:${slug}`, JSON.stringify(values));
    },
    [SLUG, params] as const,
  );
  await page.goto(`/${query}#/${SLUG}`);
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-orbit3d");
  await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 120_000 });
  return canvas;
}

export function canvasDataset(canvas: Locator): Promise<Record<string, string>> {
  return canvas.evaluate((element) => ({ ...(element as HTMLCanvasElement).dataset }) as Record<string, string>);
}

export async function captureCanvas(canvas: Locator, path: string): Promise<DecodedImage> {
  return decodePng(await canvas.screenshot({ path }));
}

/** Drive a `[data-param-key]` control the way a user would. */
export async function setParam(page: Page, key: string, value: string | number | boolean): Promise<void> {
  await page.evaluate(
    ([key, value]) => {
      const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[data-param-key="${key}"]`,
      );
      if (!element) throw new Error(`no control for ${key}`);
      if (element instanceof HTMLInputElement && element.type === "checkbox") {
        element.checked = value === true;
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      element.value = String(value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    },
    [key, value] as const,
  );
}

/** Every `[data-param-key]` control's displayed value, keyed by param. */
export function paramSnapshot(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-param-key]"),
      ).map((el) => [
        el.dataset.paramKey ?? "",
        el instanceof HTMLInputElement && el.type === "checkbox" ? String(el.checked) : el.value,
      ]),
    ),
  );
}

export interface AttractionTexel {
  x: number;
  y: number;
  /** Actual texel-centre coordinate the field sampled. */
  re: number;
  im: number;
  centre: number;
  spread: number;
  classification: number;
  period: number;
}

export interface AttractionFieldSummary {
  width: number;
  height: number;
  centre: [number, number];
  span: [number, number];
  source: string;
  warmupIterations: number;
  sampleCount: number;
  buildMs: number;
}

export function attractionFieldSummary(canvas: Locator): Promise<AttractionFieldSummary | null> {
  return canvas.evaluate((element) => {
    const field = (element as HTMLCanvasElement & { orbit3dAttractionField?: any }).orbit3dAttractionField;
    if (!field) return null;
    return {
      width: field.width,
      height: field.height,
      centre: [field.centre[0], field.centre[1]],
      span: [field.span[0], field.span[1]],
      source: field.source,
      warmupIterations: field.warmupIterations,
      sampleCount: field.sampleCount,
      buildMs: field.buildMs,
    };
  });
}

/** The renderer's attraction texel nearest c, with its true centre coordinate. */
export function attractionTexel(canvas: Locator, re: number, im: number): Promise<AttractionTexel> {
  return canvas.evaluate(
    (element, [re, im]) => {
      const field = (element as HTMLCanvasElement & { orbit3dAttractionField?: any }).orbit3dAttractionField;
      if (!field) throw new Error("attraction field is not built");
      const reMin = field.centre[0] - field.span[0] / 2;
      const imMin = field.centre[1] - field.span[1] / 2;
      const x = Math.max(0, Math.min(field.width - 1, Math.floor(((re - reMin) / field.span[0]) * field.width)));
      const y = Math.max(0, Math.min(field.height - 1, Math.floor(((im - imMin) / field.span[1]) * field.height)));
      const offset = (y * field.width + x) * 4;
      return {
        x,
        y,
        re: reMin + ((x + 0.5) / field.width) * field.span[0],
        im: imMin + ((y + 0.5) / field.height) * field.span[1],
        centre: field.data[offset],
        spread: field.data[offset + 1],
        classification: field.data[offset + 2],
        period: field.data[offset + 3],
      };
    },
    [re, im] as const,
  );
}

/**
 * Whole-field planes for evidence images: R classification, G spread over
 * [0, 1.5], B centre over [-2, 2].
 */
export function attractionFieldPlanes(canvas: Locator): Promise<{ width: number; height: number; rgb: number[] } | null> {
  return canvas.evaluate((element) => {
    const field = (element as HTMLCanvasElement & { orbit3dAttractionField?: any }).orbit3dAttractionField;
    if (!field) return null;
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const rgb: number[] = new Array(field.width * field.height * 3);
    for (let cell = 0; cell < field.width * field.height; cell += 1) {
      const offset = cell * 4;
      rgb[cell * 3] = clamp(field.data[offset + 2] * 255);
      rgb[cell * 3 + 1] = clamp((field.data[offset + 1] / 1.5) * 255);
      rgb[cell * 3 + 2] = clamp(((field.data[offset] + 2) / 4) * 255);
    }
    return { width: field.width, height: field.height, rgb };
  });
}

/** Every texel of the renderer's field whose classification is bounded, with its spread, by row. */
export function attractionFieldRow(canvas: Locator, im: number): Promise<AttractionTexel[]> {
  return canvas.evaluate(
    (element, im) => {
      const field = (element as HTMLCanvasElement & { orbit3dAttractionField?: any }).orbit3dAttractionField;
      if (!field) throw new Error("attraction field is not built");
      const reMin = field.centre[0] - field.span[0] / 2;
      const imMin = field.centre[1] - field.span[1] / 2;
      const y = Math.max(0, Math.min(field.height - 1, Math.floor(((im - imMin) / field.span[1]) * field.height)));
      const row = [];
      for (let x = 0; x < field.width; x += 1) {
        const offset = (y * field.width + x) * 4;
        row.push({
          x,
          y,
          re: reMin + ((x + 0.5) / field.width) * field.span[0],
          im: imMin + ((y + 0.5) / field.height) * field.span[1],
          centre: field.data[offset],
          spread: field.data[offset + 1],
          classification: field.data[offset + 2],
          period: field.data[offset + 3],
        });
      }
      return row;
    },
    im,
  );
}

export interface SampledCell {
  period: number;
  multiplier: number;
  centre: number;
  spread: number;
  escaped: boolean;
}

/** Production GPU sampler (src/app/orbitSampler.ts) run in the page over c-cells. */
export async function gpuSample(
  page: Page,
  cells: readonly (readonly [number, number])[],
  warmupIterations: number,
  sampleCount: number,
): Promise<SampledCell[]> {
  const result = await page.evaluate(
    async ({ cells, warmupIterations, sampleCount }) => {
      const { OrbitSampler } = await import("/src/app/orbitSampler.ts");
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      if (!gl) throw new Error("WebGL2 unavailable");
      const sampler = OrbitSampler.create(gl);
      if (!sampler) throw new Error("GPU orbit sampler unavailable");
      const coordinates = new Float64Array(cells.flat());
      const sampled = sampler.sample(coordinates, warmupIterations, sampleCount);
      sampler.destroy();
      if (!sampled) throw new Error("GPU sampling failed");
      return cells.map((_, index) => ({
        period: sampled.periods[index],
        multiplier: sampled.interiors[index],
        centre: sampled.centres[index],
        spread: sampled.spreads[index],
        escaped: sampled.escaped[index] === 1,
      }));
    },
    { cells: cells.map(([re, im]) => [re, im]), warmupIterations, sampleCount },
  );
  return result;
}

/** The renderer's 256-entry palette texture, rebuilt from the production mapper at the sim's defaults. */
export function paletteTable(page: Page): Promise<{ preset: string; table: Rgb[] }> {
  return page.evaluate(async () => {
    const { buildMapper, defaultColourOptionsFor } = await import("/src/app/colormap.ts");
    const options = defaultColourOptionsFor("logistic-mandelbrot", 2);
    const mapper = buildMapper(1, [[0, 1]], { ...options, paletteCycleReverse: false });
    const sample = new Float32Array(1);
    const table: Rgb[] = [];
    for (let index = 0; index < 256; index += 1) {
      sample[0] = index / 255;
      const [r, g, b] = mapper(sample, 0);
      table.push([r, g, b]);
    }
    return { preset: options.preset, table };
  });
}

/** Linear-filtered, clamp-to-edge lookup of a 256×1 texture at coordinate u. */
export function paletteLookup(table: Rgb[], u: number): Rgb {
  const x = u * 256 - 0.5;
  const i0 = Math.max(0, Math.min(255, Math.floor(x)));
  const i1 = Math.max(0, Math.min(255, i0 + 1));
  const f = Math.max(0, Math.min(1, x - Math.floor(x)));
  const a = table[i0];
  const b = table[i1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function expectedSpreadColour(table: Rgb[], height: number, centre: number, bands: number, phase: number): Rgb {
  return paletteLookup(table, spreadPaletteCoordinate(height, centre, bands, phase));
}

/** Mean and RMS deviation of Re(z) over `count` iterates after `warmup`, in float64, never fed to production. */
export function referenceOrbit(cRe: number, cIm: number, warmup: number, count: number): { mean: number; rms: number; escaped: boolean } {
  let zr = 0;
  let zi = 0;
  const step = () => {
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;
  };
  for (let i = 0; i < warmup; i += 1) {
    step();
    if (zr * zr + zi * zi > 4) return { mean: NaN, rms: NaN, escaped: true };
  }
  let mean = 0;
  let squares = 0;
  for (let i = 0; i < count; i += 1) {
    step();
    if (zr * zr + zi * zi > 4) return { mean: NaN, rms: NaN, escaped: true };
    const delta = zr - mean;
    mean += delta / (i + 1);
    squares += delta * (zr - mean);
  }
  return { mean, rms: Math.sqrt(squares / count), escaped: false };
}

export function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

export interface ShaderProbeCase {
  stage: "point" | "surface" | "ground";
  colourMode: "period" | "inside-out" | "mono" | "cycle";
  period: number;
  /** Point and sheet: the column's centre height (a_centre). Ground: field R. */
  centre: number;
  /** Ground only: the column's RMS deviation (field G). */
  spread?: number;
  /** Point and sheet: the vertex height. Ground: the plane height (no colour effect). */
  height: number;
  boundary: number;
  phase: number;
  bands: number;
  reverse: boolean;
  /** Ground only: the escape texture's mask (true = escaped). */
  escaped?: boolean;
}

export const PROBE_ESCAPE_COLOUR: Rgb = [40, 80, 120];

/**
 * Link the production vertex shaders (point, sheet) against a fragment stage
 * that writes v_cycleHue, and the production ground program in its palette
 * diagnostic mode, then draw one controlled primitive per case and read the
 * pre-lighting palette colour back.
 */
export async function probeShaderColours(page: Page, cases: ShaderProbeCase[]): Promise<Rgb[]> {
  return page.evaluate(
    async ({ cases, escapeColour }) => {
      const { ORBIT3D_SHADER_SOURCES } = await import("/src/app/orbit3d.ts");
      const { buildMapper, defaultColourOptionsFor } = await import("/src/app/colormap.ts");
      const options = defaultColourOptionsFor("logistic-mandelbrot", 2);
      const mapper = buildMapper(1, [[0, 1]], { ...options, paletteCycleReverse: false });
      const palette = new Uint8Array(256 * 4);
      const sample = new Float32Array(1);
      for (let index = 0; index < 256; index += 1) {
        sample[0] = index / 255;
        const [r, g, b] = mapper(sample, 0);
        palette.set([r, g, b, 255], index * 4);
      }
      const SIZE = 64;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error("WebGL2 unavailable");
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(`probe shader: ${gl.getShaderInfoLog(shader)}`);
        }
        return shader;
      };
      const link = (vertex: string, fragment: string) => {
        const program = gl.createProgram()!;
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(`probe link: ${gl.getProgramInfoLog(program)}`);
        }
        return program;
      };
      const PASS_THROUGH = `#version 300 es
precision highp float;
in vec3 v_cycleHue;
out vec4 outColor;
void main() { outColor = vec4(v_cycleHue, 1.0); }
`;
      const programs = {
        point: link(ORBIT3D_SHADER_SOURCES.pointVertex, PASS_THROUGH),
        surface: link(ORBIT3D_SHADER_SOURCES.surfaceVertex, PASS_THROUGH),
        ground: link(ORBIT3D_SHADER_SOURCES.groundVertex, ORBIT3D_SHADER_SOURCES.groundFragment),
      };
      const texture2d = (unit: number, internal: number, format: number, type: number, w: number, h: number, data: ArrayBufferView, linear: boolean) => {
        const texture = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
        return texture;
      };
      // Same layout and filtering as the renderer's fractal palette texture.
      texture2d(3, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 256, 1, palette, true);
      const COLOUR_MODE: Record<string, number> = { period: 0, "inside-out": 1, mono: 2, cycle: 3 };
      const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      // clip = (world.x, world.z, 0, 1): drops the height axis so a sheet or
      // ground quad at any height still covers the read-back pixel.
      const dropHeight = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
      const loc = (program: WebGLProgram, name: string) => gl.getUniformLocation(program, name);
      const attr = (program: WebGLProgram, name: string) => gl.getAttribLocation(program, name);
      const positionBuffer = gl.createBuffer()!;
      const results: [number, number, number][] = [];
      const pixel = new Uint8Array(4);
      for (const item of cases) {
        gl.viewport(0, 0, SIZE, SIZE);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const program = programs[item.stage];
        gl.useProgram(program);
        gl.uniform1i(loc(program, "u_palette"), 3);
        gl.uniform1i(loc(program, "u_colourMode"), COLOUR_MODE[item.colourMode]);
        gl.uniform1f(loc(program, "u_phase"), item.phase);
        gl.uniform1f(loc(program, "u_cycleBands"), item.bands);
        gl.uniform1f(loc(program, "u_paletteReverse"), item.reverse ? 1 : 0);
        gl.uniform1f(loc(program, "u_markerRe"), -5);
        gl.uniform1f(loc(program, "u_fanActive"), 0);
        let readX = SIZE / 2;
        let readY = SIZE / 2;
        if (item.stage === "point") {
          gl.uniformMatrix4fv(loc(program, "u_viewProjection"), false, identity);
          gl.uniform1f(loc(program, "u_pointSize"), 8);
          gl.uniform1f(loc(program, "u_cameraZoomOffset"), 0);
          gl.uniform1f(loc(program, "u_sampleCount"), 8);
          gl.uniform1f(loc(program, "u_drawDensity"), 1);
          gl.uniform1f(loc(program, "u_cellCount"), 1);
          gl.uniform1f(loc(program, "u_boundaryDetailBaseCellCount"), 1);
          gl.uniform1f(loc(program, "u_boundaryDetailOpacity"), 1);
          gl.uniform1f(loc(program, "u_hybridMode"), 0);
          gl.uniform1f(loc(program, "u_edgeGlow"), 0);
          gl.uniform1f(loc(program, "u_zoomGrowth"), 0);
          gl.uniform3f(loc(program, "u_posOffset"), 0, 0, 0);
          gl.uniform3f(loc(program, "u_posScale"), 1, 1, 1);
          gl.uniform1f(loc(program, "u_periodScale"), 1);
          // c = (-0.5, 0) lands at NDC x = 0; the height moves it along y.
          gl.vertexAttrib3f(attr(program, "a_position"), -0.5, 0, item.height);
          gl.vertexAttrib1f(attr(program, "a_period"), item.period);
          gl.vertexAttrib1f(attr(program, "a_centre"), item.centre);
          gl.vertexAttrib1f(attr(program, "a_boundary"), item.boundary);
          gl.vertexAttrib1f(attr(program, "a_weight"), 1);
          gl.drawArrays(gl.POINTS, 0, 1);
          readY = Math.floor(((item.height * 0.56 + 1) / 2) * SIZE);
        } else if (item.stage === "surface") {
          gl.uniformMatrix4fv(loc(program, "u_viewProjection"), false, dropHeight);
          gl.uniform2f(loc(program, "u_gridSize"), 3, 3);
          gl.uniform1f(loc(program, "u_visibleIterations"), 8);
          const h = item.height;
          gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, h, 2, 0, h, 0, 2, h, 2, 2, h]), gl.STATIC_DRAW);
          const position = attr(program, "a_position");
          gl.enableVertexAttribArray(position);
          gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
          gl.vertexAttrib3f(attr(program, "a_normal"), 0, 0, 1);
          gl.vertexAttrib1f(attr(program, "a_period"), item.period);
          gl.vertexAttrib1f(attr(program, "a_centre"), item.centre);
          gl.vertexAttrib1f(attr(program, "a_boundary"), item.boundary);
          gl.vertexAttrib1f(attr(program, "a_rank"), 0);
          gl.vertexAttrib1f(attr(program, "a_edgeFade"), 1);
          gl.vertexAttrib1f(attr(program, "a_dissolve"), 1);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.disableVertexAttribArray(position);
        } else {
          gl.uniformMatrix4fv(loc(program, "u_viewProjection"), false, dropHeight);
          gl.uniform2f(loc(program, "u_planeCentre"), 0, 0);
          gl.uniform2f(loc(program, "u_planeHalfSpan"), 1, 1);
          gl.uniform1f(loc(program, "u_planeHeight"), item.height);
          gl.uniform2f(loc(program, "u_texCentre"), 0, 0);
          gl.uniform2f(loc(program, "u_texSpan"), 2, 2);
          gl.uniform1i(loc(program, "u_texture"), 0);
          gl.uniform1i(loc(program, "u_interiorDistance"), 1);
          gl.uniform1i(loc(program, "u_attraction"), 2);
          gl.uniform1i(loc(program, "u_interiorField"), item.colourMode === "inside-out" ? 2 : 0);
          gl.uniform1i(loc(program, "u_diagnosticMode"), 1);
          gl.uniform1f(loc(program, "u_cycleBeam"), 1);
          const escape = texture2d(
            0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 1, 1,
            new Uint8Array([escapeColour[0], escapeColour[1], escapeColour[2], item.escaped ? 255 : 0]), true,
          );
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, escape);
          const classification = item.escaped ? 0 : item.period > 0 ? 1 : 0.5;
          // Same layout as the renderer's field: centre, spread, class, period.
          const attraction = texture2d(
            2, gl.RGBA32F, gl.RGBA, gl.FLOAT, 1, 1,
            new Float32Array([item.centre, item.spread ?? 0, classification, item.period]), false,
          );
          gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
          const position = attr(program, "a_position");
          gl.enableVertexAttribArray(position);
          gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.disableVertexAttribArray(position);
          gl.deleteTexture(escape);
          gl.deleteTexture(attraction);
        }
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error(`probe GL error ${error} for ${JSON.stringify(item)}`);
        gl.readPixels(readX, readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        results.push([pixel[0], pixel[1], pixel[2]]);
      }
      return results;
    },
    { cases, escapeColour: PROBE_ESCAPE_COLOUR },
  );
}

/** Project a c-plane point at an orbit height to canvas pixels under the default camera. */
export function projectToCanvas(
  page: Page,
  re: number,
  im: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    async ({ re, im, height, viewportWidth, viewportHeight }) => {
      const { orbit3dDefaultSurfaceProjector } = await import("/src/app/orbit3d.ts");
      // A fine grid makes grid coordinates a direct affine map of c; the
      // middle row is pinned to Im(c) = 0 by the projector itself.
      const width = 3000;
      const heightCells = 2000;
      const gridX = ((re + 2) / 3) * width - 0.5;
      const gridY = im === 0 ? Math.floor(heightCells / 2) : ((im + 1) / 2) * heightCells - 0.5;
      const project = orbit3dDefaultSurfaceProjector(width, heightCells, viewportWidth, viewportHeight);
      return project(gridX, gridY, height);
    },
    { re, im, height, viewportWidth, viewportHeight },
  );
}

/** Mean RGB over a square window of a decoded frame. */
export function meanWindow(image: DecodedImage, x: number, y: number, radius = 2): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const px = Math.round(x) + dx;
      const py = Math.round(y) + dy;
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
      const i = (py * image.width + px) * 4;
      r += image.rgba[i];
      g += image.rgba[i + 1];
      b += image.rgba[i + 2];
      n += 1;
    }
  }
  return [r / n, g / n, b / n];
}

/** OKLab hue angle (degrees) and chroma of one RGB triple. */
export function hueOf(rgb: Rgb): { hue: number; chroma: number; lightness: number } {
  const image: DecodedImage = { width: 1, height: 1, rgba: new Uint8Array([rgb[0], rgb[1], rgb[2], 255]) };
  const { L, a, b } = toOklab(image);
  return {
    hue: (Math.atan2(b[0], a[0]) * 180) / Math.PI,
    chroma: Math.hypot(a[0], b[0]),
    lightness: L[0],
  };
}

export function hueDifference(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Warm-cache frame interval statistics from requestAnimationFrame. */
export async function frameTiming(page: Page, frames = 90, warmup = 15): Promise<{ medianMs: number; meanMs: number; p90Ms: number; samples: number }> {
  return page.evaluate(
    ({ frames, warmup }) =>
      new Promise<{ medianMs: number; meanMs: number; p90Ms: number; samples: number }>((resolve) => {
        const intervals: number[] = [];
        let last = performance.now();
        let count = 0;
        const tick = () => {
          const now = performance.now();
          count += 1;
          if (count > warmup) intervals.push(now - last);
          last = now;
          if (intervals.length >= frames) {
            const sorted = [...intervals].sort((a, b) => a - b);
            resolve({
              medianMs: sorted[Math.floor(sorted.length / 2)],
              meanMs: intervals.reduce((s, v) => s + v, 0) / intervals.length,
              p90Ms: sorted[Math.floor(sorted.length * 0.9)],
              samples: intervals.length,
            });
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { frames, warmup },
  );
}

/** Complex square root, principal branch. */
export function complexSqrt(re: number, im: number): [number, number] {
  const r = Math.hypot(re, im);
  const sr = Math.sqrt((r + re) / 2);
  const si = Math.sign(im || 1) * Math.sqrt((r - re) / 2);
  return [sr, si];
}

/** |2 z*| for the attracting fixed point z* = (1 − √(1 − 4c)) / 2. */
export function period1Multiplier(re: number, im: number): number {
  const [sr, si] = complexSqrt(1 - 4 * re, -4 * im);
  return Math.hypot(1 - sr, -si);
}

/** |4 z1 z2| = 4 |c + 1| for the period-2 cycle. */
export function period2Multiplier(re: number, im: number): number {
  return 4 * Math.hypot(re + 1, im);
}
