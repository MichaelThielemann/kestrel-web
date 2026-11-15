import { centredCrop, focusFits } from '@michaelthielemann/kestrel-images-default/framing'
import type { FramingDraft } from './media-crop'

/** Why the focus does not fit a ratio: taller or wider than the largest crop of the ratio, or hidden by a manual crop it would fit into. */
export type FocusMiss = 'tall' | 'wide' | 'covered'

/** Every kind of miss, in the order the crop editor lists them. */
export const FOCUS_MISSES: readonly FocusMiss[] = ['tall', 'wide', 'covered']

const SLACK = 1

/**
 * Why the focus of the draft does not fit the crop the ratio `key` renders with on an image `width` x `height` pixels, by
 * the server's own `focusFits` and `centredCrop`; `null` without a focus, while the dimensions are unknown, or when it fits.
 * A manual crop that cuts a focus the largest crop could hold is `covered`; an automatic crop is centred on the focus, so it
 * only misses a focus that sticks out of the largest crop, and that on one side only.
 */
export function focusMiss(draft: FramingDraft, key: string, width: number, height: number): FocusMiss | null {
  const focus = draft.focus
  if (!focus || width <= 0 || height <= 0 || focusFits(draft, key, width, height)) return null
  const largest = centredCrop(key, width, height)
  if (!largest) return null
  if (Object.hasOwn(draft.crops, key)) {
    if (focus.h * height > largest.height + SLACK) return 'tall'
    if (focus.w * width > largest.width + SLACK) return 'wide'
    return 'covered'
  }
  return (focus.h * height) / largest.height >= (focus.w * width) / largest.width ? 'tall' : 'wide'
}

/** The ratio keys of `misses` grouped by why the focus misses them, each group in the order of `misses`. */
export function missesByKind(misses: Readonly<Record<string, FocusMiss | null>>): Record<FocusMiss, string[]> {
  const groups: Record<FocusMiss, string[]> = { tall: [], wide: [], covered: [] }
  for (const [key, miss] of Object.entries(misses)) if (miss) groups[miss].push(key)
  return groups
}
