import { describe, expect, it } from 'vitest'
import { centredCrop, cropForRatio } from '@michaelthielemann/kestrel-images-default/framing'
import type { MediaItem } from '../types/api'
import { canFrame, coverSizesOf, cropSource, displayCrop, previewStyle, rebaseDraft, sameFraming, smallerSizes, uniqueReferrers } from './media-crop'

function item(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'm1', filename: 'a.jpg', folder: '', contentType: 'image/jpeg', size: 1, path: '/media/m1/a.jpg', available: true,
    createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: 1200, height: 800,
    alt: null, title: null, description: null, variants: [], variantCounts: { done: 0, pending: 0, error: 0, failed: 0 },
    focus: null, framing: { focus: null, crops: {}, width: 1200, height: 800, ratios: [] },
    ...over,
  }
}

describe('canFrame', () => {
  it('accepts an image whose oriented dimensions are known', () => {
    expect(canFrame(item())).toBe(true)
  })

  it('refuses a file that is not an image, or an image not yet planned', () => {
    expect(canFrame(item({ contentType: 'application/pdf' }))).toBe(false)
    expect(canFrame(item({ framing: { focus: null, crops: {}, width: null, height: null, ratios: [] } }))).toBe(false)
    expect(canFrame(null)).toBe(false)
  })
})

describe('cropSource', () => {
  const variant = (size: string, width: number, state: 'done' | 'pending' = 'done', height = Math.round(width * 2 / 3)) => ({ size, width, height, format: 'webp', bytes: 1, state, path: `/media/m1/variants/${size}.webp` })
  const ratios = [{ key: '1:1', sizes: ['avatar'], manual: false, fits: true, crop: null }]

  it('shows the original when a browser displays its type', () => {
    expect(cropSource(item())).toBe('/media/m1/a.jpg')
  })

  it('shows the largest finished variant that keeps the whole image when a browser cannot display the original', () => {
    const tiff = item({
      contentType: 'image/tiff',
      path: '/media/m1/a.tif',
      variants: [variant('small', 640), variant('avatar', 2000), variant('large', 1600), variant('xl', 2400, 'pending')],
      framing: { focus: null, crops: {}, width: 1200, height: 800, ratios },
    })
    expect(cropSource(tiff)).toBe('/media/m1/variants/large.webp')
  })

  it('shows the largest finished whole-image variant for a WebP original, whose orientation tag browsers ignore', () => {
    const webp = item({
      contentType: 'image/webp',
      path: '/media/m1/a.webp',
      width: 1200,
      height: 800,
      variants: [variant('small', 427, 'done', 640), variant('avatar', 2000, 'done', 2000), variant('large', 1067, 'done', 1600)],
      framing: { focus: null, crops: {}, width: 800, height: 1200, ratios },
    })
    expect(cropSource(webp)).toBe('/media/m1/variants/large.webp')
  })

  it('does not show a WebP original whose stored and oriented dimensions are equal, as a mirrored or upside-down one has them', () => {
    const webp = item({ contentType: 'image/webp', path: '/media/m1/a.webp', width: 800, height: 400, variants: [variant('large', 1600, 'pending', 800)], framing: { focus: null, crops: {}, width: 800, height: 400, ratios: [] } })
    expect(cropSource(webp)).toBeNull()
    expect(canFrame(webp)).toBe(false)
  })

  it('has nothing to show for a WebP original stored on its side before a whole-image variant is finished', () => {
    const webp = item({
      contentType: 'image/webp',
      path: '/media/m1/a.webp',
      width: 800,
      height: 400,
      variants: [variant('avatar', 96, 'done', 96), variant('large', 800, 'pending', 1600)],
      framing: { focus: null, crops: {}, width: 400, height: 800, ratios },
    })
    expect(cropSource(webp)).toBeNull()
    expect(canFrame(webp)).toBe(false)
  })

  it('takes a whole-image variant only with the aspect of the oriented original, not a leftover cut of a size no longer declared', () => {
    const heic = item({
      contentType: 'image/heic',
      path: '/media/m1/a.heic',
      width: 4000,
      height: 3000,
      variants: [variant('banner', 3000, 'done', 1000), variant('xl', 2400, 'done', 1800), variant('large', 1600, 'done', 1200)],
      framing: { focus: null, crops: {}, width: 4000, height: 3000, ratios },
    })
    expect(cropSource(heic)).toBe('/media/m1/variants/xl.webp')
  })

  it('has nothing to show when every finished variant is cut to another aspect', () => {
    const heic = item({
      contentType: 'image/heic',
      width: 4000,
      height: 3000,
      variants: [variant('banner', 3000, 'done', 1000)],
      framing: { focus: null, crops: {}, width: 4000, height: 3000, ratios: [] },
    })
    expect(cropSource(heic)).toBeNull()
    expect(canFrame(heic)).toBe(false)
  })

  it('has nothing to show for such an original before a whole-image variant is finished', () => {
    const tiff = item({ contentType: 'image/tiff', variants: [variant('avatar', 96), variant('large', 1600, 'pending')], framing: { focus: null, crops: {}, width: 1200, height: 800, ratios } })
    expect(cropSource(tiff)).toBeNull()
    expect(canFrame(tiff)).toBe(false)
  })
})

describe('displayCrop', () => {
  it('shows the centre without a framing, exactly as the server cuts it', () => {
    expect(displayCrop({ focus: null, crops: {} }, '1:1', 1200, 800)).toEqual(centredCrop('1:1', 1200, 800))
  })

  it('follows the focus and a manual crop with the server functions', () => {
    const focus = { x: 0.8, y: 0.1, w: 0.1, h: 0.1 }
    expect(displayCrop({ focus, crops: {} }, '1:1', 1200, 800)).toEqual(cropForRatio({ focus, crops: {} }, '1:1', 1200, 800))
    const crops = { '1:1': { x: 0, y: 0, w: 0.25, h: 0.375 } }
    expect(displayCrop({ focus, crops }, '1:1', 1200, 800)).toEqual({ left: 0, top: 0, width: 300, height: 300 })
  })
})

describe('previewStyle', () => {
  it('scales and shifts the original so the crop fills the tile', () => {
    expect(previewStyle({ left: 300, top: 200, width: 600, height: 400 }, 1200)).toEqual({ width: '200%', left: '-50%', top: '-50%' })
  })
})

describe('smallerSizes', () => {
  const sizes = [
    { name: 'teaser', width: 480, height: 320, fit: 'cover' as const },
    { name: 'wide', width: 1500, height: 1000, fit: 'cover' as const },
    { name: 'content', width: 1200, fit: 'inside' as const },
  ]

  it('names the sizes of the ratio that are larger than the crop', () => {
    expect(smallerSizes({ left: 0, top: 0, width: 600, height: 400 }, ['teaser', 'wide'], sizes)).toEqual(['wide'])
  })

  it('names none when the crop covers every size, and ignores unknown sizes', () => {
    expect(smallerSizes({ left: 0, top: 0, width: 1500, height: 1000 }, ['teaser', 'wide', 'gone'], sizes)).toEqual([])
  })
})

describe('coverSizesOf', () => {
  it('keeps the cover sizes of the given names', () => {
    const sizes = [{ name: 'a', width: 10, height: 10, fit: 'cover' as const }, { name: 'b', width: 10, fit: 'inside' as const }]
    expect(coverSizesOf(sizes).map((s) => s.name)).toEqual(['a'])
  })
})

describe('sameFraming', () => {
  it('compares focus and crops by value', () => {
    const a = { focus: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, crops: { '1:1': { x: 0, y: 0, w: 0.5, h: 0.5 } } }
    expect(sameFraming(a, structuredClone(a))).toBe(true)
    expect(sameFraming(a, { ...a, focus: null })).toBe(false)
    expect(sameFraming(a, { ...a, crops: {} })).toBe(false)
    expect(sameFraming(a, { ...a, crops: { '1:1': { x: 0, y: 0, w: 0.5, h: 0.4 } } })).toBe(false)
  })
})

describe('uniqueReferrers', () => {
  it('counts each referring record once, whatever field refers', () => {
    expect(uniqueReferrers([
      { type: 'pages', id: 'p1', field: 'hero' },
      { type: 'pages', id: 'p1', field: 'body' },
      { type: 'posts', id: 'p1', field: 'cover' },
    ])).toBe(2)
  })
})

describe('rebaseDraft', () => {
  const a = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }
  const b = { x: 0.5, y: 0.5, w: 0.3, h: 0.3 }
  const c = { x: 0, y: 0.2, w: 1, h: 0.5 }

  it('takes the newer stored framing where the draft is unchanged', () => {
    const base = { focus: null, crops: {} }
    const fresh = { focus: a, crops: { '1:1': c } }
    expect(rebaseDraft(base, base, fresh)).toEqual(fresh)
  })

  it('keeps what the draft changed and takes the rest from the newer stored framing', () => {
    const base = { focus: null, crops: { '3:2': c } }
    const draft = { focus: null, crops: { '1:1': b } }
    const fresh = { focus: a, crops: { '3:2': c, '21:9': c } }
    expect(rebaseDraft(draft, base, fresh)).toEqual({ focus: a, crops: { '1:1': b, '21:9': c } })
    expect(rebaseDraft({ focus: b, crops: {} }, { focus: null, crops: {} }, { focus: a, crops: {} })).toEqual({ focus: b, crops: {} })
  })
})
