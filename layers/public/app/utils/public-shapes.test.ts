import { describe, expect, it } from 'vitest'
import type { MediaItem } from '#kestrel-core/app/types/api'
import { toPublicMedia } from './public-shapes'

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
