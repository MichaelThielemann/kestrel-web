import type { Page } from "@playwright/test";
import { centredCrop, cropForRatio, type Framing, type PixelCrop } from "@michaelthielemann/kestrel-images-default/framing";
import type { Raster, Rgb } from "./png.ts";

/** A place in a shown picture, as fractions of its width and height. */
export interface Probe {
  x: number;
  y: number;
}

const PROBE_COLUMNS = 7;
const PROBE_ROWS = 6;
const MAX_DISTANCE = 48;
const MIN_FLAT = 12;

/** A regular lattice of probes over a shown picture. */
export const PROBES: Probe[] = Array.from({ length: PROBE_COLUMNS * PROBE_ROWS }, (_, i) => ({
  x: (Math.floor(i / PROBE_ROWS) + 0.5) / PROBE_COLUMNS,
  y: ((i % PROBE_ROWS) + 0.5) / PROBE_ROWS,
}));

/** Where a picture is read: a URL the page can fetch, or the bytes of a PNG such as an element screenshot. */
export type PixelSource = { url: string } | { png: Buffer };

/** The colours of a picture at the probes, decoded by the browser (a variant's bytes as served, or a screenshot). */
export async function readProbes(page: Page, source: PixelSource, probes: readonly Probe[] = PROBES): Promise<Rgb[]> {
  const input = "url" in source ? { url: source.url, data: null } : { url: null, data: source.png.toString("base64") };
  return page.evaluate(async ({ url, data, points }) => {
    const response = await fetch(url ?? `data:image/png;base64,${data ?? ""}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no 2d canvas");
    context.drawImage(bitmap, 0, 0);
    return points.map((point): [number, number, number] => {
      const [r = 0, g = 0, b = 0] = context.getImageData(Math.min(bitmap.width - 1, Math.floor(point.x * bitmap.width)), Math.min(bitmap.height - 1, Math.floor(point.y * bitmap.height)), 1, 1).data;
      return [r, g, b];
    });
  }, { url: input.url, data: input.data, points: [...probes] });
}

/** The crop an editor tile or a rendered `cover` variant of a ratio shows: the framing's crop, else the centred one. */
export function shownCrop(framing: Framing, key: string, width: number, height: number): PixelCrop {
  const crop = cropForRatio(framing, key, width, height) ?? centredCrop(key, width, height);
  if (crop === null) throw new Error(`no crop for ${key}`);
  return crop;
}

/** The colour the raster has at a probe of the part `crop` of it, or `null` where a cell border lies within `guard` pixels. */
export function expectedAt(raster: Raster, crop: PixelCrop, probe: Probe, guard: number): Rgb | null {
  const x = crop.left + probe.x * crop.width;
  const y = crop.top + probe.y * crop.height;
  const centre = raster.at(Math.floor(x), Math.floor(y));
  for (const dx of [-guard, 0, guard]) {
    for (const dy of [-guard, 0, guard]) {
      const near = raster.at(Math.max(0, Math.min(raster.width - 1, Math.floor(x + dx))), Math.max(0, Math.min(raster.height - 1, Math.floor(y + dy))));
      if (near.some((value, i) => value !== centre[i])) return null;
    }
  }
  return centre;
}

/** How many probes could be compared, and how many of those show another colour than the raster has there. */
export interface Comparison {
  compared: number;
  wrong: number;
}

/**
 * Compares the colours read from a shown picture with the raster part `crop` that it is meant to show.
 * `shownWidth` is the picture's width in pixels, which sets how far from a cell border a probe must lie.
 */
export function compareToRaster(raster: Raster, crop: PixelCrop, read: readonly Rgb[], shownWidth: number, probes: readonly Probe[] = PROBES): Comparison {
  const guard = Math.ceil((crop.width / shownWidth) * 3) + 2;
  let compared = 0;
  let wrong = 0;
  probes.forEach((probe, i) => {
    const expected = expectedAt(raster, crop, probe, guard);
    const seen = read[i];
    if (expected === null || seen === undefined) return;
    compared += 1;
    if (Math.hypot(...expected.map((value, c) => value - (seen[c] ?? 0))) > MAX_DISTANCE) wrong += 1;
  });
  return { compared, wrong };
}

/** Whether a shown picture is the raster part `crop`: enough probes comparable and none of them another colour. */
export function showsRaster(raster: Raster, crop: PixelCrop, read: readonly Rgb[], shownWidth: number): boolean {
  const { compared, wrong } = compareToRaster(raster, crop, read, shownWidth);
  return compared >= MIN_FLAT && wrong === 0;
}
