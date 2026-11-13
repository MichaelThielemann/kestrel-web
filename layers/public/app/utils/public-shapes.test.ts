import { describe, expect, it } from 'vitest'
import type { AnonymousOf, MediaItem, PageDocument } from '#kestrel-core/app/types/api'
import { toPublicMedia, toPublicPage, toPublicSiteResponse } from './public-shapes'

const stored: MediaItem = {
  id: 'm1',
  path: '/media/m1/photo.jpg',
  filename: 'photo.jpg',
  folder: 'internal/folder',
  contentType: 'image/jpeg',
  size: 12345,
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
  provenance: { origin: 'human' },
  width: 1200,
  height: 900,
  alt: 'A tree',
  title: 'Tree',
  description: 'A tree in a field',
  available: true,
  variants: [{ size: 'content', width: 640, height: 480, format: 'webp', bytes: 2048, state: 'pending', path: '/media/m1/variants/content.webp', crop: null }],
  variantCounts: { done: 0, pending: 1, error: 0, failed: 0 },
  focus: { x: 0.5, y: 0.1, w: 0.25, h: 0.2 },
  framing: { focus: { x: 0.5, y: 0.1, w: 0.25, h: 0.2 }, crops: {}, width: 1200, height: 900, ratios: [] },
}

describe('toPublicMedia', () => {
  it('keeps exactly the fields a visitor may see', () => {
    expect(toPublicMedia(stored)).toEqual({
      id: 'm1',
      path: '/media/m1/photo.jpg',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      size: 12345,
      width: 1200,
      height: 900,
      alt: 'A tree',
      title: 'Tree',
      description: 'A tree in a field',
      provenance: { origin: 'human' },
      focus: { x: 0.5, y: 0.1, w: 0.25, h: 0.2 },
      variants: [{ size: 'content', width: 640, height: 480, format: 'webp', path: '/media/m1/variants/content.webp', crop: null }],
    })
  })

  it('keeps the crop a variant shows, and leaves it out when the answer has none', () => {
    const crop = { left: 120, top: 40, width: 600, height: 600 }
    const cut: MediaItem = { ...stored, variants: [{ size: 'avatar', width: 96, height: 96, format: 'webp', bytes: 512, state: 'done', path: '/media/m1/variants/avatar.webp?v=2', crop }] }
    expect(toPublicMedia(cut).variants[0]?.crop).toEqual(crop)
    const { crop: _crop, ...withoutCrop } = { size: 'avatar', width: 96, height: 96, format: 'webp', path: '/media/m1/variants/avatar.webp', crop }
    const narrowed = toPublicMedia({ ...stored, variants: [withoutCrop] })
    expect(narrowed.variants[0]).not.toHaveProperty('crop')
  })

  it('keeps a variant path with its version query as the server answered it', () => {
    const versioned: MediaItem = { ...stored, variants: [{ size: 'content', width: 640, height: 480, format: 'webp', bytes: 2048, state: 'done', path: '/media/m1/variants/content.webp?v=k3j9', crop: null }] }
    expect(toPublicMedia(versioned).variants[0]?.path).toBe('/media/m1/variants/content.webp?v=k3j9')
  })

  it('gives an answer without a focus, as the media reads answer without images, a null focus', () => {
    const { focus: _focus, framing: _framing, variants: _variants, ...withoutImages } = stored
    expect(toPublicMedia(withoutImages).focus).toBeNull()
  })

  it('drops the library folder, the timestamps, the variant counts and every variant\'s state', () => {
    const shaped = toPublicMedia(stored)
    for (const key of ['folder', 'createdAt', 'updatedAt', 'variantCounts', 'available', 'framing']) expect(shaped).not.toHaveProperty(key)
    for (const variant of shaped.variants) {
      expect(variant).not.toHaveProperty('state')
      expect(variant).not.toHaveProperty('bytes')
    }
  })
})

const anonymous: AnonymousOf<'getMedia'> = {
  id: 'm1',
  path: '/media/m1/photo.jpg',
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
  size: 12345,
  width: 1200,
  height: 900,
  alt: 'A tree',
  title: 'Tree',
  description: 'A tree in a field',
  provenance: { origin: 'human' },
  focus: { x: 0.5, y: 0.1, w: 0.25, h: 0.2 },
  variants: [{ size: 'content', width: 640, height: 480, format: 'webp', path: '/media/m1/variants/content.webp', crop: null }],
}

describe('toPublicMedia of what the server answers', () => {
  it('turns a signed-in answer into exactly the anonymous answer of the same item', () => {
    expect(toPublicMedia(stored)).toEqual(anonymous)
  })

  it('leaves an anonymous answer as it is', () => {
    expect(toPublicMedia(anonymous)).toEqual(anonymous)
  })

  it('gives an item without variants, as a preset without images answers it, an empty variant list', () => {
    const { variants: _variants, ...withoutVariants } = anonymous
    expect(toPublicMedia(withoutVariants)).toEqual({ ...anonymous, variants: [] })
  })
})

const signedInPage: PageDocument = {
  id: 'p1',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
  slug: 'about',
  title: 'About',
  body: [],
  seo: null,
  status: 'published',
  shareImage: null,
  layout: null,
  _locale: 'de',
  _locales: { title: 'de' },
  _translations: { de: true, en: false },
  _links: { p2: { path: '/contact', locale: 'de' } },
}

describe('toPublicPage', () => {
  it('turns a signed-in page answer into the anonymous one: everything but the timestamps', () => {
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...expected } = signedInPage
    expect(toPublicPage(signedInPage)).toEqual(expected)
  })

  it('leaves an anonymous page answer as it is', () => {
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...page } = signedInPage
    expect(toPublicPage(page)).toEqual(page)
  })

  it('leaves a null body as it is', () => {
    expect(toPublicPage({ ...signedInPage, body: null }).body).toBeNull()
  })
})

describe('toPublicSiteResponse', () => {
  it('shapes a page answer and passes a redirect hit through', () => {
    expect(toPublicSiteResponse(signedInPage)).not.toHaveProperty('createdAt')
    const hit = { redirect: { to: '/new', status: 301 as const } }
    expect(toPublicSiteResponse(hit)).toEqual(hit)
  })
})
