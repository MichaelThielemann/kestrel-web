import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { computed } from 'vue'
import { describe, expect, it } from 'vitest'
import type { AdminSchema, MediaVariant } from '#kestrel-admin/types/api'
import MediaThumb from './MediaThumb.vue'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: { downloadMedia: { method: 'GET', path: '/media/:id/file' } },
}

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

function variant(over: Partial<MediaVariant> = {}): MediaVariant {
  return { size: 'thumb', width: 320, height: 240, format: 'webp', bytes: 1000, state: 'done', path: '/api/media/f1/variants/thumb.webp', ...over }
}

describe('MediaThumb', () => {
  it('takes src verbatim from the smallest ready variant, never assembling a variants URL itself', async () => {
    const wrapper = await mountSuspended(MediaThumb, { props: { id: 'f1', contentType: 'image/jpeg', variants: [variant()] } })

    expect(wrapper.get('img').attributes('src')).toBe('/api/media/f1/variants/thumb.webp')
  })

  it('falls back to the original file when variants do not apply', async () => {
    const wrapper = await mountSuspended(MediaThumb, { props: { id: 'f1', contentType: 'image/jpeg', variants: [] } })

    expect(wrapper.get('img').attributes('src')).toBe('/api/media/f1/file')
  })

  it('shows a placeholder instead of the heavy original while variants are still pending', async () => {
    const wrapper = await mountSuspended(MediaThumb, { props: { id: 'f1', contentType: 'image/jpeg', variants: [], pending: true } })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.media-thumb--pending').exists()).toBe(true)
  })

  it('prefers a ready variant over the pending placeholder once one arrives', async () => {
    const wrapper = await mountSuspended(MediaThumb, { props: { id: 'f1', contentType: 'image/jpeg', variants: [variant()], pending: true } })

    expect(wrapper.get('img').attributes('src')).toBe('/api/media/f1/variants/thumb.webp')
  })

  it('shows the file placeholder instead of an image without the downloadMedia capability', async () => {
    schema.capabilities = {}
    const wrapper = await mountSuspended(MediaThumb, { props: { id: 'f1', contentType: 'image/jpeg', variants: [variant()] } })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.media-thumb--file').exists()).toBe(true)
    schema.capabilities = { downloadMedia: { method: 'GET', path: '/media/:id/file' } }
  })
})
