import type { ImageMedia, PublicMediaVariant } from './public-shapes'

/** The fields of a declared image size `pickImageSources` reads to tell a `cover` size, cut by the server, from an `inside` one. */
export interface DeclaredImageSize {
  name: string
  width: number
  height?: number
  fit: 'inside' | 'cover'
}

export interface ImageSources {
  src: string
  srcset: string | null
  width: number | null
  height: number | null
  /** Whether `src` links a named variant rather than the original: the box must be forced to this size, since the placeholder (the original) may have a different aspect than the render will. */
  variant: boolean
  /** Whether `src` links a variant of a declared `cover` size: the server cut it around the focus or a manual crop, so the focus no longer sits where it does on the original. */
  cut: boolean
}

const RATIO_TOLERANCE = 0.01
const EDGE_TOLERANCE = 1

function ratioOf(v: { width: number; height: number }): number {
  return v.width / v.height
}

function sameRatio(a: number, b: number): boolean {
  return Math.abs(a - b) <= b * RATIO_TOLERANCE
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function coverKeys(sizes: readonly DeclaredImageSize[]): Map<string, string> {
  const keys = new Map<string, string>()
  for (const size of sizes) {
    if (size.fit !== 'cover' || !size.height || size.width < 1) continue
    const d = gcd(size.width, size.height)
    keys.set(size.name, `${size.width / d}:${size.height / d}`)
  }
  return keys
}

type Crop = NonNullable<PublicMediaVariant['crop']>
type Box = { width: number; height: number }

function overlapsRatio(a: Box, b: Box): boolean {
  return (a.width - 0.5) / (a.height + 0.5) <= (b.width + 0.5) / (b.height - 0.5)
    && (b.width - 0.5) / (b.height + 0.5) <= (a.width + 0.5) / (a.height - 0.5)
}

function nearCrop(a: Crop, b: Crop): boolean {
  return Math.abs(a.left - b.left) <= EDGE_TOLERANCE && Math.abs(a.top - b.top) <= EDGE_TOLERANCE
    && Math.abs(a.left + a.width - b.left - b.width) <= EDGE_TOLERANCE && Math.abs(a.top + a.height - b.top - b.height) <= EDGE_TOLERANCE
}

function nearCentre(crop: Crop, image: Box): boolean {
  if (crop.left + crop.width > image.width || crop.top + crop.height > image.height) return false
  if (crop.width < image.width - EDGE_TOLERANCE && crop.height < image.height - EDGE_TOLERANCE) return false
  return Math.abs(crop.left - (image.width - crop.width) / 2) <= EDGE_TOLERANCE && Math.abs(crop.top - (image.height - crop.height) / 2) <= EDGE_TOLERANCE
}

function sameCrop(a: Crop | null, b: Crop | null, item: ImageMedia): boolean {
  if (a !== null && b !== null) return nearCrop(a, b)
  const cut = a ?? b
  if (cut === null) return true
  if (!item.width || !item.height) return false
  return nearCentre(cut, { width: item.width, height: item.height }) || nearCentre(cut, { width: item.height, height: item.width })
}

function sameCutAs(item: ImageMedia, named: PublicMediaVariant | undefined, reference: Box | null, keys: ReadonlyMap<string, string>): (v: PublicMediaVariant) => boolean {
  const carriesCrop = named ? named.crop !== undefined : item.variants.some((v) => v.crop !== undefined)
  if (carriesCrop) {
    const crop = named?.crop ?? null
    return (v) => v.crop !== undefined && reference !== null && overlapsRatio(v, reference) && sameCrop(v.crop, crop, item)
  }
  const key = named ? keys.get(named.size) : undefined
  return (v) => v.crop === undefined && reference !== null && sameRatio(ratioOf(v), ratioOf(reference))
    && (key === undefined ? !keys.has(v.size) : keys.get(v.size) === key)
}

/**
 * The `src`, `srcset` and box of an image for a size name. A `srcset` never mixes pictures: it lists the variants
 * with the aspect ratio of the named variant (or of the original), where two ratios match when the ranges their
 * whole-pixel dimensions round from overlap, and whose `crop` equals the named variant's (`null` for the original).
 * Crops count as equal when every edge lies within a pixel of the other's, and a crop within a pixel of the centred
 * cut on the original counts as `null`, so variants that show the same part of the image share one `srcset` and a
 * variant cut differently gets one of its own. When the variants carry no `crop` (an anonymous grant without
 * `variants[].crop`), ratios match within 1 %, a declared `cover` size lists the variants of the `cover` sizes with
 * its exact ratio key, and any other size the variants of its ratio that no declared `cover` size renders. `sizes`
 * are the declared image sizes.
 */
export function pickImageSources(
  item: ImageMedia | null,
  size: string,
  only?: readonly string[],
  sizes: readonly DeclaredImageSize[] = [],
): ImageSources | null {
  if (item === null) return null

  const named = item.variants.find((v) => v.size === size && v.width > 0 && v.height > 0)
  const src = named ? named.path : item.path
  const width = named ? named.width : item.width
  const height = named ? named.height : item.height

  const reference = named ?? (item.width && item.height ? { width: item.width, height: item.height } : null)

  const keys = coverKeys(sizes)
  const sameCut = sameCutAs(item, named, reference, keys)
  const ordered = named ? [named, ...item.variants.filter((v) => v !== named)] : item.variants
  const candidates = restrict(ordered.filter(sameCut), only)
  const srcset = candidates.length === 0 ? null : candidates.map((v) => `${v.path} ${v.width}w`).join(', ')

  return { src, srcset, width, height, variant: named !== undefined, cut: named !== undefined && keys.has(named.size) }
}

function restrict(variants: readonly PublicMediaVariant[], only?: readonly string[]): PublicMediaVariant[] {
  const filtered = variants.filter((v) => v.width > 0 && v.height > 0 && (!only || only.includes(v.size)))
  const byWidth = new Map<number, PublicMediaVariant>()
  for (const v of filtered) if (!byWidth.has(v.width)) byWidth.set(v.width, v)
  return [...byWidth.values()].sort((a, b) => a.width - b.width)
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 10000) / 100}%`
}

/** The CSS `object-position` that keeps an image's focus in view: the centre of the focus rectangle as percentages of the image, `undefined` without a focus. */
export function focusObjectPosition(focus: ImageMedia['focus']): string | undefined {
  if (focus === null || focus === undefined) return undefined
  return `${percent(focus.x + focus.w / 2)} ${percent(focus.y + focus.h / 2)}`
}
