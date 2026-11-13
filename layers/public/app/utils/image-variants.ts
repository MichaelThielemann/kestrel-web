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

function sameCrop(a: PublicMediaVariant['crop'], b: PublicMediaVariant['crop']): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return a === b
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

function sameCutAs(named: PublicMediaVariant | undefined, variants: readonly PublicMediaVariant[], keys: ReadonlyMap<string, string>): (v: PublicMediaVariant) => boolean {
  const carriesCrop = named ? named.crop !== undefined : variants.some((v) => v.crop !== undefined)
  if (carriesCrop) {
    const crop = named ? named.crop : null
    return (v) => v.crop !== undefined && sameCrop(v.crop, crop)
  }
  const key = named ? keys.get(named.size) : undefined
  return (v) => v.crop === undefined && (key === undefined ? !keys.has(v.size) : keys.get(v.size) === key)
}

/**
 * The `src`, `srcset` and box of an image for a size name. A `srcset` never mixes pictures: it lists the variants
 * with the ratio of the named variant (or of the original) whose `crop` equals the named variant's (`null` for the
 * original), so variants that show the same part of the image share one `srcset` and a variant cut differently
 * gets one of its own. When the variants carry no `crop` (an anonymous grant without `variants[].crop`), a declared
 * `cover` size lists the variants of the `cover` sizes with its exact ratio key, and any other size the variants of
 * its ratio that no declared `cover` size renders. `sizes` are the declared image sizes.
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

  const referenceRatio = named
    ? ratioOf(named)
    : item.width && item.height
      ? ratioOf({ width: item.width, height: item.height })
      : null

  const keys = coverKeys(sizes)
  const sameCut = sameCutAs(named, item.variants, keys)
  const ordered = named ? [named, ...item.variants.filter((v) => v !== named)] : item.variants
  const candidates = referenceRatio === null ? [] : restrict(ordered.filter(sameCut), referenceRatio, only)
  const srcset = candidates.length === 0 ? null : candidates.map((v) => `${v.path} ${v.width}w`).join(', ')

  return { src, srcset, width, height, variant: named !== undefined, cut: named !== undefined && keys.has(named.size) }
}

function restrict(variants: readonly PublicMediaVariant[], referenceRatio: number, only?: readonly string[]): PublicMediaVariant[] {
  const filtered = variants.filter((v) => v.width > 0 && v.height > 0 && sameRatio(ratioOf(v), referenceRatio) && (!only || only.includes(v.size)))
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
