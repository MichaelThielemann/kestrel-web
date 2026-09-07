import { describe, expect, it } from 'vitest'
import { pickImageSources } from './image-variants'
import type { MediaItem, MediaVariant } from '../../../admin/app/types/api'

function variant(over: Partial<MediaVariant>): MediaVariant {
  return { size: 'thumb', width: 320, height: 240, format: 'webp', bytes: 1000, state: 'done', path: '/api/media/m1/variants/thumb.webp', ...over }
}

function item(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'm1',
    filename: 'photo.jpg',
    folder: '',
    contentType: 'image/jpeg',
    size: 12345,
    key: 'media/photo.jpg',
    checksum: null,
    status: 'ready',
    createdAt: 0,
    updatedAt: 0,
    provenance: { origin: 'human' },
    width: 1200,
    height: 900,
    alt: null,
    title: null,
    description: null,
    variants: [],
    ...over,
  }
}

describe('pickImageSources', () => {
  it('returns null for a null item', () => {
    expect(pickImageSources(null, 'content')).toBeNull()
  })

  it('builds srcset from every done variant sharing the ratio, ascending by width', () => {
    const media = item({
      variants: [
        variant({ size: 'large', width: 1600, height: 1200, path: '/api/media/m1/variants/large.webp' }),
        variant({ size: 'thumb', width: 320, height: 240, path: '/api/media/m1/variants/thumb.webp' }),
        variant({ size: 'medium', width: 1024, height: 768, path: '/api/media/m1/variants/medium.webp' }),
      ],
    })
    const sources = pickImageSources(media, 'medium')
    expect(sources?.srcset).toBe(
      '/api/media/m1/variants/thumb.webp 320w, /api/media/m1/variants/medium.webp 1024w, /api/media/m1/variants/large.webp 1600w',
    )
  })

  it('takes src verbatim from the named variant path, never assembling a variants URL itself', () => {
    const media = item({
      variants: [variant({ size: 'content', width: 1200, height: 900, path: '/api/media/m1/variants/content.webp' })],
    })
    const sources = pickImageSources(media, 'content')
    expect(sources?.src).toBe('/api/media/m1/variants/content.webp')
  })

  it('uses a pending variant for src, excludes it from srcset, and falls back to the item dimensions', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [variant({ size: 'content', width: 0, height: 0, state: 'pending', path: '/api/media/m1/variants/content' })],
    })
    const sources = pickImageSources(media, 'content')
    expect(sources?.src).toBe('/api/media/m1/variants/content')
    expect(sources?.srcset).toBeNull()
    expect(sources?.width).toBe(1200)
    expect(sources?.height).toBe(900)
  })

  it('falls back to the original file URL when no variant row matches the size', () => {
    const media = item({ variants: [] })
    const sources = pickImageSources(media, 'content')
    expect(sources?.src).toBe('/api/media/m1/file')
  })

  it('returns null srcset when no variant is done', () => {
    const media = item({
      variants: [variant({ size: 'content', state: 'error' })],
    })
    expect(pickImageSources(media, 'content')?.srcset).toBeNull()
  })

  it('takes width/height from a done named variant, not the original (crop correctness)', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [variant({ size: 'avatar', width: 96, height: 96, state: 'done' })],
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
        variant({ size: 'content', width: 1200, height: 900, path: '/api/media/m1/variants/content.webp' }),
        variant({ size: 'thumb', width: 320, height: 240, path: '/api/media/m1/variants/thumb.webp' }),
        variant({ size: 'avatar', width: 96, height: 96, path: '/api/media/m1/variants/avatar.webp' }),
        variant({ size: 'teaser', width: 480, height: 320, path: '/api/media/m1/variants/teaser.webp' }),
      ],
    })
    const sources = pickImageSources(media, 'content')
    expect(sources?.srcset).toBe('/api/media/m1/variants/thumb.webp 320w, /api/media/m1/variants/content.webp 1200w')
  })

  it('a teaser (3:2 cover) image only gets 3:2 candidates, not the 4:3 sizes', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [
        variant({ size: 'thumb', width: 320, height: 240, path: '/api/media/m1/variants/thumb.webp' }),
        variant({ size: 'avatar', width: 96, height: 96, path: '/api/media/m1/variants/avatar.webp' }),
        variant({ size: 'teaser', width: 480, height: 320, path: '/api/media/m1/variants/teaser.webp' }),
      ],
    })
    const sources = pickImageSources(media, 'teaser')
    expect(sources?.srcset).toBe('/api/media/m1/variants/teaser.webp 480w')
  })

  it('emits no srcset when the reference ratio is unknown (pending variant, no original dimensions)', () => {
    const media = item({
      width: null,
      height: null,
      variants: [
        variant({ size: 'content', width: 0, height: 0, state: 'pending', path: '/api/media/m1/variants/content' }),
        variant({ size: 'thumb', width: 320, height: 240, path: '/api/media/m1/variants/thumb.webp' }),
      ],
    })
    const sources = pickImageSources(media, 'content')
    expect(sources?.srcset).toBeNull()
    expect(sources?.width).toBeNull()
    expect(sources?.height).toBeNull()
  })

  it('restricts srcset with `only`, without affecting src', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [
        variant({ size: 'thumb', width: 320, height: 240, path: '/api/media/m1/variants/thumb.webp' }),
        variant({ size: 'small', width: 640, height: 480, path: '/api/media/m1/variants/small.webp' }),
        variant({ size: 'medium', width: 1024, height: 768, path: '/api/media/m1/variants/medium.webp' }),
      ],
    })
    const sources = pickImageSources(media, 'medium', ['thumb', 'small'])
    expect(sources?.srcset).toBe('/api/media/m1/variants/thumb.webp 320w, /api/media/m1/variants/small.webp 640w')
    expect(sources?.src).toBe('/api/media/m1/variants/medium.webp')
  })

  it('dedupes candidates by width, keeping the first', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [
        variant({ size: 'a', width: 640, height: 480, path: '/api/media/m1/variants/a.webp' }),
        variant({ size: 'b', width: 640, height: 480, path: '/api/media/m1/variants/b.webp' }),
      ],
    })
    const sources = pickImageSources(media, 'a')
    expect(sources?.srcset).toBe('/api/media/m1/variants/a.webp 640w')
  })

  it('tolerates sub-percent rounding differences between generated variants', () => {
    const media = item({
      width: 1200,
      height: 900,
      variants: [
        variant({ size: 'content', width: 1200, height: 900, path: '/api/media/m1/variants/content.webp' }),
        variant({ size: 'thumb', width: 320, height: 241, path: '/api/media/m1/variants/thumb.webp' }),
      ],
    })
    const sources = pickImageSources(media, 'content')
    expect(sources?.srcset).toBe('/api/media/m1/variants/thumb.webp 320w, /api/media/m1/variants/content.webp 1200w')
  })
})
