// Reproducible lowercase jt launcher icons. The wordmark stays inside the
// central maskable safe zone; the blue field deliberately reaches every edge
// so Android and desktop launchers can apply their own shape.
import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.join(import.meta.dirname, "..", "public", "icons");
const SCALE = 4;
const BLUE = [76, 155, 232, 255];
const PAPER = [251, 251, 249, 255];

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type);
  const body = Buffer.concat([name, data]);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function roundedRect(x, y, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return Math.hypot(x - cx, y - cy) <= radius;
}

function segment(x, y, ax, ay, bx, by, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= radius;
}

function inWordmark(x, y) {
  const jDot = Math.hypot(x - 0.36, y - 0.3) <= 0.045;
  const jStem = segment(x, y, 0.36, 0.43, 0.36, 0.66, 0.042);
  const jHook =
    segment(x, y, 0.36, 0.66, 0.33, 0.735, 0.042) ||
    segment(x, y, 0.33, 0.735, 0.25, 0.76, 0.042);
  const tStem = roundedRect(x, y, 0.57, 0.27, 0.655, 0.75, 0.042);
  const tBar = roundedRect(x, y, 0.49, 0.41, 0.735, 0.495, 0.042);
  return jDot || jStem || jHook || tStem || tBar;
}

function makePng(size) {
  const hi = size * SCALE;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let wordmarkSamples = 0;
      for (let sy = 0; sy < SCALE; sy += 1) {
        for (let sx = 0; sx < SCALE; sx += 1) {
          const nx = (x * SCALE + sx + 0.5) / hi;
          const ny = (y * SCALE + sy + 0.5) / hi;
          if (inWordmark(nx, ny)) wordmarkSamples += 1;
        }
      }
      const mix = wordmarkSamples / (SCALE * SCALE);
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[offset + channel] = Math.round(BLUE[channel] * (1 - mix) + PAPER[channel] * mix);
      }
    }
  }

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    scanlines[row] = 0;
    pixels.copy(scanlines, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND"),
  ]);
}

await mkdir(outDir, { recursive: true });
for (const size of [192, 512]) {
  await writeFile(path.join(outDir, `jt-${size}.png`), makePng(size));
}
