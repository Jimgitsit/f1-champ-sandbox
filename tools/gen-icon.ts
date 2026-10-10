// Renders public/apple-touch-icon.png for f1-champ-sandbox: a chequered band across a
// dark ground with a red stripe above it. Self-contained PNG encoder, no
// native deps. Run: bun run icon
import { deflateSync } from "node:zlib"; // zlib-wrapped stream (Bun.deflateSync is raw)

const SIZE = 180;
const SS = 4;
const OUT = new URL("../public/apple-touch-icon.png", import.meta.url);

type RGB = [number, number, number];
const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const BG_T = hex("#22272e");
const BG_B = hex("#121417");
const RED = hex("#d6232a");
const WHITE = hex("#f4f4f2");
const BLACK = hex("#15171a");

const STRIPE_Y0 = SIZE * 0.2;
const STRIPE_Y1 = SIZE * 0.3;
const BAND_Y0 = SIZE * 0.42;
const BAND_Y1 = SIZE * 0.8;
const ROWS = 3;
const CELL = (BAND_Y1 - BAND_Y0) / ROWS;
const SKEW = 0.18; // the band leans like a flag in motion

function shade(x: number, y: number): RGB {
  const base = mix(BG_T, BG_B, y / SIZE);
  if (y >= STRIPE_Y0 && y < STRIPE_Y1) {
    return RED;
  }
  if (y >= BAND_Y0 && y < BAND_Y1) {
    const sx = x + (y - BAND_Y0) * SKEW;
    const col = Math.floor(sx / CELL);
    const row = Math.floor((y - BAND_Y0) / CELL);
    return (col + row) % 2 === 0 ? WHITE : BLACK;
  }
  return base;
}

const buf = Buffer.alloc(SIZE * SIZE * 4);
for (let oy = 0; oy < SIZE; oy++) {
  for (let ox = 0; ox < SIZE; ox++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = shade(ox + (sx + 0.5) / SS, oy + (sy + 0.5) / SS);
        r += c[0];
        g += c[1];
        b += c[2];
      }
    }
    const n = SS * SS;
    const o = (oy * SIZE + ox) * 4;
    buf[o] = Math.round(r / n);
    buf[o + 1] = Math.round(g / n);
    buf[o + 2] = Math.round(b / n);
    buf[o + 3] = 255;
  }
}

const crcTable = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) {
    c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  buf.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

await Bun.write(OUT, png);
console.log(`wrote ${OUT.pathname} (${png.length} bytes)`);
