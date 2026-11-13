import { describe, expect, it } from 'vitest'
import { focusObjectPosition, pickImageSources } from './image-variants'
import type { MediaItem, MediaVariant } from '#kestrel-core/app/types/api'

function variant(over: Partial<MediaVariant>): MediaVariant {
  return { size: 'thumb', width: 320, height: 240, format: 'webp', bytes: 1000, state: 'done', path: '/media/m1/variants/thumb.webp', ...over }
}

function item(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'm1',
    path: '/media/m1/photo.jpg',
    filename: 'photo.jpg',
    folder: '',
    contentType: 'image/jpeg',
    size: 12345,
    createdAt: 0,
    updatedAt: 0,
    provenance: { origin: 'human' },
    width: 1200,
    height: 900,
    alt: null,
    title: null,
    description: null,
    available: true,
    variants: [],
    variantCounts: { done: 0, pending: 0, error: 0, failed: 0 }, focus: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] },
    ...over,
  }
}

describe('pickImageSources', () => {
  it('returns null for a null item', () => {
    expect(pickImageSources(null, 'content')).toBeNull()
  })

  it('builds srcset from every variant sharing the ratio, ascending by width, whatever its state', () => {
    const media = item({
      variants: [
        variant({ size: 'large', width: 1600, height: 1200, path: '/media/m1/variants/large.webp' }),
        variant({ size: 'thumb', width: 320, height: 240, path: '/media/m1/variants/thumb.webp', state: 'pending' }),
        variant({ size: 'medium', width: 1024, height: 768, path: '/media/m1/variants/medium.webp', state: 'error' }),
      ],
    })
    const sources = pickImageSources(media, 'medium')
    expect(sources?.srcset).toBe(
      '/media/m1/variants/thumb.webp 320w, /media/m1/variants/medium.webp 1024w, /media/m1/variants/large.webp 1600w',
    )
  })

  it('takes src verbatim from the named variant path, never assembling a variants URL itself', () => {
    const media = item({
      variants: [variant({ size: 'content', width: 1200, height: 900, path: '/media/m1/variants/content.webp' })],
    })
    const sources = pickImageSources(media, 'content')
    expect(sources?.src).toBe('/media/m1/variants/content.webp')
  })

  it('a named variant in every state links its path and planned dimensions, with no state check', () => {
    for (const state of ['pending', 'done', 'error', 'failed'] as const) {
      const media = item({
        variants: [variant({ size: 'content', width: 1200, height: 900, path: '/media/m1/variants/content.webp', state })],
      })
      const sources = pickImageSources(media, 'content')
      expect(sources?.src).toBe('/media/m1/variants/content.webp')
      expect(sources?.width).toBe(1200)
      expect(sources?.height).toBe(900)
    }
  })

  it('falls back to the item path when no variant row matches the size', () => {
    const media = item({ variants: [] })
    const sources = pickImageSources(media, 'content')
    expect(sources?.src).toBe('/media/m1/photo.jpg')
    expect(sources?.srcset).toBeNull()
  })

  it('takes width/height from a named variant, not the original (crop correctness)', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [variant({ size: 'avatar', width: 96, height: 96 })],
    })
    const sources = pickImageSources(media, 'avatar')
    expect(sources?.width).toBe(96)
    expect(sources?.height).toBe(96)
  })

  it('excludes cover crops with a different aspect ratio from an inside-fit srcset (avatar 1:1, teaser 3:2 vs. content 4:3)', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [
        variant({ size: 'content', width: 1200, height: 900, path: '/media/m1/variants/content.webp' }),
        variant({ size: 'thumb', width: 320, height: 240, path: '/media/m1/variants/thumb.webp' }),
        variant({ size: 'avatar', width: 96, height: 96, path: '/media/m1/variants/avatar.webp' }),
        variant({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp' }),
      ],
    })
    const sources = pickImageSources(media, 'content')
    expect(sources?.srcset).toBe('/media/m1/variants/thumb.webp 320w, /media/m1/variants/content.webp 1200w')
  })

  it('a teaser (3:2 cover) image only gets 3:2 candidates, not the 4:3 sizes', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [
        variant({ size: 'thumb', width: 320, height: 240, path: '/media/m1/variants/thumb.webp' }),
        variant({ size: 'avatar', width: 96, height: 96, path: '/media/m1/variants/avatar.webp' }),
        variant({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp' }),
      ],
    })
    const sources = pickImageSources(media, 'teaser')
    expect(sources?.srcset).toBe('/media/m1/variants/teaser.webp 480w')
  })

  it('falls back to the item dimensions when no variant matches the size and the item has none', () => {
    const media = item({
      width: null,
      height: null,
      variants: [variant({ size: 'thumb', width: 320, height: 240, path: '/media/m1/variants/thumb.webp' })],
    })
    const sources = pickImageSources(media, 'content')
    expect(sources?.src).toBe(media.path)
    expect(sources?.srcset).toBeNull()
    expect(sources?.width).toBeNull()
    expect(sources?.height).toBeNull()
  })

  it('restricts srcset with `only`, without affecting src', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [
        variant({ size: 'thumb', width: 320, height: 240, path: '/media/m1/variants/thumb.webp' }),
        variant({ size: 'small', width: 640, height: 480, path: '/media/m1/variants/small.webp' }),
        variant({ size: 'medium', width: 1024, height: 768, path: '/media/m1/variants/medium.webp' }),
      ],
    })
    const sources = pickImageSources(media, 'medium', ['thumb', 'small'])
    expect(sources?.srcset).toBe('/media/m1/variants/thumb.webp 320w, /media/m1/variants/small.webp 640w')
    expect(sources?.src).toBe('/media/m1/variants/medium.webp')
  })

  it('dedupes candidates by width, keeping the first', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [
        variant({ size: 'a', width: 640, height: 480, path: '/media/m1/variants/a.webp' }),
        variant({ size: 'b', width: 640, height: 480, path: '/media/m1/variants/b.webp' }),
      ],
    })
    const sources = pickImageSources(media, 'a')
    expect(sources?.srcset).toBe('/media/m1/variants/a.webp 640w')
  })

  it('tolerates sub-percent rounding differences between generated variants', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [
        variant({ size: 'content', width: 1200, height: 900, path: '/media/m1/variants/content.webp' }),
        variant({ size: 'thumb', width: 320, height: 241, path: '/media/m1/variants/thumb.webp' }),
      ],
    })
    const sources = pickImageSources(media, 'content')
    expect(sources?.srcset).toBe('/media/m1/variants/thumb.webp 320w, /media/m1/variants/content.webp 1200w')
  })

  it('falls back to the original when the named variant could not be decoded (0×0)', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [variant({ size: 'content', width: 0, height: 0, state: 'failed', path: '/media/m1/variants/content.jpg' })],
    })
    const sources = pickImageSources(media, 'content')
    expect(sources?.src).toBe(media.path)
    expect(sources?.width).toBe(1200)
    expect(sources?.height).toBe(900)
    expect(sources?.variant).toBe(false)
  })

  it('links re-cut variants with their version query verbatim, in src and srcset', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [
        variant({ size: 'hero', width: 1600, height: 900, path: '/media/m1/variants/hero.webp?v=a7f3c2' }),
        variant({ size: 'hero-small', width: 800, height: 450, path: '/media/m1/variants/hero-small.webp?v=19bd0e' }),
      ],
    })
    const sources = pickImageSources(media, 'hero')
    expect(sources?.src).toBe('/media/m1/variants/hero.webp?v=a7f3c2')
    expect(sources?.srcset).toBe('/media/m1/variants/hero-small.webp?v=19bd0e 800w, /media/m1/variants/hero.webp?v=a7f3c2 1600w')
  })

  it('groups variants by ratio whether or not their paths carry a version query', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [
        variant({ size: 'hero', width: 1600, height: 900, path: '/media/m1/variants/hero.webp?v=a7f3c2' }),
        variant({ size: 'hero-small', width: 800, height: 450, path: '/media/m1/variants/hero-small.webp' }),
        variant({ size: 'square', width: 600, height: 600, path: '/media/m1/variants/square.webp?v=55e1aa' }),
        variant({ size: 'content', width: 1200, height: 900, path: '/media/m1/variants/content.webp' }),
        variant({ size: 'thumb', width: 320, height: 240, path: '/media/m1/variants/thumb.webp?v=0c4d2b' }),
      ],
    })
    expect(pickImageSources(media, 'hero')?.srcset).toBe('/media/m1/variants/hero-small.webp 800w, /media/m1/variants/hero.webp?v=a7f3c2 1600w')
    expect(pickImageSources(media, 'square')?.srcset).toBe('/media/m1/variants/square.webp?v=55e1aa 600w')
    expect(pickImageSources(media, 'content')?.srcset).toBe('/media/m1/variants/thumb.webp?v=0c4d2b 320w, /media/m1/variants/content.webp 1200w')
  })

  it('never returns a URL containing "api"', () => {
    const media = item({
      variants: [variant({ size: 'content', width: 1200, height: 900, path: '/media/m1/variants/content.webp' })],
    })
    for (const size of ['content', 'unknown-size']) {
      const sources = pickImageSources(media, size)
      expect(sources?.src).not.toContain('api')
      expect(sources?.srcset ?? '').not.toContain('api')
    }
  })
})

describe('focusObjectPosition', () => {
  it('answers the centre of the focus rectangle in percent of the image', () => {
    expect(focusObjectPosition({ x: 0.1, y: 0.5, w: 0.3, h: 0.2 })).toBe('25% 60%')
    expect(focusObjectPosition({ x: 1, y: 1, w: 0, h: 0 })).toBe('100% 100%')
  })

  it('answers nothing without a focus', () => {
    expect(focusObjectPosition(null)).toBeUndefined()
    expect(focusObjectPosition(undefined)).toBeUndefined()
  })
})
