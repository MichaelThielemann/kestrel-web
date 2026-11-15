import type { MediaVariant, MediaVariantCounts } from '#kestrel-admin/types/api'

export type VariantChipState = 'pending' | 'failed' | null

const MIN_THUMB_WIDTH = 256

export function variantChipState(counts: MediaVariantCounts, available?: boolean): VariantChipState {
  if (available === false) return 'pending'
  if (counts.pending > 0) return 'pending'
  if (counts.error + counts.failed > 0) return 'failed'
  return null
}

export function variantTotal(counts: MediaVariantCounts): number {
  return counts.done + counts.pending + counts.error + counts.failed
}

/** The variant chip of a tile: its state and counts, `stalled` while the variants have taken too long; `null` without a polled entry or with nothing to show. */
export function variantChip(entry: { variantCounts: MediaVariantCounts; available?: boolean } | undefined, stalled: boolean) {
  if (!entry) return null
  const counts = { done: entry.variantCounts.done, total: variantTotal(entry.variantCounts) }
  if (stalled) return { state: 'pending' as const, stalled: true, ...counts }
  const state = variantChipState(entry.variantCounts, entry.available)
  return state ? { state, stalled: false, ...counts } : null
}

/** The chip a tile shows from the counts its list entry carries when nothing polls its variants: failed sizes with none pending, else `null`. */
export function storedVariantChip(file: { variantCounts?: MediaVariantCounts }) {
  const counts = file.variantCounts
  if (!counts || variantChipState(counts) !== 'failed') return null
  return { state: 'failed' as const, stalled: false, done: counts.done, total: variantTotal(counts) }
}

export function pickVariantThumb(variants: readonly MediaVariant[]): MediaVariant | null {
  let best: MediaVariant | null = null
  for (const variant of variants) {
    if (variant.state !== 'done' || variant.width < MIN_THUMB_WIDTH) continue
    if (!best || variant.width < best.width) best = variant
  }
  return best
}
