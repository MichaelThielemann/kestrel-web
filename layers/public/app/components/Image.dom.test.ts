import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { MediaItem, MediaVariant } from '#kestrel-core/app/types/api'
import KestrelImage from './Image.vue'

function variant(over: Partial<MediaVariant> = {}): MediaVariant {
  return { size: 'content', width: 640, height: 360, format: 'webp', bytes: 1000, state: 'done', path: '/media/m1/variants/content.webp', ...over }
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

describe('KestrelImage', () => {
  it('sets width, height, aspect-ratio and object-fit on a linked variant', async () => {
    const media = item({ variants: [variant({ width: 640, height: 360 })] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    const img = wrapper.get('img')
    expect(img.attributes('src')).toBe('/media/m1/variants/content.webp')
    expect(img.attributes('width')).toBe('640')
    expect(img.attributes('height')).toBe('360')
    expect(img.attributes('style')).toContain('aspect-ratio: 640 / 360')
    expect(img.attributes('style')).toContain('object-fit: cover')
  })

  it('sets no aspect-ratio or object-fit style on the original (no named variant)', async () => {
    const media = item({ variants: [] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    const img = wrapper.get('img')
    expect(img.attributes('src')).toBe('/media/m1/photo.jpg')
    expect(img.attributes('style')).toBeFalsy()
  })

  it('places a variant on the centre of its focus with object-position', async () => {
    const media = item({ focus: { x: 0.1, y: 0.5, w: 0.3, h: 0.2 }, variants: [variant()] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    const style = wrapper.get('img').attributes('style') ?? ''
    expect(style).toContain('object-fit: cover')
    expect(style).toContain('object-position: 25% 60%')
  })

  it('places the original, shown while no variant is named, on the centre of its focus as well', async () => {
    const media = item({ focus: { x: 0.8, y: 0, w: 0, h: 0 }, variants: [] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    const img = wrapper.get('img')
    expect(img.attributes('src')).toBe('/media/m1/photo.jpg')
    expect(img.attributes('style')).toBe('object-position: 80% 0%;')
  })

  it('places a variant whose path still holds the original on the centre of its focus', async () => {
    const media = item({ focus: { x: 0, y: 0, w: 1, h: 1 }, variants: [variant({ state: 'pending' })] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    expect(wrapper.get('img').attributes('style')).toContain('object-position: 50% 50%')
  })

  it('rounds the position to hundredths of a percent', async () => {
    const media = item({ focus: { x: 1 / 3, y: 0.1, w: 0, h: 0.2 }, variants: [variant()] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    expect(wrapper.get('img').attributes('style')).toContain('object-position: 33.33% 20%')
  })

  it('sets no object-position without a focus', async () => {
    const media = item({ focus: null, variants: [variant()] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    expect(wrapper.get('img').attributes('style')).not.toContain('object-position')
  })
})
