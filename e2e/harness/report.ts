/**
 * Node-side reporting helpers for the sweep: a tiny dependency-free grayscale PNG
 * encoder (so candidate fields can actually be eyeballed) and a markdown table
 * writer for the metric results.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { InterestingnessMetrics } from "./metrics.ts";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Buffer.from(type, "latin1");
  const body = Buffer.concat([typeBytes, data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), out.length - 4);
  return out;
}

/**
 * Encode a [0,1] scalar field as an 8-bit grayscale PNG, nearest-neighbour
 * upscaled by `scale` for visibility. No external deps; zlib is built in.
 */
export function encodeGrayscalePng(
  values: ArrayLike<number>,
  width: number,
  height: number,
  scale = 3,
): Buffer {
  const outW = width * scale;
  const outH = height * scale;
  // One filter byte (0 = none) per output row, then outW gray bytes.
  const raw = Buffer.alloc(outH * (outW + 1));
  let p = 0;
  for (let y = 0; y < outH; y += 1) {
    raw[p++] = 0;
    const srcRow = Math.floor(y / scale) * width;
    for (let x = 0; x < outW; x += 1) {
      const v = values[srcRow + Math.floor(x / scale)];
      let g = Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255);
      if (g < 0) g = 0;
      else if (g > 255) g = 255;
      raw[p++] = g;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(outW, 0);
  ihdr.writeUInt32BE(outH, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: grayscale
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

export function writePng(
  path: string,
  values: ArrayLike<number>,
  width: number,
  height: number,
  scale = 3,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodeGrayscalePng(values, width, height, scale));
}

export interface ScoredCandidate {
  id: string;
  label: string;
  params: Record<string, number | boolean | string>;
  metrics: InterestingnessMetrics;
  /** Optional relative path to a rendered thumbnail. */
  thumb?: string;
}

function fmt(n: number, dp = 3): string {
  return n.toFixed(dp);
}

function paramSummary(params: Record<string, number | boolean | string>, keys: string[]): string {
  return keys
    .filter((k) => k in params)
    .map((k) => `${k}=${params[k]}`)
    .join(" ");
}

/** Markdown table of scored candidates, highest score first. */
export function metricsTable(rows: ScoredCandidate[], paramKeys: string[]): string {
  const header =
    "| # | label | params | score | entropy | autocorr | flux | coverage |\n" +
    "|---|---|---|---|---|---|---|---|";
  const body = rows
    .map((r, i) => {
      const m = r.metrics;
      return `| ${i + 1} | ${r.label} | \`${paramSummary(r.params, paramKeys)}\` | **${fmt(m.score)}** | ${fmt(m.entropy)} | ${fmt(m.spatialAutocorrelation)} | ${fmt(m.temporalFlux, 4)} | ${fmt(m.coverage)} |`;
    })
    .join("\n");
  return `${header}\n${body}`;
}

export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
