import type { Raster, Rgb } from "./png.ts";
import { exifOrientation } from "./webp.ts";

const BLOCK = 8;
const DC_CODE_BITS = 4;

function segment(marker: number, body: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xff00 | marker, 0);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
}

function tables(): Buffer[] {
  const quantisation = Buffer.concat([Buffer.from([0]), Buffer.alloc(64, BLOCK)]);
  const dcCounts = Buffer.alloc(16);
  dcCounts[DC_CODE_BITS - 1] = 12;
  const dc = Buffer.concat([Buffer.from([0x00]), dcCounts, Buffer.from(Array.from({ length: 12 }, (_, i) => i))]);
  const acCounts = Buffer.alloc(16);
  acCounts[0] = 1;
  const ac = Buffer.concat([Buffer.from([0x10]), acCounts, Buffer.from([0x00])]);
  return [segment(0xdb, quantisation), segment(0xc4, dc), segment(0xc4, ac)];
}

function ycc([r, g, b]: Rgb): [number, number, number] {
  return [
    Math.round(0.299 * r + 0.587 * g + 0.114 * b),
    Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b),
    Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b),
  ].map((value) => Math.max(0, Math.min(255, value)) - 128) as [number, number, number];
}

class Bits {
  private bytes: number[] = [];
  private pending = 0;
  private count = 0;

  write(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) {
      this.pending = (this.pending << 1) | ((value >> i) & 1);
      this.count += 1;
      if (this.count === 8) this.flushByte();
    }
  }

  private flushByte(): void {
    this.bytes.push(this.pending);
    if (this.pending === 0xff) this.bytes.push(0);
    this.pending = 0;
    this.count = 0;
  }

  finish(): Buffer {
    if (this.count > 0) this.write(0xff, 8 - this.count);
    return Buffer.from(this.bytes);
  }
}

/**
 * A baseline JPEG of a raster whose pixels are flat within every 8 px block, stored as `orientation` says: for 6
 * the file holds the picture turned a quarter anticlockwise and carries an EXIF tag that turns it upright again.
 * Flat blocks need no AC coefficients, so the encoder writes only the DC value of every block and the result
 * decodes to exactly the raster's colours.
 */
export function rasterJpeg(raster: Raster, orientation: 1 | 6 = 1): Buffer {
  if (raster.width % BLOCK !== 0 || raster.height % BLOCK !== 0) throw new Error("a raster for rasterJpeg is a whole number of 8 px blocks");
  const turned = orientation === 6;
  const width = turned ? raster.height : raster.width;
  const height = turned ? raster.width : raster.height;
  const stored = (x: number, y: number): Rgb => (turned ? raster.at(raster.width - 1 - y, x) : raster.at(x, y));

  const bits = new Bits();
  const previous = [0, 0, 0];
  for (let by = 0; by < height; by += BLOCK) {
    for (let bx = 0; bx < width; bx += BLOCK) {
      const levels = ycc(stored(bx, by));
      for (let c = 0; c < 3; c += 1) {
        const diff = (levels[c] ?? 0) - (previous[c] ?? 0);
        previous[c] = levels[c] ?? 0;
        const size = diff === 0 ? 0 : Math.floor(Math.log2(Math.abs(diff))) + 1;
        bits.write(size, DC_CODE_BITS);
        if (size > 0) bits.write(diff >= 0 ? diff : diff + (1 << size) - 1, size);
        bits.write(0, 1);
      }
    }
  }

  const frame = Buffer.alloc(15);
  frame[0] = 8;
  frame.writeUInt16BE(height, 1);
  frame.writeUInt16BE(width, 3);
  frame[5] = 3;
  for (let c = 0; c < 3; c += 1) frame.set([c + 1, 0x11, 0], 6 + c * 3);
  const scan = Buffer.from([3, 1, 0x00, 2, 0x00, 3, 0x00, 0, 63, 0]);
  const jfif = Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const exif = turned ? [segment(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "binary"), exifOrientation(6)]))] : [];
  return Buffer.concat([Buffer.from([0xff, 0xd8]), segment(0xe0, jfif), ...exif, ...tables(), segment(0xc0, frame), segment(0xda, scan), bits.finish(), Buffer.from([0xff, 0xd9])]);
}
