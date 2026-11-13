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

/** Whether the item is an image whose oriented dimensions the server reported, so its focus and crops can be edited. */
export function canFrame(item: MediaItem | null): boolean {
  if (!item || !item.contentType.startsWith('image/')) return false
  return item.framing.width !== null && item.framing.height !== null
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

/** The number of records that refer to a medium, counting a record once whatever fields refer. */
export function uniqueReferrers(refs: readonly ReferenceTo[]): number {
  return new Set(refs.map((ref) => `${ref.type}/${ref.id}`)).size
}
