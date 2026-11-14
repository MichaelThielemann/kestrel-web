function riffChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(type, 0, "ascii");
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

function exifOrientation(orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "ascii");
  tiff.writeUInt16BE(0x2a, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  return tiff;
}

function chunksOf(webp: Buffer): { type: string; bytes: Buffer }[] {
  if (webp.subarray(0, 4).toString("ascii") !== "RIFF" || webp.subarray(8, 12).toString("ascii") !== "WEBP") throw new Error("expected a WebP");
  const chunks: { type: string; bytes: Buffer }[] = [];
  for (let at = 12; at + 8 <= webp.length;) {
    const size = webp.readUInt32LE(at + 4);
    const end = at + 8 + size + (size % 2);
    chunks.push({ type: webp.subarray(at, at + 4).toString("ascii"), bytes: webp.subarray(at, end) });
    at = end;
  }
  return chunks;
}

/** A still WebP rewritten as an extended WebP that carries an EXIF orientation tag. */
export function withExifOrientation(webp: Buffer, width: number, height: number, orientation: number): Buffer {
  const image = chunksOf(webp).filter((chunk) => chunk.type === "ALPH" || chunk.type === "VP8 " || chunk.type === "VP8L");
  if (!image.some((chunk) => chunk.type !== "ALPH")) throw new Error("expected a still WebP");
  const header = Buffer.alloc(10);
  header.writeUInt8(0x08 | (image.some((chunk) => chunk.type === "ALPH") ? 0x10 : 0), 0);
  header.writeUIntLE(width - 1, 4, 3);
  header.writeUIntLE(height - 1, 7, 3);
  const body = Buffer.concat([Buffer.from("WEBP", "ascii"), riffChunk("VP8X", header), ...image.map((chunk) => chunk.bytes), riffChunk("EXIF", exifOrientation(orientation))]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}
