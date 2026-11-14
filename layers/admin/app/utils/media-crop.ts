import { centredCrop, cropForRatio, type PixelCrop } from '@michaelthielemann/kestrel-images-default/framing'
import type { MediaItem, MediaRect, ReferenceTo } from '../types/api'

/** The focus and manual crops an editor works on, the body of `PUT /media/:id/framing`. */
export interface FramingDraft {
  focus: MediaRect | null
  crops: Record<string, MediaRect>
}

/** The fields of an image size the crop editor reads. */
export interface CropSize {
  name: string
  width: number
  height?: number
  fit: 'inside' | 'cover'
}

const BROWSER_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/avif', 'image/apng', 'image/bmp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'])

const ASPECT_TOLERANCE = 0.01

function wholeVariant(item: MediaItem): string | null {
  const { width, height } = item.framing
  if (!width || !height) return null
  const cut = new Set(item.framing.ratios.flatMap((ratio) => ratio.sizes))
  const aspect = width / height
  const whole = item.variants.filter((v) => v.state === 'done' && v.crop === null && v.width > 0 && v.height > 0 && !cut.has(v.size)
    && Math.abs(v.width / v.height / aspect - 1) <= ASPECT_TOLERANCE)
  return whole.reduce<typeof whole[number] | null>((best, v) => (best === null || v.width > best.width ? v : best), null)?.path ?? null
}

/**
 * The URL the crop editor shows the whole image from: the original when browsers display its type with its
 * orientation applied, else the largest finished variant that shows the whole image (no `crop`), is not cut to a ratio and has the aspect
 * of the oriented original, so every rectangle and crop applies to it alike. A WebP original, whose orientation tag
 * browsers ignore, is never shown itself, so it has `null`, like any other original, while there is no such variant.
 */
export function cropSource(item: MediaItem): string | null {
  if (BROWSER_IMAGE_TYPES.has(item.contentType)) return item.path
  return wholeVariant(item)
}

/**
 * Whether the browser has to measure the original to learn its oriented dimensions: the server reports none for
 * an image whose variants were rendered before it recorded them, and a browser applies the orientation to an
 * original it displays, so its `naturalWidth`/`naturalHeight` stand in for them.
 */
export function measuresOriginal(item: MediaItem): boolean {
  return (item.framing.width === null || item.framing.height === null) && BROWSER_IMAGE_TYPES.has(item.contentType)
    && item.variants.some((v) => v.state === 'done')
}

/** Whether the item is an image whose oriented dimensions the server reported, or the browser can measure, and that the editor can show, so its focus and crops can be edited. */
export function canFrame(item: MediaItem | null): boolean {
  if (!item || !item.contentType.startsWith('image/')) return false
  if (measuresOriginal(item)) return true
  return item.framing.width !== null && item.framing.height !== null && cropSource(item) !== null
}

/** The pixel crop the ratio renders with under the draft: its manual crop, else around the focus, else the centre. */
export function displayCrop(draft: FramingDraft, key: string, width: number, height: number): PixelCrop | null {
  return cropForRatio(draft, key, width, height) ?? centredCrop(key, width, height)
}

function percent(value: number): string {
  return `${Math.round(value * 10000) / 100}%`
}

/** The position of the original, `width` pixels wide after its orientation, inside a tile of the crop's ratio, so the tile shows exactly the crop. */
export function previewStyle(crop: PixelCrop, width: number): { width: string, left: string, top: string } {
  return { width: percent(width / crop.width), left: percent(-crop.left / crop.width), top: percent(-crop.top / crop.height) }
}

/** The `cover` sizes among the declared ones. */
export function coverSizesOf<T extends CropSize>(sizes: readonly T[]): T[] {
  return sizes.filter((size) => size.fit === 'cover')
}

/** The names of the sizes in `names` that are wider or taller than the crop, so their variant is delivered smaller than declared. */
export function smallerSizes(crop: PixelCrop, names: readonly string[], sizes: readonly CropSize[]): string[] {
  return names.filter((name) => {
    const size = sizes.find((s) => s.name === name && s.fit === 'cover')
    return size !== undefined && (size.width > crop.width || (size.height ?? 0) > crop.height)
  })
}

function sameRect(a: MediaRect | null | undefined, b: MediaRect | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/** Whether two framings hold the same focus and the same crops. */
export function sameFraming(a: FramingDraft, b: FramingDraft): boolean {
  const keys = Object.keys(a.crops)
  if (keys.length !== Object.keys(b.crops).length) return false
  return sameRect(a.focus, b.focus) && keys.every((key) => sameRect(a.crops[key], b.crops[key]))
}

/** `fresh` with the changes `draft` made to `base` laid over it: the focus and each crop the draft changed, set or removed. */
export function rebaseDraft(draft: FramingDraft, base: FramingDraft, fresh: FramingDraft): FramingDraft {
  const focus = sameRect(draft.focus, base.focus) ? fresh.focus : draft.focus
  const changed = new Set([...Object.keys(draft.crops), ...Object.keys(base.crops)].filter((key) => !sameRect(draft.crops[key], base.crops[key])))
  const kept = Object.entries(fresh.crops).filter(([key]) => !changed.has(key))
  const mine = Object.entries(draft.crops).filter(([key]) => changed.has(key))
  return { focus, crops: Object.fromEntries([...kept, ...mine]) }
}

/** The number of records that refer to a medium, counting a record once whatever fields refer. */
export function uniqueReferrers(refs: readonly ReferenceTo[]): number {
  return new Set(refs.map((ref) => `${ref.type}/${ref.id}`)).size
}
