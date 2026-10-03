// Generates the home-screen icons (pixel-art robot head) as PNGs in public/.
// `bun scripts/make-icons.ts` — no image libraries, just a tiny PNG encoder.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

// 16×16 sprite. . = background, K = outline, R = red body, D = dark screen,
// E = eye glow, A = antenna, P = blush
const SPRITE = [
  "................",
  ".......AA.......",
  ".......KK.......",
  "...KKKKKKKKKK...",
  "..KRRRRRRRRRRK..",
  "..KRDDDDDDDDRK..",
  "..KRDEEDDEEDRK..",
  "..KRDEEDDEEDRK..",
  "..KRDDDDDDDDRK..",
  "..KRPDDDDDDPRK..",
  "..KRRRRRRRRRRK..",
  "...KKKKKKKKKK...",
  ".....KRRRRK.....",
  "....KRRKKRRK....",
  "....KRRRRRRK....",
  "................",
];
const PALETTE: Record<string, [number, number, number]> = {
  ".": [27, 18, 32],
  K: [11, 10, 16],
  R: [232, 54, 59],
  D: [24, 25, 38],
  E: [216, 251, 255],
  A: [74, 240, 255],
  P: [255, 122, 168],
};

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function png(size: number): Uint8Array {
  const cell = size / 16;
  const raw = new Uint8Array(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const ch = SPRITE[Math.floor(y / cell)]![Math.floor(x / cell)]!;
      const [r, g, b] = PALETTE[ch]!;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, size);
  dv.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

mkdirSync("public", { recursive: true });
// iOS wants 180; the manifest wants 192 and 512. 16px sprite → whole-number scales.
for (const [name, size] of [["apple-touch-icon.png", 176], ["icon-192.png", 192], ["icon-512.png", 512]] as const) {
  writeFileSync(`public/${name}`, png(size));
  console.log(`public/${name} ${size}px`);
}
