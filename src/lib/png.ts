// A PNG from raw pixels, for the pictures inside a scanned PDF (unpdf gives them as pixels, not files), so the vision
// model can read them. Large scans are halved until they're at most `maxSide` across: a page's text stays readable,
// and the model reads fewer pixels.

import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** Every pixel averaged with its neighbours: the picture at half its width and height. */
function halve(data: Uint8Array, width: number, height: number, channels: number): { data: Uint8Array; width: number; height: number } {
  const w = Math.max(1, Math.floor(width / 2));
  const h = Math.max(1, Math.floor(height / 2));
  const out = new Uint8Array(w * h * channels);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < channels; c++) {
        const at = (yy: number, xx: number) => data[(Math.min(yy, height - 1) * width + Math.min(xx, width - 1)) * channels + c];
        out[(y * w + x) * channels + c] = (at(2 * y, 2 * x) + at(2 * y, 2 * x + 1) + at(2 * y + 1, 2 * x) + at(2 * y + 1, 2 * x + 1) + 2) >> 2;
      }
  return { data: out, width: w, height: h };
}

/** Raw pixels (grey, RGB or RGBA) as a PNG file. */
export function encodePng(pixels: Uint8Array, width: number, height: number, channels: 1 | 3 | 4, maxSide = 2000): Buffer {
  let img = { data: pixels, width, height };
  while (Math.max(img.width, img.height) > maxSide) img = halve(img.data, img.width, img.height, channels);
  const row = img.width * channels;
  const raw = Buffer.alloc((row + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (row + 1)] = 0;
    raw.set(img.data.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(img.width, 0);
  header.writeUInt32BE(img.height, 4);
  header[8] = 8;
  header[9] = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
