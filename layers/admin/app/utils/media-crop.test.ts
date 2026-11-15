import { describe, expect, it } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
import { centredCrop, cropForRatio } from '@michaelthielemann/kestrel-images-default/framing'
import type { MediaItem } from '../types/api'
import { FOCUS_TILE, canFrame, coverSizesOf, dimensionsLabel, cropSource, displayCrop, initialTile, measuresOriginal, previewStyle, rebaseDraft, sameFraming, sizeUsages, smallerSizes, tileId, uniqueReferrers } from './media-crop'

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

  it('accepts an image browsers display whose variants were rendered before its oriented dimensions were recorded', () => {
    const unknown = { focus: null, crops: {}, width: null, height: null, ratios: [] }
    const done = { size: 'large', width: 1200, height: 800, format: 'webp', bytes: 1, state: 'done' as const, path: '/media/m1/variants/large.webp', crop: null }
    expect(canFrame(item({ framing: unknown, variants: [done] }))).toBe(true)
    expect(canFrame(item({ framing: unknown, variants: [{ ...done, state: 'failed' }] }))).toBe(false)
    expect(canFrame(item({ framing: unknown, variants: [done], contentType: 'image/webp', path: '/media/m1/a.webp' }))).toBe(false)
  })

  it('refuses an answer whose framing a role field grant cut to the visitor dimensions, without throwing', () => {
    const done = { size: 'large', width: 1200, height: 800, format: 'webp', bytes: 1, state: 'done' as const, path: '/media/m1/variants/large.webp', crop: null }
    const cut = (framing: { width: number | null, height: number | null }, over: Partial<MediaItem> = {}) => ({ ...item({ variants: [done], ...over }), framing })
    // @ts-expect-error a role's media field grant answers the framing with the visitor members only
    expect(canFrame(cut({ width: 1200, height: 800 }))).toBe(false)
    // @ts-expect-error a role's media field grant answers the framing with the visitor members only
    expect(canFrame(cut({ width: 1200, height: 800 }, { contentType: 'image/webp', path: '/media/m1/a.webp' }))).toBe(false)
    // @ts-expect-error a role's media field grant answers the framing with the visitor members only
    expect(cropSource(cut({ width: 1200, height: 800 }, { contentType: 'image/webp', path: '/media/m1/a.webp' }))).toBeNull()
    // @ts-expect-error a role's media field grant answers the framing with the visitor members only
    expect(canFrame(cut({ width: null, height: null }))).toBe(false)
    // @ts-expect-error a role's media field grant answers the framing with the visitor members only
    expect(measuresOriginal(cut({ width: null, height: null }))).toBe(false)
  })
})

describe('cropSource', () => {
  const variant = (size: string, width: number, state: 'done' | 'pending' = 'done', height = Math.round(width * 2 / 3)) => ({ size, width, height, format: 'webp', bytes: 1, state, path: `/media/m1/variants/${size}.webp`, crop: null })
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

  it('passes over a leftover variant of a size no longer declared that a manual crop cut to the original aspect', () => {
    const cutLeftover = { ...variant('hero-xl', 3200, 'done', 1800), crop: { left: 0, top: 0, width: 3600, height: 2025 } }
    const webp = item({
      contentType: 'image/webp',
      path: '/media/m1/a.webp',
      width: 4000,
      height: 2250,
      variants: [cutLeftover, variant('xl', 2400, 'done', 1350), variant('large', 1600, 'done', 900)],
      framing: { focus: null, crops: { '16:9': { x: 0, y: 0, w: 0.9, h: 0.9 } }, width: 4000, height: 2250, ratios },
    })
    expect(cropSource(webp)).toBe('/media/m1/variants/xl.webp')
    expect(canFrame(webp)).toBe(true)
    expect(canFrame(item({ ...webp, variants: [cutLeftover] }))).toBe(false)
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

describe('sizeUsages', () => {
  const teaser = { name: 'teaser' }
  const blocks = [
    { name: 'hero', label: { en: 'Hero', de: 'Bühne' }, imageSizes: [teaser, { name: 'wide' }] },
    { name: 'gallery', imageSizes: [{ name: 'square' }] },
    { name: 'card-list', label: 'Card list', imageSizes: [teaser] },
    { name: 'prose' },
  ]
  const labels = { teaser: { en: 'Teaser card', de: 'Teaser-Karte' }, avatar: 'Avatar' }

  it('names every block that declares one of the sizes, then the label of the size, in the admin language', () => {
    expect(sizeUsages(['teaser'], blocks, labels, 'de')).toEqual(['Bühne', 'Card list', 'Teaser-Karte'])
    expect(sizeUsages(['teaser'], blocks, labels, 'en')).toEqual(['Hero', 'Card list', 'Teaser card'])
  })

  it('names each use once across the sizes of a ratio', () => {
    expect(sizeUsages(['teaser', 'wide'], blocks, labels, 'en')).toEqual(['Hero', 'Card list', 'Teaser card'])
  })

  it('falls back to the block name for a block without a label', () => {
    expect(sizeUsages(['square'], blocks, labels, 'en')).toEqual(['gallery'])
  })

  it('names a labelled size of app/image-sizes.ts by its label alone', () => {
    expect(sizeUsages(['avatar'], blocks, labels, 'en')).toEqual(['Avatar'])
  })

  it('names a size no block declares and no label names by its own name', () => {
    expect(sizeUsages(['thumb', 'avatar'], blocks, labels, 'en')).toEqual(['thumb', 'Avatar'])
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

describe('dimensionsLabel', () => {
  it('names the oriented dimensions of the original, not the stored ones', () => {
    expect(dimensionsLabel(item({ width: 1200, height: 1600, framing: { focus: null, crops: {}, width: 1600, height: 1200, ratios: [] } }))).toBe('1600 × 1200')
  })

  it('falls back to the stored dimensions while the oriented ones are not recorded', () => {
    expect(dimensionsLabel(item({ width: 1200, height: 800, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] } }))).toBe('1200 × 800')
  })

  it('reads the stored dimensions when a field grant leaves out the framing', () => {
    const cut = { ...item({ width: 640, height: 480 }), framing: undefined }
    expect(dimensionsLabel(boundaryCast<MediaItem>(cut, 'json'))).toBe('640 × 480')
  })

  it('shows a dash for a file without dimensions', () => {
    expect(dimensionsLabel(item({ width: null, height: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] } }))).toBe('–')
  })
})

describe('initialTile', () => {
  const ratios = [
    { key: '16:7', sizes: ['banner'] },
    { key: '3:2', sizes: ['picture-wide'] },
    { key: '1:1', sizes: ['picture-square', 'responsive-tablet'] },
    { key: '4:5', sizes: ['responsive-mobile'] },
  ]

  it('starts on the ratio of the first size, in the order the block declares them, that has a ratio', () => {
    expect(initialTile(ratios, ['banner'])).toBe('16:7')
    expect(initialTile(ratios, ['responsive-mobile', 'responsive-tablet'])).toBe('4:5')
    expect(initialTile(ratios, ['content', 'responsive-tablet', 'banner'])).toBe('1:1')
  })

  it('opens a block that declares 16:9 before 3:4 on 16:9, whatever the order of the ratios', () => {
    const hero = [{ key: '3:4', sizes: ['hero-tall'] }, { key: '16:9', sizes: ['hero-wide'] }]
    expect(initialTile(hero, ['hero-wide', 'hero-tall'])).toBe('16:9')
    expect(initialTile(hero, ['hero-tall', 'hero-wide'])).toBe('3:4')
  })

  it('starts on the focus without sizes or without a ratio that carries one', () => {
    expect(initialTile(ratios, [])).toBe(FOCUS_TILE)
    expect(initialTile(ratios, ['content'])).toBe(FOCUS_TILE)
    expect(initialTile([], ['banner'])).toBe(FOCUS_TILE)
  })
})

describe('tileId', () => {
  it('gives the focus tile and each ratio tile an id that is safe in an element id', () => {
    expect(tileId(FOCUS_TILE)).toBe('focus')
    expect(tileId('16:7')).toBe('ratio-16x7')
  })
})
