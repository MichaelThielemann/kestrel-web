import type { MediaVariant, MediaVariantCounts } from '#kestrel-admin/types/api'

export type VariantChipState = 'pending' | 'failed' | null

const MIN_THUMB_WIDTH = 256

export function variantChipState(counts: MediaVariantCounts): VariantChipState {
  if (counts.pending > 0) return 'pending'
  if (counts.error + counts.failed > 0) return 'failed'
  return null
}

export function variantTotal(counts: MediaVariantCounts): number {
  return counts.done + counts.pending + counts.error + counts.failed
}

export function pickVariantThumb(variants: readonly MediaVariant[]): MediaVariant | null {
  let best: MediaVariant | null = null
  for (const variant of variants) {
    if (variant.state !== 'done' || variant.width < MIN_THUMB_WIDTH) continue
    if (!best || variant.width < best.width) best = variant
  }
  return best
}
