import type { PixelCrop } from '@michaelthielemann/kestrel-images-default/framing'
import type { MediaRect } from '../types/api'

/** Where a focus lies over a crop, in percent of the crop; it reaches past the crop where the crop cuts it. */
export interface FocusBox {
  left: number
  top: number
  width: number
  height: number
  point: boolean
}

function percent(value: number): number {
  return Math.round(value * 100000) / 1000
}

/** The focus, normalised to an image `width` x `height` pixels, in percent of `crop`, the box a crop preview or frame draws its outline in. */
export function focusBox(focus: MediaRect, crop: PixelCrop, width: number, height: number): FocusBox {
  return {
    left: percent((focus.x * width - crop.left) / crop.width),
    top: percent((focus.y * height - crop.top) / crop.height),
    width: percent((focus.w * width) / crop.width),
    height: percent((focus.h * height) / crop.height),
    point: focus.w === 0 && focus.h === 0,
  }
}
