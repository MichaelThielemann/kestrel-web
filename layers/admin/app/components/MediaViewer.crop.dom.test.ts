import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick } from 'vue'
import type { AdminSchema, MediaItem } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import MediaViewer from './MediaViewer.vue'

const { schema, api } = vi.hoisted(() => {
  const schema: AdminSchema = {
    locales: { all: ['en'], primary: 'en', prefixPrimary: false },
    collections: [],
    features: [],
    capabilities: { setMediaFraming: { method: 'PUT', path: '/media/:id/framing' } },
  }
  const api = { answer: (_route: { method: string, path: string }): Promise<unknown> => Promise.resolve([]) }
  return { schema, api }
})

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

mockNuxtImport('useAdminApi', () => () => (route: { method: string, path: string }) => api.answer(route))

function photo(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'm1', filename: 'harbour.jpg', folder: '', contentType: 'image/jpeg', size: 1, path: '/media/m1/harbour.jpg', available: true,
    createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: 1200, height: 800,
    alt: null, title: null, description: null, variants: [], variantCounts: { done: 0, pending: 0, error: 0, failed: 0 },
    focus: null, framing: { focus: null, crops: {}, width: 1200, height: 800, ratios: [{ key: '1:1', sizes: ['avatar'], manual: false, fits: true, crop: null }] },
    ...over,
  }
}

const cropButton = () => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === en['mediaCrop.open'])

describe('MediaViewer crop entry', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    schema.capabilities.setMediaFraming = { method: 'PUT', path: '/media/:id/framing' }
  })

  it('opens the crop editor over the viewer for an image the role may write', async () => {
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file: photo(), canSave: true, canDelete: false }, attachTo: document.body })

    expect(cropButton()).toBeTruthy()
    cropButton()?.click()
    await nextTick()
    await vi.waitFor(() => expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(2))
    expect(document.body.textContent).toContain(en['mediaCrop.title'].replace('{name}', 'harbour.jpg'))
    wrapper.unmount()
  })

  it('hands a saved framing on and keeps the viewer open', async () => {
    const saved = photo({ focus: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } })
    api.answer = (route) => Promise.resolve(route.method === 'PUT' ? saved : [])
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file: photo(), canSave: true, canDelete: false }, attachTo: document.body })

    cropButton()?.click()
    await vi.waitFor(() => expect(document.body.querySelector('.ui-rect-select__surface')).not.toBeNull())
    document.body.querySelector('.ui-rect-select__surface')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    const cropDialog = document.body.querySelector('.media-crop')?.closest('[role="dialog"]')
    Array.from(cropDialog?.querySelectorAll('button') ?? []).find((b) => b.textContent?.trim() === en['common.save'])?.click()

    await vi.waitFor(() => expect(wrapper.emitted('framed')).toEqual([[saved]]))
    expect(wrapper.emitted('update:open')).toBeUndefined()
    wrapper.unmount()
  })

  it('offers no crop for a file that is not an image', async () => {
    const pdf = photo({ contentType: 'application/pdf', filename: 'a.pdf', framing: { focus: null, crops: {}, width: null, height: null, ratios: [] } })
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file: pdf, canSave: true, canDelete: false }, attachTo: document.body })

    expect(cropButton()).toBeUndefined()
    wrapper.unmount()
  })

  it('offers no crop to a role that may not write media', async () => {
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file: photo(), canSave: false, canDelete: false }, attachTo: document.body })

    expect(cropButton()).toBeUndefined()
    wrapper.unmount()
  })

  it('offers no crop without the framing capability', async () => {
    delete schema.capabilities.setMediaFraming
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file: photo(), canSave: true, canDelete: false }, attachTo: document.body })

    expect(cropButton()).toBeUndefined()
    wrapper.unmount()
  })
})
