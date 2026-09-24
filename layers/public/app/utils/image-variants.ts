import type { MediaItem, MediaVariant } from '#kestrel-core/app/types/api'

export interface ImageSources {
  src: string
  srcset: string | null
  width: number | null
  height: number | null
  /** Whether `src` links a named variant rather than the original: the box must be forced to this size, since the placeholder (the original) may have a different aspect than the render will. */
  variant: boolean
}

const RATIO_TOLERANCE = 0.01

function ratioOf(v: { width: number; height: number }): number {
  return v.width / v.height
}

function sameRatio(a: number, b: number): boolean {
  return Math.abs(a - b) <= b * RATIO_TOLERANCE
}

export function pickImageSources(
  item: MediaItem | null,
  size: string,
  only?: readonly string[],
): ImageSources | null {
  if (item === null) return null

  const named = item.variants.find((v) => v.size === size)
  const src = named ? named.path : item.path
  const width = named ? named.width : item.width
  const height = named ? named.height : item.height

  const referenceRatio = named
    ? ratioOf(named)
    : item.width && item.height
      ? ratioOf({ width: item.width, height: item.height })
      : null

  const candidates = referenceRatio === null ? [] : restrict(item.variants, referenceRatio, only)
  const srcset = candidates.length === 0 ? null : candidates.map((v) => `${v.path} ${v.width}w`).join(', ')

  return { src, srcset, width, height, variant: named !== undefined }
}

function restrict(variants: readonly MediaVariant[], referenceRatio: number, only?: readonly string[]): MediaVariant[] {
  const filtered = variants.filter((v) => v.width > 0 && v.height > 0 && sameRatio(ratioOf(v), referenceRatio) && (!only || only.includes(v.size)))
  const byWidth = new Map<number, MediaVariant>()
  for (const v of filtered) if (!byWidth.has(v.width)) byWidth.set(v.width, v)
  return [...byWidth.values()].sort((a, b) => a.width - b.width)
}
