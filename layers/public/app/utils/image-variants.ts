import type { MediaItem, MediaVariant } from '../../../core/app/types/api'

export interface ImageSources {
  src: string
  srcset: string | null
  width: number | null
  height: number | null
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
  const useNamed = named?.state === 'done' && named.width > 0 && named.height > 0

  const src = named ? named.path : `/api/media/${encodeURIComponent(item.id)}/file`
  const width = useNamed ? named.width : item.width
  const height = useNamed ? named.height : item.height

  const referenceRatio = useNamed
    ? ratioOf(named)
    : item.width && item.height
      ? ratioOf({ width: item.width, height: item.height })
      : null

  const done = item.variants.filter((v) => v.state === 'done' && v.width > 0 && v.height > 0)
  const candidates = referenceRatio === null ? [] : restrict(done, referenceRatio, only)
  const srcset = candidates.length === 0 ? null : candidates.map((v) => `${v.path} ${v.width}w`).join(', ')

  return { src, srcset, width, height }
}

function restrict(done: MediaVariant[], referenceRatio: number, only?: readonly string[]): MediaVariant[] {
  const filtered = done.filter((v) => sameRatio(ratioOf(v), referenceRatio) && (!only || only.includes(v.size)))
  const byWidth = new Map<number, MediaVariant>()
  for (const v of filtered) if (!byWidth.has(v.width)) byWidth.set(v.width, v)
  return [...byWidth.values()].sort((a, b) => a.width - b.width)
}
