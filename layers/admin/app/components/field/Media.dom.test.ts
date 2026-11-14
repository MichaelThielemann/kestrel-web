import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, nextTick } from 'vue'
import type { AdminSchema, MediaItem } from '#kestrel-admin/types/api'
import type { FieldDef } from '#kestrel-admin/types/kestrel'
import { en } from '#kestrel-admin/i18n/en'
import { notifyMediaChanged, notifyMediaFramed, notifyMediaRemoved } from '../../composables/useMediaChanges'
import FieldMedia from './Media.vue'

const { schema, apiHandler } = vi.hoisted(() => {
  const schema: AdminSchema = {
    locales: { all: ['en'], primary: 'en', prefixPrimary: false },
    collections: [],
    features: [],
    capabilities: { listMedia: { method: 'GET', path: '/media' }, listMediaFolders: { method: 'GET', path: '/media/folders' } },
  }
  const apiHandler = { fn: (_path: string, _options?: unknown): Promise<unknown> => Promise.resolve({ items: [], total: 0 }) }
  return { schema, apiHandler }
})

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

mockNuxtImport('useAdminApi', () => () => (path: string, options?: unknown) => apiHandler.fn(path, options))

function mediaItem(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'f1', filename: 'a.jpg', folder: '', contentType: 'image/jpeg', size: 1, path: '/media/f1/a.jpg', available: true,
    createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null,
    alt: null, title: null, description: null, variants: [], variantCounts: { done: 0, pending: 1, error: 0, failed: 0 }, focus: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] },
    ...over,
  }
}

function queryIds(options: unknown): string | undefined {
  if (typeof options !== 'object' || options === null || !('query' in options)) return undefined
  const query = options.query
  if (typeof query !== 'object' || query === null || !('ids' in query)) return undefined
  return typeof query.ids === 'string' ? query.ids : undefined
}

const field: FieldDef = { type: 'media', label: 'Hero image', options: { multiple: false, accept: 'any' } }

const PickerStub = defineComponent({
  emits: ['confirm'],
  template: '<button data-test="stub-confirm" type="button" @click="$emit(\'confirm\', [\'f2\'])">confirm</button>',
})

describe('field/Media load watch', () => {
  afterEach(() => {
    apiHandler.fn = () => Promise.resolve({ items: [], total: 0 })
  })

  it('offers the library only to a caller who may browse it', async () => {
    const browse = schema.capabilities.listMediaFolders
    const pickButton = (wrapper: { findAll: (selector: string) => Array<{ text: () => string }> }) => wrapper.findAll('button').some((button) => button.text() === en['field.media.select'] || button.text() === en['field.media.add'])
    const allowed = await mountSuspended(FieldMedia, { props: { field, name: 'hero', locale: 'en', modelValue: null } })
    expect(pickButton(allowed)).toBe(true)
    delete schema.capabilities.listMediaFolders
    try {
      const refused = await mountSuspended(FieldMedia, { props: { field, name: 'hero', locale: 'en', modelValue: null } })
      expect(pickButton(refused)).toBe(false)
    } finally {
      if (browse !== undefined) schema.capabilities.listMediaFolders = browse
    }
  })

  it('keeps a stored unavailable id and shows a hint instead of removing it', async () => {
    apiHandler.fn = () => Promise.resolve({ items: [mediaItem({ id: 'f1', available: false })], total: 1 })

    const wrapper = await mountSuspended(FieldMedia, {
      props: { field, name: 'hero', locale: 'en', modelValue: 'f1', disabled: true },
    })
    await vi.waitFor(() => expect(wrapper.find('.field-media__item').exists()).toBe(true))

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.text()).toContain(en['field.media.storedProcessing'])
    expect(wrapper.text()).not.toContain(en['field.media.processing'])
    expect(wrapper.find('.field-media__item').exists()).toBe(true)
  })

  it('leaves an available stored id alone', async () => {
    apiHandler.fn = () => Promise.resolve({ items: [mediaItem({ id: 'f1', available: true })], total: 1 })

    const wrapper = await mountSuspended(FieldMedia, {
      props: { field, name: 'hero', locale: 'en', modelValue: 'f1' },
    })
    await vi.waitFor(() => expect(wrapper.find('.field-media__item').exists()).toBe(true))

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.text()).not.toContain(en['field.media.processing'])
    expect(wrapper.text()).not.toContain(en['field.media.storedProcessing'])
  })

  it('names a stored id that lies in the trash and says so, keeping the id', async () => {
    schema.capabilities.listMediaTrash = { method: 'GET', path: '/media/trash' }
    apiHandler.fn = (route) => Promise.resolve(JSON.stringify(route).includes('/media/trash')
      ? { items: [{ id: 'f1', filename: 'old-hero.jpg' }], total: 1 }
      : { items: [], total: 0 })
    try {
      const wrapper = await mountSuspended(FieldMedia, {
        props: { field, name: 'hero', locale: 'en', modelValue: 'f1' },
      })
      await vi.waitFor(() => expect(wrapper.find('.field-media__trashed').exists()).toBe(true))

      expect(wrapper.find('.field-media__filename').text()).toBe('old-hero.jpg')
      expect(wrapper.find('.field-media__trashed').text()).toBe(en['field.media.trashed'])
      expect(wrapper.text()).toContain(en['field.media.trashedHint'])
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    } finally {
      delete schema.capabilities.listMediaTrash
    }
  })

  it('marks a held item as trashed once it leaves the library elsewhere, and shows it again once restored', async () => {
    schema.capabilities.listMediaTrash = { method: 'GET', path: '/media/trash' }
    let inTrash = false
    apiHandler.fn = (route) => {
      const trash = JSON.stringify(route).includes('/media/trash')
      if (trash) return Promise.resolve(inTrash ? { items: [{ id: 'f1', filename: 'hero.jpg' }], total: 1 } : { items: [], total: 0 })
      return Promise.resolve(inTrash ? { items: [], total: 0 } : { items: [mediaItem({ id: 'f1', filename: 'hero.jpg' })], total: 1 })
    }
    try {
      const wrapper = await mountSuspended(FieldMedia, { props: { field, name: 'hero', locale: 'en', modelValue: 'f1' } })
      await vi.waitFor(() => expect(wrapper.find('.field-media__filename').text()).toBe('hero.jpg'))
      expect(wrapper.find('.field-media__trashed').exists()).toBe(false)

      inTrash = true
      await notifyMediaRemoved(['f1', 'other'])
      await vi.waitFor(() => expect(wrapper.find('.field-media__trashed').exists()).toBe(true))
      expect(wrapper.find('img').exists()).toBe(false)
      expect(wrapper.text()).toContain(en['field.media.trashedHint'])

      inTrash = false
      await notifyMediaChanged({ restored: ['f1'] })
      await vi.waitFor(() => expect(wrapper.find('.field-media__trashed').exists()).toBe(false))
      expect(wrapper.find('.field-media__filename').text()).toBe('hero.jpg')
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    } finally {
      delete schema.capabilities.listMediaTrash
    }
  })
})

describe('field/Media picker folder hint', () => {
  afterEach(() => {
    apiHandler.fn = () => Promise.resolve({ items: [], total: 0 })
  })

  it('passes no initial folder to the picker when nothing is stored yet, so it falls back to the remembered folder', async () => {
    const wrapper = await mountSuspended(FieldMedia, {
      props: { field, name: 'hero', locale: 'en', modelValue: null },
      global: { stubs: { KestrelMediaPicker: PickerStub } },
    })

    expect(wrapper.findComponent(PickerStub).attributes('initial-folder')).toBeUndefined()
  })

  it('passes the stored item\'s folder as the initial folder once it is known', async () => {
    apiHandler.fn = () => Promise.resolve({ items: [mediaItem({ id: 'f1', folder: 'products' })], total: 1 })

    const wrapper = await mountSuspended(FieldMedia, {
      props: { field, name: 'hero', locale: 'en', modelValue: 'f1' },
      global: { stubs: { KestrelMediaPicker: PickerStub } },
    })
    await vi.waitFor(() => expect(wrapper.findComponent(PickerStub).attributes('initial-folder')).toBe('products'))
  })
})

describe('field/Media confirm gate', () => {
  afterEach(() => {
    apiHandler.fn = () => Promise.resolve({ items: [], total: 0 })
  })

  it('refuses a newly picked id the fresh check finds unavailable, keeping the previous value', async () => {
    apiHandler.fn = (_path: string, options?: unknown) => {
      const ids = queryIds(options)
      if (ids === 'f2') return Promise.resolve({ items: [mediaItem({ id: 'f2', available: false })], total: 1 })
      return Promise.resolve({ items: [], total: 0 })
    }

    const wrapper = await mountSuspended(FieldMedia, {
      props: { field, name: 'hero', locale: 'en', modelValue: null },
      global: { stubs: { KestrelMediaPicker: PickerStub } },
    })
    await wrapper.get('[data-test="stub-confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain(en['field.media.processing']))

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('refuses a newly picked id the fresh check no longer finds, keeping the previous value', async () => {
    apiHandler.fn = () => Promise.resolve({ items: [], total: 0 })

    const wrapper = await mountSuspended(FieldMedia, {
      props: { field, name: 'hero', locale: 'en', modelValue: null },
      global: { stubs: { KestrelMediaPicker: PickerStub } },
    })
    await wrapper.get('[data-test="stub-confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain(en['field.media.gone']))

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('accepts a newly picked id the fresh check finds available', async () => {
    apiHandler.fn = (_path: string, options?: unknown) => {
      const ids = queryIds(options)
      if (ids === 'f2') return Promise.resolve({ items: [mediaItem({ id: 'f2', available: true })], total: 1 })
      return Promise.resolve({ items: [], total: 0 })
    }

    const wrapper = await mountSuspended(FieldMedia, {
      props: { field, name: 'hero', locale: 'en', modelValue: null },
      global: { stubs: { KestrelMediaPicker: PickerStub } },
    })
    await wrapper.get('[data-test="stub-confirm"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('update:modelValue')).toBeDefined())

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['f2'])
  })
})

describe('field/Media crop entry', () => {
  const framed = (over: Partial<MediaItem> = {}) => mediaItem({
    id: 'f1', filename: 'harbour.jpg', variantCounts: { done: 1, pending: 0, error: 0, failed: 0 },
    framing: { focus: null, crops: {}, width: 1200, height: 800, ratios: [{ key: '1:1', sizes: ['avatar'], manual: false, fits: true, crop: null }] },
    ...over,
  })
  const cropLabel = en['mediaCrop.openFor'].replace('{name}', 'harbour.jpg')
  const cropButton = (wrapper: { find: (selector: string) => { exists: () => boolean, trigger: (event: string) => Promise<void> } }) => wrapper.find(`button[aria-label="${cropLabel}"]`)

  afterEach(() => {
    apiHandler.fn = () => Promise.resolve({ items: [], total: 0 })
    delete schema.capabilities.setMediaFraming
    document.body.innerHTML = ''
  })

  it('opens the crop editor from the chosen image and keeps the answered framing', async () => {
    schema.capabilities.setMediaFraming = { method: 'PUT', path: '/media/:id/framing' }
    const saved = framed({ focus: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } })
    apiHandler.fn = (route) => {
      const text = JSON.stringify(route)
      if (text.includes('/framing')) return Promise.resolve(saved)
      return Promise.resolve({ items: [framed()], total: 1 })
    }
    const wrapper = await mountSuspended(FieldMedia, { props: { field, name: 'hero', locale: 'en', modelValue: 'f1' }, attachTo: document.body })
    await vi.waitFor(() => expect(cropButton(wrapper).exists()).toBe(true))

    await cropButton(wrapper).trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('.media-crop')).not.toBeNull())
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(en['mediaCrop.title'].replace('{name}', 'harbour.jpg'))
    document.body.querySelector('.ui-rect-select__surface')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    Array.from(document.body.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent?.trim() === en['common.save'])?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    await vi.waitFor(() => expect(document.body.querySelector('.media-crop')).toBeNull())
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('takes a framing saved elsewhere for the same image, so its crop editor starts from it', async () => {
    schema.capabilities.setMediaFraming = { method: 'PUT', path: '/media/:id/framing' }
    apiHandler.fn = () => Promise.resolve({ items: [framed()], total: 1 })
    const wrapper = await mountSuspended(FieldMedia, { props: { field, name: 'hero', locale: 'en', modelValue: 'f1' }, attachTo: document.body })
    await vi.waitFor(() => expect(cropButton(wrapper).exists()).toBe(true))

    await notifyMediaFramed(framed({ focus: { x: 0.5, y: 0.25, w: 0.25, h: 0.5 }, framing: { ...framed().framing, focus: { x: 0.5, y: 0.25, w: 0.25, h: 0.5 } } }))
    await notifyMediaFramed(framed({ id: 'other' }))
    await cropButton(wrapper).trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector<HTMLInputElement>('input[data-field="x"]')?.value).toBe('50'))
    wrapper.unmount()
  })

  it('offers the crop of a held WebP once its whole-image variant has finished rendering', async () => {
    schema.capabilities.setMediaFraming = { method: 'PUT', path: '/media/:id/framing' }
    schema.features = ['images']
    const large = { size: 'large', width: 1200, height: 800, format: 'webp', bytes: 1, path: '/media/f1/variants/large.webp', crop: null }
    const rendering = framed({ contentType: 'image/webp', path: '/media/f1/harbour.webp', variants: [{ ...large, state: 'pending' }], variantCounts: { done: 0, pending: 1, error: 0, failed: 0 } })
    const rendered = framed({ ...rendering, variants: [{ ...large, state: 'done' }], variantCounts: { done: 1, pending: 0, error: 0, failed: 0 } })
    let lookups = 0
    apiHandler.fn = () => Promise.resolve({ items: [lookups++ === 0 ? rendering : rendered], total: 1 })
    try {
      const wrapper = await mountSuspended(FieldMedia, { props: { field, name: 'hero', locale: 'en', modelValue: 'f1' } })
      await vi.waitFor(() => expect(wrapper.find('.field-media__filename').text()).toBe('harbour.jpg'))
      expect(cropButton(wrapper).exists()).toBe(false)

      await vi.waitFor(() => expect(cropButton(wrapper).exists()).toBe(true))
      expect(lookups).toBeGreaterThan(1)
      wrapper.unmount()
    } finally {
      schema.features = []
    }
  })

  it('offers no crop for an item in the trash, a file that is not an image, or without the capability', async () => {
    apiHandler.fn = () => Promise.resolve({ items: [framed()], total: 1 })
    const refused = await mountSuspended(FieldMedia, { props: { field, name: 'hero', locale: 'en', modelValue: 'f1' } })
    await vi.waitFor(() => expect(refused.find('.field-media__filename').text()).toBe('harbour.jpg'))
    expect(cropButton(refused).exists()).toBe(false)

    schema.capabilities.setMediaFraming = { method: 'PUT', path: '/media/:id/framing' }
    apiHandler.fn = () => Promise.resolve({ items: [framed({ contentType: 'application/pdf', framing: { focus: null, crops: {}, width: null, height: null, ratios: [] } })], total: 1 })
    const pdf = await mountSuspended(FieldMedia, { props: { field, name: 'hero', locale: 'en', modelValue: 'f1' } })
    await vi.waitFor(() => expect(pdf.find('.field-media__filename').text()).toBe('harbour.jpg'))
    expect(cropButton(pdf).exists()).toBe(false)

    schema.capabilities.listMediaTrash = { method: 'GET', path: '/media/trash' }
    apiHandler.fn = (route) => Promise.resolve(JSON.stringify(route).includes('/media/trash')
      ? { items: [{ id: 'f1', filename: 'harbour.jpg' }], total: 1 }
      : { items: [], total: 0 })
    try {
      const trashed = await mountSuspended(FieldMedia, { props: { field, name: 'hero', locale: 'en', modelValue: 'f1' } })
      await vi.waitFor(() => expect(trashed.find('.field-media__trashed').exists()).toBe(true))
      expect(cropButton(trashed).exists()).toBe(false)
    } finally {
      delete schema.capabilities.listMediaTrash
    }
  })
})
