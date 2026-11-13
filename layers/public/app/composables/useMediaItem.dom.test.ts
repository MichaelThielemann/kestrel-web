import { defineComponent, h, ref } from 'vue'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { MediaItem } from '#kestrel-core/app/types/api'
import { toPublicMedia, type PublicMediaItem } from '../utils/public-shapes'
import { useMediaItem } from './useMediaItem'

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

async function mountProbe(id: () => string | null, locale: string) {
  let result: PublicMediaItem | null | undefined
  const localeRef = ref(locale)
  const Probe = defineComponent({
    async setup() {
      const { data } = await useMediaItem(id, localeRef)
      result = data.value
      return () => h('div')
    },
  })
  await mountSuspended(Probe)
  return { result: () => result }
}

describe('useMediaItem', () => {
  it('reads a media item by id, by GET /api/media/:id, never by listing, and keeps its public fields only', async () => {
    const calls: string[] = []
    registerEndpoint('/api/media/m1', { method: 'GET', handler: (event) => { calls.push(event.path); return item({ folder: 'library/internal' }) } })

    const { result } = await mountProbe(() => 'm1', 'en')

    expect(result()).toEqual(toPublicMedia(item()))
    expect(result()).not.toHaveProperty('folder')
    expect(calls.some((call) => call.endsWith('/api/media/m1?locale=en'))).toBe(true)
  })

  it('resolves a 404 quietly to null instead of throwing', async () => {
    registerEndpoint('/api/media/missing', {
      method: 'GET',
      handler: (event) => { event.node.res.statusCode = 404; return { error: 'not found', code: 'NOT_FOUND', retryable: false } },
    })

    const { result } = await mountProbe(() => 'missing', 'en')

    expect(result()).toBeNull()
  })

  it('resolves to null without fetching when there is no id', async () => {
    const { result } = await mountProbe(() => null, 'en')
    expect(result()).toBeNull()
  })
})
