/**
 * Rendered-frame colour metrics for the cycle-palette sweep.
 *
 * Playwright hands back 8-bit RGBA PNGs; this decodes them without a
 * dependency (zlib inflate plus the five PNG scanline filters) and scores the
 * lit pixels in OKLab. The questions the operator asked are all about what
 * the eye sees on the rendered cloud, not about the palette strip, so these
 * run on screenshots rather than on the texture.
 */
import { deflateSync, inflateSync } from "node:zlib";

export interface DecodedImage {
  width: number;
  height: number;
  /** Interleaved RGBA, top-left origin. */
  rgba: Uint8Array;
}

export function decodePng(buffer: Buffer): DecodedImage {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i += 1) {
    if (buffer[i] !== signature[i]) throw new Error("not a PNG");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colourType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error(`unsupported PNG: depth ${bitDepth}, interlace ${interlace}`);
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colourType as 0 | 2 | 4 | 6];
  if (!channels) throw new Error(`unsupported PNG colour type ${colourType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);
  let current = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[p++];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[p++];
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      let recon: number;
      switch (filter) {
        case 0:
          recon = value;
          break;
        case 1:
          recon = value + left;
          break;
        case 2:
          recon = value + up;
          break;
        case 3:
          recon = value + ((left + up) >> 1);
          break;
        case 4: {
          const estimate = left + up - upLeft;
          const dl = Math.abs(estimate - left);
          const du = Math.abs(estimate - up);
          const dul = Math.abs(estimate - upLeft);
          recon = value + (dl <= du && dl <= dul ? left : du <= dul ? up : upLeft);
          break;
        }
        default:
          throw new Error(`bad PNG filter ${filter}`);
      }
      current[x] = recon & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      if (channels >= 3) {
        out[dst] = current[src];
        out[dst + 1] = current[src + 1];
        out[dst + 2] = current[src + 2];
        out[dst + 3] = channels === 4 ? current[src + 3] : 255;
      } else {
        out[dst] = current[src];
        out[dst + 1] = current[src];
        out[dst + 2] = current[src];
        out[dst + 3] = channels === 2 ? current[src + 1] : 255;
      }
    }
    [previous, current] = [current, previous];
  }
  return { width, height, rgba: out };
}

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** OKLab, as three Float32 planes so a 1280×720 frame stays cheap to scan. */
export function toOklab(image: DecodedImage): { L: Float32Array; a: Float32Array; b: Float32Array } {
  const n = image.width * image.height;
  const L = new Float32Array(n);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  const linear = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) linear[i] = srgbToLinear(i);
  for (let i = 0; i < n; i += 1) {
    const r = linear[image.rgba[i * 4]];
    const g = linear[image.rgba[i * 4 + 1]];
    const bl = linear[image.rgba[i * 4 + 2]];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    L[i] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    a[i] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    b[i] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  }
  return { L, a, b };
}

export interface FrameColourMetrics {
  /** Share of pixels brighter than the background floor. */
  lit: number;
  /** Share of lit pixels whose right or down neighbour differs by > 12 OKLab×100: band edges. */
  edgeDensity: number;
  /** Circular spread of hue over lit, chromatic pixels (0 = one hue, 1 = every hue). */
  hueSpread: number;
  /** Mean OKLab chroma over lit pixels. */
  chroma: number;
  /** Share of lit pixels that are near-white (L > 0.93, chroma < 0.03): clipped cloud. */
  whiteClip: number;
  /** Share of lit pixels with high chroma at high lightness: the neon look. */
  neon: number;
}

export function frameColourMetrics(image: DecodedImage, litFloor = 0.1): FrameColourMetrics {
  const { L, a, b } = toOklab(image);
  const { width, height } = image;
  let lit = 0;
  let edges = 0;
  let chromaSum = 0;
  let white = 0;
  let neon = 0;
  let hueX = 0;
  let hueY = 0;
  let hueWeight = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (L[i] < litFloor) continue;
      lit += 1;
      const C = Math.hypot(a[i], b[i]);
      chromaSum += C;
      if (L[i] > 0.93 && C < 0.03) white += 1;
      if (L[i] > 0.7 && C > 0.16) neon += 1;
      if (C > 0.04) {
        const w = Math.min(1, C / 0.1);
        hueX += (a[i] / C) * w;
        hueY += (b[i] / C) * w;
        hueWeight += w;
      }
      let edge = false;
      if (x + 1 < width) {
        const j = i + 1;
        const d = 100 * Math.hypot(L[i] - L[j], a[i] - a[j], b[i] - b[j]);
        if (d > 12) edge = true;
      }
      if (!edge && y + 1 < height) {
        const j = i + width;
        const d = 100 * Math.hypot(L[i] - L[j], a[i] - a[j], b[i] - b[j]);
        if (d > 12) edge = true;
      }
      if (edge) edges += 1;
    }
  }
  const total = width * height;
  const safeLit = Math.max(1, lit);
  const resultant = hueWeight > 0 ? Math.hypot(hueX, hueY) / hueWeight : 1;
  return {
    lit: lit / total,
    edgeDensity: edges / safeLit,
    hueSpread: 1 - resultant,
    chroma: chromaSum / safeLit,
    whiteClip: white / safeLit,
    neon: neon / safeLit,
  };
}

/** Mean OKLab×100 distance between two frames over pixels lit in either. */
export function frameDifference(before: DecodedImage, after: DecodedImage, litFloor = 0.1): number {
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error("frame size mismatch");
  }
  const p = toOklab(before);
  const q = toOklab(after);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < p.L.length; i += 1) {
    if (p.L[i] < litFloor && q.L[i] < litFloor) continue;
    sum += 100 * Math.hypot(p.L[i] - q.L[i], p.a[i] - q.a[i], p.b[i] - q.b[i]);
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), out.length - 4);
  return out;
}

/** 8-bit RGB PNG from interleaved RGB bytes; the colour counterpart of report.ts's grayscale writer. */
export function encodeRgbPng(rgb: Uint8Array, width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  let p = 0;
  for (let y = 0; y < height; y += 1) {
    raw[p++] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), p);
    p += width * 3;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Tile decoded frames into a grid, each cropped to a centred window and
 * box-downscaled, so a whole sweep can be eyeballed on one image.
 */
export function contactSheet(
  frames: DecodedImage[],
  columns: number,
  crop: { x: number; y: number; width: number; height: number },
  scale: number,
): Buffer {
  const tileW = Math.floor(crop.width / scale);
  const tileH = Math.floor(crop.height / scale);
  const rows = Math.ceil(frames.length / columns);
  const gap = 4;
  const width = columns * (tileW + gap);
  const height = rows * (tileH + gap);
  const rgb = new Uint8Array(width * height * 3);
  frames.forEach((frame, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    for (let ty = 0; ty < tileH; ty += 1) {
      for (let tx = 0; tx < tileW; tx += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            const px = crop.x + tx * scale + sx;
            const py = crop.y + ty * scale + sy;
            const i = (py * frame.width + px) * 4;
            r += frame.rgba[i];
            g += frame.rgba[i + 1];
            b += frame.rgba[i + 2];
          }
        }
        const n = scale * scale;
        const o = ((row * (tileH + gap) + ty) * width + col * (tileW + gap) + tx) * 3;
        rgb[o] = r / n;
        rgb[o + 1] = g / n;
        rgb[o + 2] = b / n;
      }
    }
  });
  return encodeRgbPng(rgb, width, height);
}
