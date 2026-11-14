import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { numberedGrid } from "../support/png.ts";

const resolveFrom = createRequire(createRequire(import.meta.url).resolve("@michaelthielemann/kestrel-images-default"));
const sharp = resolveFrom("sharp");

const grid = numberedGrid();
const raw = Buffer.alloc(grid.width * grid.height * 3);
for (let y = 0; y < grid.height; y += 1) {
  for (let x = 0; x < grid.width; x += 1) raw.set(grid.at(x, y), (y * grid.width + x) * 3);
}

const jpeg = await sharp(raw, { raw: { width: grid.width, height: grid.height, channels: 3 } })
  .rotate(270)
  .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
  .withMetadata({ orientation: 6 })
  .toBuffer();
writeFileSync(new URL("./numbered-grid-turned.jpg", import.meta.url), jpeg);
