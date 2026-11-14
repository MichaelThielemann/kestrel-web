import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusObjectPosition, pickImageSources, type DeclaredImageSize } from './image-variants'
import type { ImageMedia } from './public-shapes'
import type { MediaItem, MediaVariant } from '#kestrel-core/app/types/api'

type Crop = NonNullable<MediaVariant['crop']>

const declared = vi.hoisted(() => ({ sizes: [] as { name: string, width: number, height?: number, fit: 'inside' | 'cover' }[] }))
vi.mock('#kestrel/image-sizes', () => ({ imageSizes: declared.sizes }))

function variant(over: Partial<MediaVariant>): MediaVariant {
  return { size: 'thumb', width: 320, height: 240, format: 'webp', bytes: 1000, state: 'done', path: '/media/m1/variants/thumb.webp', crop: null, ...over }
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

  describe('with the declared sizes', () => {
    const defaults = [
      variant({ size: 'thumb', width: 320, height: 180, path: '/media/m1/variants/thumb.webp' }),
      variant({ size: 'small', width: 640, height: 360, path: '/media/m1/variants/small.webp' }),
      variant({ size: 'medium', width: 1024, height: 576, path: '/media/m1/variants/medium.webp' }),
      variant({ size: 'large', width: 1600, height: 900, path: '/media/m1/variants/large.webp' }),
      variant({ size: 'xl', width: 2400, height: 1350, path: '/media/m1/variants/xl.webp' }),
    ]
    const hero: DeclaredImageSize = { name: 'hero', width: 1600, height: 900, fit: 'cover' }

    it('gives an uncut cover size of the original\'s own ratio a srcset with the inside variants of that ratio', () => {
      const media = item({
        width: 4000,
        height: 2250,
        variants: [
          ...defaults,
          variant({ size: 'hero', width: 1600, height: 900, path: '/media/m1/variants/hero.webp' }),
          variant({ size: 'hero-small', width: 800, height: 450, path: '/media/m1/variants/hero-small.webp' }),
        ],
      })
      const sizes = [hero, { name: 'hero-small', width: 800, height: 450, fit: 'cover' as const }]
      const sources = pickImageSources(media, 'hero', undefined, sizes)
      expect(sources?.src).toBe('/media/m1/variants/hero.webp')
      expect(sources?.srcset).toBe(
        '/media/m1/variants/thumb.webp 320w, /media/m1/variants/small.webp 640w, /media/m1/variants/hero-small.webp 800w, /media/m1/variants/medium.webp 1024w, /media/m1/variants/hero.webp 1600w, /media/m1/variants/xl.webp 2400w',
      )
    })

    it('gives a cover size cut by hand a srcset of the variants showing that cut only, never the uncut ones', () => {
      const cut = { left: 400, top: 225, width: 3200, height: 1800 }
      const media = item({
        width: 4000,
        height: 2250,
        variants: [
          ...defaults,
          variant({ size: 'hero', width: 1600, height: 900, path: '/media/m1/variants/hero.webp?v=3', crop: cut }),
          variant({ size: 'hero-small', width: 800, height: 450, path: '/media/m1/variants/hero-small.webp?v=3', crop: { ...cut } }),
        ],
      })
      const sizes = [hero, { name: 'hero-small', width: 800, height: 450, fit: 'cover' as const }]
      expect(pickImageSources(media, 'hero', undefined, sizes)?.srcset).toBe('/media/m1/variants/hero-small.webp?v=3 800w, /media/m1/variants/hero.webp?v=3 1600w')
      expect(pickImageSources(media, 'large', undefined, sizes)?.srcset).toBe(
        '/media/m1/variants/thumb.webp 320w, /media/m1/variants/small.webp 640w, /media/m1/variants/medium.webp 1024w, /media/m1/variants/large.webp 1600w, /media/m1/variants/xl.webp 2400w',
      )
    })

    it('keeps variants of one ratio cut differently in separate srcsets', () => {
      const media = item({
        width: 4000,
        height: 2250,
        variants: [
          variant({ size: 'hero', width: 1600, height: 900, path: '/media/m1/variants/hero.webp?v=2', crop: { left: 0, top: 0, width: 3200, height: 1800 } }),
          variant({ size: 'banner', width: 800, height: 450, path: '/media/m1/variants/banner.webp?v=2', crop: { left: 800, top: 450, width: 3200, height: 1800 } }),
          variant({ size: 'large', width: 2400, height: 1350, path: '/media/m1/variants/large.webp' }),
        ],
      })
      expect(pickImageSources(media, 'hero')?.srcset).toBe('/media/m1/variants/hero.webp?v=2 1600w')
      expect(pickImageSources(media, 'banner')?.srcset).toBe('/media/m1/variants/banner.webp?v=2 800w')
      expect(pickImageSources(media, 'large')?.srcset).toBe('/media/m1/variants/large.webp 2400w')
    })

    it('gives a cover size of another ratio a srcset of its own ratio only, whatever its cut', () => {
      const media = item({
        width: 1200,
        height: 900,
        variants: [
          variant({ size: 'thumb', width: 320, height: 240, path: '/media/m1/variants/thumb.webp' }),
          variant({ size: 'content', width: 1200, height: 900, path: '/media/m1/variants/content.webp' }),
          variant({ size: 'avatar', width: 96, height: 96, path: '/media/m1/variants/avatar.webp' }),
          variant({ size: 'avatar-2x', width: 192, height: 192, path: '/media/m1/variants/avatar-2x.webp' }),
          variant({ size: 'square', width: 600, height: 600, path: '/media/m1/variants/square.webp?v=4', crop: { left: 0, top: 0, width: 900, height: 900 } }),
        ],
      })
      const sizes: DeclaredImageSize[] = [{ name: 'avatar', width: 96, height: 96, fit: 'cover' }, { name: 'avatar-2x', width: 192, height: 192, fit: 'cover' }]
      expect(pickImageSources(media, 'avatar', undefined, sizes)?.srcset).toBe('/media/m1/variants/avatar.webp 96w, /media/m1/variants/avatar-2x.webp 192w')
      expect(pickImageSources(media, 'square', undefined, sizes)?.srcset).toBe('/media/m1/variants/square.webp?v=4 600w')
      expect(pickImageSources(media, 'content', undefined, sizes)?.srcset).toBe('/media/m1/variants/thumb.webp 320w, /media/m1/variants/content.webp 1200w')
    })

    it('groups by the declared cover ratio keys when the variants carry no crop', () => {
      const withoutCrop = (over: Partial<MediaVariant>) => {
        const { crop: _crop, ...rest } = variant(over)
        return rest
      }
      const media: ImageMedia = {
        ...item({ width: 1200, height: 800 }),
        variants: [
          withoutCrop({ size: 'thumb', width: 320, height: 213, path: '/media/m1/variants/thumb.webp' }),
          withoutCrop({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp?v=2' }),
          withoutCrop({ size: 'small', width: 640, height: 427, path: '/media/m1/variants/small.webp' }),
          withoutCrop({ size: 'content', width: 1200, height: 800, path: '/media/m1/variants/content.webp' }),
        ],
      }
      const sizes: DeclaredImageSize[] = [{ name: 'teaser', width: 480, height: 320, fit: 'cover' }, { name: 'content', width: 1200, fit: 'inside' }]
      expect(pickImageSources(media, 'teaser', undefined, sizes)?.srcset).toBe('/media/m1/variants/teaser.webp?v=2 480w')
      expect(pickImageSources(media, 'content', undefined, sizes)?.srcset).toBe(
        '/media/m1/variants/thumb.webp 320w, /media/m1/variants/small.webp 640w, /media/m1/variants/content.webp 1200w',
      )
    })

    it('treats a crop without all four edges, as a grant of only some of its members answers, like a missing crop', () => {
      const leftOnly = (left: number): Crop => {
        const crop: Crop = { left, top: 0, width: 0, height: 0 }
        for (const edge of ['top', 'width', 'height'] as const) Reflect.deleteProperty(crop, edge)
        return crop
      }
      const media = item({
        width: 6000,
        height: 4000,
        variants: [
          variant({ size: 'thumb', width: 320, height: 213, path: '/media/m1/variants/thumb.webp' }),
          variant({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp?v=2', crop: leftOnly(1500) }),
          variant({ size: 'teaser-2x', width: 960, height: 640, path: '/media/m1/variants/teaser-2x.webp?v=2', crop: leftOnly(1500) }),
        ],
      })
      const sizes: DeclaredImageSize[] = [{ name: 'teaser', width: 480, height: 320, fit: 'cover' }, { name: 'teaser-2x', width: 960, height: 640, fit: 'cover' }]
      expect(pickImageSources(media, 'teaser', undefined, sizes)?.srcset).toBe('/media/m1/variants/teaser.webp?v=2 480w, /media/m1/variants/teaser-2x.webp?v=2 960w')
      expect(pickImageSources(media, 'thumb', undefined, sizes)?.srcset).toBe('/media/m1/variants/thumb.webp 320w')
    })

    it('never puts a variant without a crop into the srcset of one that carries it', () => {
      const { crop: _crop, ...small } = variant({ size: 'small', width: 640, height: 427, path: '/media/m1/variants/small.webp' })
      const media: ImageMedia = {
        ...item({ width: 1200, height: 800 }),
        variants: [small, variant({ size: 'content', width: 1200, height: 800, path: '/media/m1/variants/content.webp' })],
      }
      expect(pickImageSources(media, 'content')?.srcset).toBe('/media/m1/variants/content.webp 1200w')
    })

    it('gives a cover size declared at one width the inside widths of its ratio until it is cut by hand, and its own width alone after', () => {
      const teaser: DeclaredImageSize = { name: 'teaser', width: 480, height: 320, fit: 'cover' }
      const uncut = item({
        width: 6000,
        height: 4000,
        variants: [
          variant({ size: 'thumb', width: 320, height: 213, path: '/media/m1/variants/thumb.webp' }),
          variant({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp' }),
          variant({ size: 'small', width: 640, height: 427, path: '/media/m1/variants/small.webp' }),
          variant({ size: 'large', width: 1600, height: 1067, path: '/media/m1/variants/large.webp' }),
        ],
      })
      expect(pickImageSources(uncut, 'teaser', undefined, [teaser])?.srcset).toBe(
        '/media/m1/variants/thumb.webp 320w, /media/m1/variants/teaser.webp 480w, /media/m1/variants/small.webp 640w, /media/m1/variants/large.webp 1600w',
      )
      const cut = item({
        ...uncut,
        variants: uncut.variants.map((v) => (v.size === 'teaser' ? { ...v, path: '/media/m1/variants/teaser.webp?v=2', crop: { left: 1500, top: 1000, width: 3000, height: 2000 } } : v)),
      })
      expect(pickImageSources(cut, 'teaser', undefined, [teaser])?.srcset).toBe('/media/m1/variants/teaser.webp?v=2 480w')
      expect(pickImageSources(cut, 'large', undefined, [teaser])?.srcset).toBe('/media/m1/variants/thumb.webp 320w, /media/m1/variants/small.webp 640w, /media/m1/variants/large.webp 1600w')
    })

    it('counts the centred cut of a focus at the edge, listed without a crop, as the same picture as the whole image', () => {
      const teaser: DeclaredImageSize = { name: 'teaser', width: 480, height: 320, fit: 'cover' }
      const media = item({
        width: 1920,
        height: 1281,
        focus: { x: 0.05, y: 0, w: 0.1, h: 0.1 },
        variants: [
          variant({ size: 'thumb', width: 320, height: 214, path: '/media/m1/variants/thumb.webp' }),
          variant({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp?v=2', crop: null }),
          variant({ size: 'small', width: 640, height: 427, path: '/media/m1/variants/small.webp' }),
          variant({ size: 'medium', width: 1024, height: 683, path: '/media/m1/variants/medium.webp' }),
          variant({ size: 'large', width: 1600, height: 1068, path: '/media/m1/variants/large.webp' }),
          variant({ size: 'xl', width: 1920, height: 1281, path: '/media/m1/variants/xl.webp' }),
        ],
      })
      expect(pickImageSources(media, 'teaser', undefined, [teaser])?.srcset).toBe(
        '/media/m1/variants/thumb.webp 320w, /media/m1/variants/teaser.webp?v=2 480w, /media/m1/variants/small.webp 640w, /media/m1/variants/medium.webp 1024w, /media/m1/variants/large.webp 1600w, /media/m1/variants/xl.webp 1920w',
      )
      expect(pickImageSources(media, 'large', undefined, [teaser])?.srcset).toContain('/media/m1/variants/teaser.webp?v=2 480w')
    })

    it('keeps a variant that lists a crop apart from the variants of its ratio that list none, however close it lies to the whole image', () => {
      const teaser: DeclaredImageSize = { name: 'teaser', width: 480, height: 320, fit: 'cover' }
      for (const crop of [{ left: 0, top: 0, width: 1920, height: 1280 }, { left: 0, top: 0, width: 1918, height: 1279 }]) {
        const media = item({
          width: 1920,
          height: 1281,
          variants: [
            variant({ size: 'thumb', width: 320, height: 214, path: '/media/m1/variants/thumb.webp' }),
            variant({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp?v=2', crop }),
            variant({ size: 'xl', width: 1920, height: 1281, path: '/media/m1/variants/xl.webp' }),
          ],
        })
        expect(pickImageSources(media, 'teaser', undefined, [teaser])?.srcset).toBe('/media/m1/variants/teaser.webp?v=2 480w')
        expect(pickImageSources(media, 'xl', undefined, [teaser])?.srcset).toBe('/media/m1/variants/thumb.webp 320w, /media/m1/variants/xl.webp 1920w')
      }
    })

    it('keeps a variant cut away from the centre apart from a variant of its ratio still listing the centred cut', () => {
      const corner = item({
        width: 4000,
        height: 3000,
        variants: [
          variant({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp?v=2', crop: { left: 0, top: 1000, width: 3000, height: 2000 } }),
          variant({ size: 'teaser-2x', width: 960, height: 640, path: '/media/m1/variants/teaser-2x.webp?v=2', crop: { left: 0, top: 1000, width: 3000, height: 2000 } }),
          variant({ size: 'card', width: 1000, height: 667, state: 'pending', path: '/media/m1/variants/card.webp' }),
        ],
      })
      expect(pickImageSources(corner, 'teaser')?.srcset).toBe('/media/m1/variants/teaser.webp?v=2 480w, /media/m1/variants/teaser-2x.webp?v=2 960w')
      expect(pickImageSources(corner, 'card')?.srcset).toBe('/media/m1/variants/card.webp 1000w')
      const wide = item({
        width: 4000,
        height: 3000,
        variants: [
          variant({ size: 'hero', width: 1600, height: 900, path: '/media/m1/variants/hero.webp?v=2', crop: { left: 0, top: 1156, width: 3000, height: 1688 } }),
          variant({ size: 'wide', width: 1000, height: 562, path: '/media/m1/variants/wide.webp' }),
        ],
      })
      const sizes: DeclaredImageSize[] = [hero, { name: 'wide', width: 1000, height: 562, fit: 'cover' }]
      expect(pickImageSources(wide, 'hero', undefined, sizes)?.srcset).toBe('/media/m1/variants/hero.webp?v=2 1600w')
      expect(pickImageSources(wide, 'wide', undefined, sizes)?.srcset).toBe('/media/m1/variants/wide.webp 1000w')
    })

    it('combines two listed crops whose edges lie within a pixel of each other, and keeps them apart two pixels off', () => {
      const sizes: DeclaredImageSize[] = [hero, { name: 'wide', width: 1000, height: 562, fit: 'cover' }]
      const media = (crop: Crop) => item({
        width: 5000,
        height: 2812,
        variants: [
          variant({ size: 'hero', width: 1600, height: 900, path: '/media/m1/variants/hero.webp?v=2', crop: { left: 800, top: 400, width: 3200, height: 1800 } }),
          variant({ size: 'wide', width: 1000, height: 562, path: '/media/m1/variants/wide.webp?v=2', crop }),
        ],
      })
      expect(pickImageSources(media({ left: 801, top: 399, width: 3199, height: 1802 }), 'hero', undefined, sizes)?.srcset).toBe(
        '/media/m1/variants/wide.webp?v=2 1000w, /media/m1/variants/hero.webp?v=2 1600w',
      )
      expect(pickImageSources(media({ left: 802, top: 400, width: 3198, height: 1800 }), 'hero', undefined, sizes)?.srcset).toBe('/media/m1/variants/hero.webp?v=2 1600w')
      expect(pickImageSources(media({ left: 800, top: 400, width: 3200, height: 1802 }), 'hero', undefined, sizes)?.srcset).toBe('/media/m1/variants/hero.webp?v=2 1600w')
    })

    it('takes the original\'s box from the variant of a declared inside size, turned for a photo stored on its side, with the uncut cover variants of that box', () => {
      const sizes: DeclaredImageSize[] = [
        { name: 'thumb', width: 320, fit: 'inside' },
        { name: 'tall', width: 600, height: 800, fit: 'cover' },
        { name: 'four', width: 800, height: 600, fit: 'cover' },
      ]
      const sideways = item({
        width: 4000,
        height: 3000,
        variants: [
          variant({ size: 'thumb', width: 320, height: 427, path: '/media/m1/variants/thumb.webp' }),
          variant({ size: 'small', width: 640, height: 853, path: '/media/m1/variants/small.webp' }),
          variant({ size: 'tall', width: 600, height: 800, path: '/media/m1/variants/tall.webp' }),
          variant({ size: 'four', width: 800, height: 600, path: '/media/m1/variants/four.webp' }),
          variant({ size: 'large', width: 1600, height: 2133, path: '/media/m1/variants/large.webp' }),
        ],
      })
      expect(pickImageSources(sideways, 'hero', undefined, sizes)).toMatchObject({
        src: '/media/m1/photo.jpg',
        srcset: '/media/m1/variants/thumb.webp 320w, /media/m1/variants/tall.webp 600w, /media/m1/variants/small.webp 640w, /media/m1/variants/large.webp 1600w',
        width: 3000,
        height: 4000,
        variant: false,
      })
      const upright = item({
        width: 4000,
        height: 3000,
        variants: [
          variant({ size: 'thumb', width: 320, height: 240, path: '/media/m1/variants/thumb.webp' }),
          variant({ size: 'tall', width: 600, height: 800, path: '/media/m1/variants/tall.webp' }),
          variant({ size: 'four', width: 800, height: 600, path: '/media/m1/variants/four.webp' }),
          variant({ size: 'large', width: 1600, height: 1200, path: '/media/m1/variants/large.webp' }),
        ],
      })
      expect(pickImageSources(upright, 'hero', undefined, sizes)).toMatchObject({
        srcset: '/media/m1/variants/thumb.webp 320w, /media/m1/variants/four.webp 800w, /media/m1/variants/large.webp 1600w',
        width: 4000,
        height: 3000,
      })
    })

    it('never turns the original\'s box on uncut variants of sizes the build does not declare, which may be centred cover cuts', () => {
      const cover: DeclaredImageSize[] = [{ name: 'teaser', width: 480, height: 320, fit: 'cover' }]
      const landscape = item({
        width: 6000,
        height: 4000,
        variants: [
          variant({ size: 'portrait', width: 600, height: 900, path: '/media/m1/variants/portrait.webp' }),
          variant({ size: 'portrait-2x', width: 1200, height: 1800, path: '/media/m1/variants/portrait-2x.webp' }),
        ],
      })
      expect(pickImageSources(landscape, 'teaser', undefined, cover)).toMatchObject({ src: '/media/m1/photo.jpg', srcset: null, width: 6000, height: 4000 })
      const portrait = item({
        width: 4000,
        height: 6000,
        variants: [variant({ size: 'card', width: 1200, height: 800, path: '/media/m1/variants/card.webp' })],
      })
      expect(pickImageSources(portrait, 'content', undefined, [...cover, { name: 'content', width: 1200, fit: 'inside' }])).toMatchObject({ srcset: null, width: 4000, height: 6000 })
      const sideways = item({
        width: 6000,
        height: 4000,
        variants: [
          variant({ size: 'thumb', width: 320, height: 480, path: '/media/m1/variants/thumb.webp' }),
          variant({ size: 'xl', width: 2400, height: 3600, path: '/media/m1/variants/xl.webp' }),
          variant({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp' }),
        ],
      })
      expect(pickImageSources(sideways, 'full', undefined, cover)).toMatchObject({ srcset: null, width: 6000, height: 4000 })
      expect(pickImageSources(sideways, 'teaser', undefined, cover)?.srcset).toBe('/media/m1/variants/teaser.webp 480w')
    })

    it('gives the original its stored box and leaves the cover sizes out when no uncut variant of a declared inside size tells its orientation', () => {
      const cover: DeclaredImageSize[] = [{ name: 'four', width: 800, height: 600, fit: 'cover' }, { name: 'four-2x', width: 1600, height: 1200, fit: 'cover' }]
      const four = [
        variant({ size: 'four', width: 800, height: 600, path: '/media/m1/variants/four.webp' }),
        variant({ size: 'four-2x', width: 1600, height: 1200, path: '/media/m1/variants/four-2x.webp' }),
      ]
      const covers = item({ width: 4000, height: 3000, variants: four })
      expect(pickImageSources(covers, 'hero', undefined, cover)).toMatchObject({ src: '/media/m1/photo.jpg', srcset: null, width: 4000, height: 3000 })
      expect(pickImageSources(covers, 'four', undefined, cover)?.srcset).toBe('/media/m1/variants/four.webp 800w, /media/m1/variants/four-2x.webp 1600w')
      const disagreeing = item({
        width: 4000,
        height: 3000,
        variants: [
          variant({ size: 'thumb', width: 320, height: 240, path: '/media/m1/variants/thumb.webp' }),
          variant({ size: 'old', width: 600, height: 800, path: '/media/m1/variants/old.webp' }),
          variant({ size: 'large', width: 2400, height: 1800, path: '/media/m1/variants/large.webp' }),
          ...four,
        ],
      })
      expect(pickImageSources(disagreeing, 'hero', undefined, cover)).toMatchObject({
        srcset: '/media/m1/variants/thumb.webp 320w, /media/m1/variants/large.webp 2400w',
        width: 4000,
        height: 3000,
      })
      const failed = item({ width: 4000, height: 3000, variants: [variant({ size: 'thumb', width: 0, height: 0, state: 'failed' }), ...four] })
      expect(pickImageSources(failed, 'hero', undefined, [...cover, { name: 'thumb', width: 320, fit: 'inside' }])).toMatchObject({ srcset: null, width: 4000, height: 3000 })
    })

    it('orients a nearly square original by a declared inside variant large enough to tell the two boxes apart', () => {
      const sizes: DeclaredImageSize[] = [{ name: 'icon', width: 48, fit: 'inside' }, { name: 'content', width: 1200, fit: 'inside' }]
      const nearSquare = item({
        width: 3015,
        height: 3000,
        variants: [
          variant({ size: 'icon', width: 48, height: 48, path: '/media/m1/variants/icon.webp' }),
          variant({ size: 'small', width: 640, height: 643, path: '/media/m1/variants/small.webp' }),
          variant({ size: 'content', width: 1200, height: 1206, path: '/media/m1/variants/content.webp' }),
          variant({ size: 'xl', width: 2400, height: 2412, path: '/media/m1/variants/xl.webp' }),
        ],
      })
      expect(pickImageSources(nearSquare, 'full', undefined, sizes)).toMatchObject({
        srcset: '/media/m1/variants/icon.webp 48w, /media/m1/variants/small.webp 640w, /media/m1/variants/content.webp 1200w, /media/m1/variants/xl.webp 2400w',
        width: 3000,
        height: 3015,
      })
    })

    it('keeps the centred cut of a ratio near the original\'s apart from the whole image once their rounded ratios differ', () => {
      const band: DeclaredImageSize = { name: 'band', width: 1000, height: 404, fit: 'cover' }
      const media = item({
        width: 2000,
        height: 800,
        variants: [
          variant({ size: 'thumb', width: 320, height: 128, path: '/media/m1/variants/thumb.webp' }),
          variant({ size: 'small', width: 640, height: 256, path: '/media/m1/variants/small.webp' }),
          variant({ size: 'band', width: 1000, height: 404, path: '/media/m1/variants/band.webp' }),
          variant({ size: 'large', width: 1600, height: 640, path: '/media/m1/variants/large.webp' }),
        ],
      })
      expect(pickImageSources(media, 'large', undefined, [band])?.srcset).toBe(
        '/media/m1/variants/thumb.webp 320w, /media/m1/variants/small.webp 640w, /media/m1/variants/large.webp 1600w',
      )
      expect(pickImageSources(media, 'band', undefined, [band])?.srcset).toBe('/media/m1/variants/band.webp 1000w')
    })

    it('keeps the named variant on a width tie with another variant of its cut', () => {
      const media = item({
        width: 4000,
        height: 2250,
        variants: [
          variant({ size: 'banner', width: 1600, height: 900, path: '/media/m1/variants/banner.webp' }),
          variant({ size: 'hero', width: 1600, height: 900, path: '/media/m1/variants/hero.webp' }),
        ],
      })
      const sizes = [hero, { name: 'banner', width: 1600, height: 900, fit: 'cover' as const }]
      expect(pickImageSources(media, 'hero', undefined, sizes)?.srcset).toBe('/media/m1/variants/hero.webp 1600w')
    })

    it('leaves a cover variant cut by hand out of the srcset of an inside size, even at the same ratio', () => {
      const media = item({
        width: 1200,
        height: 800,
        variants: [
          variant({ size: 'thumb', width: 320, height: 213, path: '/media/m1/variants/thumb.webp' }),
          variant({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp?v=2', crop: { left: 100, top: 100, width: 600, height: 400 } }),
          variant({ size: 'small', width: 640, height: 427, path: '/media/m1/variants/small.webp' }),
          variant({ size: 'content', width: 1200, height: 800, path: '/media/m1/variants/content.webp' }),
        ],
      })
      const sizes: DeclaredImageSize[] = [{ name: 'teaser', width: 480, height: 320, fit: 'cover' }, { name: 'content', width: 1200, fit: 'inside' }]
      expect(pickImageSources(media, 'content', undefined, sizes)?.srcset).toBe(
        '/media/m1/variants/thumb.webp 320w, /media/m1/variants/small.webp 640w, /media/m1/variants/content.webp 1200w',
      )
      expect(pickImageSources(media, 'unknown', undefined, sizes)?.srcset).not.toContain('teaser')
    })

    it('takes the original\'s box from the oriented dimensions kestrel reports, with the uncut cover variants of that box and not a cut one', () => {
      const sizes: DeclaredImageSize[] = [
        { name: 'teaser', width: 480, height: 320, fit: 'cover' },
        { name: 'teaser-2x', width: 960, height: 640, fit: 'cover' },
        { name: 'hero', width: 1600, height: 900, fit: 'cover' },
        { name: 'card', width: 600, height: 400, fit: 'cover' },
      ]
      const framing = (width: number, height: number) => ({ focus: null, crops: {}, width, height, ratios: [] })
      const covers = [
        variant({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp' }),
        variant({ size: 'teaser-2x', width: 960, height: 640, path: '/media/m1/variants/teaser-2x.webp' }),
        variant({ size: 'card', width: 600, height: 400, path: '/media/m1/variants/card.webp?v=1', crop: { left: 600, top: 400, width: 3000, height: 2000 } }),
      ]
      const upright = item({ width: 6000, height: 4000, framing: framing(6000, 4000), variants: covers })
      expect(pickImageSources(upright, 'hero', undefined, sizes)).toMatchObject({
        src: '/media/m1/photo.jpg',
        srcset: '/media/m1/variants/teaser.webp 480w, /media/m1/variants/teaser-2x.webp 960w',
        width: 6000,
        height: 4000,
      })
      const withInside = item({
        width: 6000,
        height: 4000,
        framing: framing(6000, 4000),
        variants: [
          variant({ size: 'thumb', width: 320, height: 213, path: '/media/m1/variants/thumb.webp' }),
          variant({ size: 'small', width: 640, height: 427, path: '/media/m1/variants/small.webp' }),
          variant({ size: 'xl', width: 2400, height: 1600, path: '/media/m1/variants/xl.webp' }),
          ...covers,
        ],
      })
      expect(pickImageSources(withInside, 'hero', undefined, sizes)?.srcset).toBe(
        '/media/m1/variants/thumb.webp 320w, /media/m1/variants/teaser.webp 480w, /media/m1/variants/small.webp 640w, /media/m1/variants/teaser-2x.webp 960w, /media/m1/variants/xl.webp 2400w',
      )
      const sideways = item({
        width: 6000,
        height: 4000,
        framing: framing(4000, 6000),
        variants: [
          variant({ size: 'thumb', width: 320, height: 480, path: '/media/m1/variants/thumb.webp' }),
          variant({ size: 'small', width: 640, height: 960, path: '/media/m1/variants/small.webp' }),
          variant({ size: 'xl', width: 2400, height: 3600, path: '/media/m1/variants/xl.webp' }),
          ...covers,
        ],
      })
      expect(pickImageSources(sideways, 'hero', undefined, sizes)).toMatchObject({
        srcset: '/media/m1/variants/thumb.webp 320w, /media/m1/variants/small.webp 640w, /media/m1/variants/xl.webp 2400w',
        width: 4000,
        height: 6000,
      })
      const unreported = item({ width: 6000, height: 4000, variants: covers })
      expect(pickImageSources(unreported, 'hero', undefined, sizes)).toMatchObject({ srcset: null, width: 6000, height: 4000 })
    })

    it('gives a nearly square original whose two boxes round alike its stored box, with the uncut cover variants of that box', () => {
      const sizes: DeclaredImageSize[] = [{ name: 'content', width: 1200, fit: 'inside' }, { name: 'square', width: 600, height: 600, fit: 'cover' }]
      const nearSquare = item({
        width: 1001,
        height: 1000,
        variants: [
          variant({ size: 'content', width: 1001, height: 1000, path: '/media/m1/variants/content.webp' }),
          variant({ size: 'square', width: 600, height: 600, path: '/media/m1/variants/square.webp' }),
          variant({ size: 'thumb', width: 320, height: 320, path: '/media/m1/variants/thumb.webp' }),
        ],
      })
      expect(pickImageSources(nearSquare, 'hero', undefined, sizes)).toMatchObject({
        srcset: '/media/m1/variants/thumb.webp 320w, /media/m1/variants/square.webp 600w, /media/m1/variants/content.webp 1001w',
        width: 1001,
        height: 1000,
      })
    })

    it('marks a source as cut only when it links a variant of a declared cover size', () => {
      const media = item({
        width: 4000,
        height: 2250,
        variants: [...defaults, variant({ size: 'hero', width: 1600, height: 900, path: '/media/m1/variants/hero.webp' })],
      })
      expect(pickImageSources(media, 'hero', undefined, [hero])?.cut).toBe(true)
      expect(pickImageSources(media, 'large', undefined, [hero])?.cut).toBe(false)
      expect(pickImageSources(media, 'missing', undefined, [hero])?.cut).toBe(false)
      expect(pickImageSources(media, 'hero')?.cut).toBe(false)
    })
  })

  describe('without the declared sizes as an argument', () => {
    afterEach(() => { declared.sizes.splice(0) })

    it('groups by the sizes the build declares, as KestrelImage does, when the variants carry no crop', () => {
      declared.sizes.push({ name: 'teaser', width: 480, height: 320, fit: 'cover' })
      const withoutCrop = (over: Partial<MediaVariant>) => {
        const { crop: _crop, ...rest } = variant(over)
        return rest
      }
      const media: ImageMedia = {
        ...item({ width: 6000, height: 4000 }),
        variants: [
          withoutCrop({ size: 'thumb', width: 320, height: 213, path: '/media/m1/variants/thumb.webp' }),
          withoutCrop({ size: 'small', width: 640, height: 427, path: '/media/m1/variants/small.webp' }),
          withoutCrop({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp?v=2' }),
          withoutCrop({ size: 'medium', width: 1024, height: 683, path: '/media/m1/variants/medium.webp' }),
        ],
      }
      expect(pickImageSources(media, 'small')?.srcset).toBe('/media/m1/variants/thumb.webp 320w, /media/m1/variants/small.webp 640w, /media/m1/variants/medium.webp 1024w')
      expect(pickImageSources(media, 'small', undefined)?.srcset).toBe('/media/m1/variants/thumb.webp 320w, /media/m1/variants/small.webp 640w, /media/m1/variants/medium.webp 1024w')
      expect(pickImageSources(media, 'teaser')).toMatchObject({ srcset: '/media/m1/variants/teaser.webp?v=2 480w', cut: true })
    })
  })

  it('takes an item without a focus', () => {
    const { focus: _focus, ...rest } = item({ variants: [variant({ size: 'content', width: 1200, height: 900, path: '/media/m1/variants/content.webp' })] })
    const media: ImageMedia = rest
    expect(pickImageSources(media, 'content')?.src).toBe('/media/m1/variants/content.webp')
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
