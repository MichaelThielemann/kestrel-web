import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export type Rgb = [number, number, number];

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A deterministic RGB gradient PNG, so every run uploads byte-identical media. */
export function gradientPng(width: number, height: number, from: [number, number, number] = [40, 90, 160], to: [number, number, number] = [230, 170, 60]): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      const t = (x + y) / (width + height);
      for (let c = 0; c < 3; c += 1) row[1 + x * 3 + c] = Math.round((from[c] ?? 0) + ((to[c] ?? 0) - (from[c] ?? 0)) * t);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

/** A picture of flat blocks, as wide and high as a whole number of 8 px blocks, read pixel by pixel through `at`. */
export interface Raster {
  width: number;
  height: number;
  columns: number;
  rows: number;
  /** The number of the cell that carries the motif: a black cell with a white marker around its centre. */
  motif: number;
  at(x: number, y: number): Rgb;
}

const DIGITS: Record<string, readonly string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};
const DIGIT_SCALE = 16;
const DIGIT_INSET = 8;
const MARKER = 64;
const BLACK: Rgb = [20, 20, 20];
const WHITE: Rgb = [255, 255, 255];

function hsv(hue: number, saturation: number, value: number): Rgb {
  const channel = (n: number): number => {
    const k = (n + hue / 60) % 6;
    return Math.round(255 * (value - value * saturation * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [channel(5), channel(3), channel(1)];
}

/** The background colour of cell `n` (counted from 1, row by row): a hue, saturation and brightness no other cell shares, black for the motif. */
export function cellColor(n: number, motif: number): Rgb {
  const light = (n - 1) % 2 === 0;
  return n === motif ? BLACK : hsv((((n - 1) * 3) % 20) * 18, light ? 0.5 : 0.75, light ? 0.95 : 0.7);
}

function digitPixel(text: string, x: number, y: number): boolean {
  const column = Math.floor(x / DIGIT_SCALE);
  const row = Math.floor(y / DIGIT_SCALE);
  if (x < 0 || y < 0 || row > 4) return false;
  const glyph = DIGITS[text[Math.floor(column / 4)] ?? ""];
  return column % 4 !== 3 && glyph?.[row]?.[column % 4] === "1";
}

/**
 * A numbered grid for checking which part of a picture a crop shows. Every cell has its own colour and its number
 * in the top left corner; the motif cell is black with a white marker around its centre. The picture is
 * `columns × rows` cells of `cellWidth × cellHeight` pixels, both multiples of 8.
 */
export function numberedGrid(columns = 5, rows = 5, cellWidth = 240, cellHeight = 192, motif = 4): Raster {
  const markerX = Math.floor((cellWidth - MARKER) / 16) * 8;
  const markerY = Math.floor((cellHeight - MARKER) / 16) * 8;
  return {
    width: columns * cellWidth,
    height: rows * cellHeight,
    columns,
    rows,
    motif,
    at(x, y) {
      const column = Math.min(columns - 1, Math.floor(x / cellWidth));
      const row = Math.min(rows - 1, Math.floor(y / cellHeight));
      const n = row * columns + column + 1;
      const inX = x - column * cellWidth;
      const inY = y - row * cellHeight;
      const isMotif = n === motif;
      if (isMotif && inX >= markerX && inX < markerX + MARKER && inY >= markerY && inY < markerY + MARKER) return WHITE;
      const text = String(n);
      if (digitPixel(text, inX - DIGIT_INSET, inY - DIGIT_INSET)) return isMotif || n % 2 === 0 ? WHITE : BLACK;
      return cellColor(n, motif);
    },
  };
}

/** The pixel at the centre of cell `n`, which holds no digit. */
export function cellCentre(raster: Raster, n: number): { x: number; y: number } {
  const column = (n - 1) % raster.columns;
  const row = Math.floor((n - 1) / raster.columns);
  return { x: ((column + 0.5) * raster.width) / raster.columns, y: ((row + 0.5) * raster.height) / raster.rows };
}

/** The number of the cell whose colour `rgb` is closest to, 0 for the white marker of the motif. */
export function identifyCell(raster: Raster, rgb: readonly number[]): number {
  let best = 0;
  let bestDistance = Infinity;
  const candidates: [number, Rgb][] = [[0, WHITE]];
  for (let n = 1; n <= raster.columns * raster.rows; n += 1) candidates.push([n, cellColor(n, raster.motif)]);
  for (const [n, colour] of candidates) {
    const distance = colour.reduce((sum, value, i) => sum + (value - (rgb[i] ?? 0)) ** 2, 0);
    if (distance < bestDistance) {
      best = n;
      bestDistance = distance;
    }
  }
  return best;
}

/** The PNG of a raster. */
export function rasterPng(raster: Raster): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < raster.height; y += 1) {
    const row = Buffer.alloc(1 + raster.width * 3);
    for (let x = 0; x < raster.width; x += 1) {
      const rgb = raster.at(x, y);
      for (let c = 0; c < 3; c += 1) row[1 + x * 3 + c] = rgb[c] ?? 0;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(raster.width, 0);
  header.writeUInt32BE(raster.height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
