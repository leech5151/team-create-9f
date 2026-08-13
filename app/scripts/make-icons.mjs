// Generates the PWA icon set. Dependency-free: raw RGBA -> zlib -> PNG.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

// ── PNG encoding ──────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 = compression/filter/interlace, all 0

  // one filter byte (0 = None) per scanline
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (1 + width * 4);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, src, src + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing (4x supersampled for smooth edges) ────────────────
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const BG = hex('#14161A');
const BALL = hex('#FF4A21');
const LANES = [hex('#1F5FE0'), hex('#0E9D8B'), hex('#E0A200')];

const SS = 4; // supersample factor

/**
 * @param size    output edge length in px
 * @param inset   fraction of the canvas kept clear around the artwork
 *                (maskable icons need the mark inside the ~80% safe zone)
 */
function drawIcon(size, inset) {
  const S = size * SS;
  const acc = new Float64Array(size * size * 3);
  const cnt = size * size;

  // artwork is authored on a 512 grid, then scaled into the safe zone
  const scale = (S / 512) * (1 - inset * 2);
  const offset = (S - 512 * scale) / 2;
  const X = (v) => offset + v * scale;
  const R = (v) => v * scale;

  const bars = [0, 1, 2].map((i) => ({
    x0: X(109 + i * 110),
    x1: X(109 + i * 110 + 74),
    y0: X(96),
    y1: X(96 + 236),
    r: R(37),
    color: LANES[i],
  }));
  const ball = { cx: X(256), cy: X(400), r: R(58) };

  const inRoundRect = (px, py, b) => {
    const cx = Math.min(Math.max(px, b.x0 + b.r), b.x1 - b.r);
    const cy = Math.min(Math.max(py, b.y0 + b.r), b.y1 - b.r);
    return (px - cx) ** 2 + (py - cy) ** 2 <= b.r * b.r;
  };

  for (let y = 0; y < S; y++) {
    const oy = Math.floor(y / SS);
    for (let x = 0; x < S; x++) {
      let c = BG;
      for (const b of bars) {
        if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && inRoundRect(x, y, b)) {
          c = b.color;
          break;
        }
      }
      if ((x - ball.cx) ** 2 + (y - ball.cy) ** 2 <= ball.r * ball.r) c = BALL;

      const o = (oy * size + Math.floor(x / SS)) * 3;
      acc[o] += c[0];
      acc[o + 1] += c[1];
      acc[o + 2] += c[2];
    }
  }

  const rgba = Buffer.alloc(cnt * 4);
  const samples = SS * SS;
  for (let i = 0; i < cnt; i++) {
    rgba[i * 4] = Math.round(acc[i * 3] / samples);
    rgba[i * 4 + 1] = Math.round(acc[i * 3 + 1] / samples);
    rgba[i * 4 + 2] = Math.round(acc[i * 3 + 2] / samples);
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(size, size, rgba);
}

const files = [
  ['icon-192.png', 192, 0.06],
  ['icon-512.png', 512, 0.06],
  ['icon-maskable-512.png', 512, 0.14], // artwork pulled into the safe zone
  ['apple-touch-icon.png', 180, 0.06],
  ['favicon-32.png', 32, 0.04],
];

for (const [name, size, inset] of files) {
  const buf = drawIcon(size, inset);
  writeFileSync(join(OUT, name), buf);
  console.log(`${name.padEnd(26)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)}kB`);
}
