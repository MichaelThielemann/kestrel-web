import { describe, expect, it } from 'vitest'
import { centredCrop, cropForRatio } from '@michaelthielemann/kestrel-images-default/framing'
import type { MediaItem } from '../types/api'
import { canFrame, coverSizesOf, displayCrop, previewStyle, sameFraming, smallerSizes, uniqueReferrers } from './media-crop'

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
