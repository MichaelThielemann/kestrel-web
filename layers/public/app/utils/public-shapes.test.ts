import { describe, expect, it } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
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
  variants: [{ size: 'content', width: 640, height: 480, format: 'webp', bytes: 2048, state: 'pending', path: '/media/m1/variants/content.webp' }],
  variantCounts: { done: 0, pending: 1, error: 0, failed: 0 },
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
      variants: [{ size: 'content', width: 640, height: 480, format: 'webp', path: '/media/m1/variants/content.webp' }],
    })
  })

  it('drops the library folder, the timestamps, the variant counts and every variant\'s state', () => {
    const shaped = toPublicMedia(stored)
    for (const key of ['folder', 'createdAt', 'updatedAt', 'variantCounts', 'available']) expect(shaped).not.toHaveProperty(key)
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
  variants: [{ size: 'content', width: 640, height: 480, format: 'webp', path: '/media/m1/variants/content.webp' }],
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

  it('drops a block alias, at any depth, from the body', () => {
    const aliased = boundaryCast<PageDocument>({
      ...signedInPage,
      body: [{ id: 'b1', type: 'hero', alias: 'Intro teaser', props: {}, slots: { items: [{ id: 'b2', type: 'hero', alias: 'Nested', props: {} }] } }],
    }, 'json')
    expect(toPublicPage(aliased).body).toEqual([{ id: 'b1', type: 'hero', props: {}, slots: { items: [{ id: 'b2', type: 'hero', props: {} }] } }])
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
