import { computed, reactive } from 'vue'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminSchema, Document } from '#kestrel-admin/types/api'
import type { SerializedField } from '#kestrel-admin/types/kestrel'
import { en } from '#kestrel-admin/i18n/en'
import RecordPage from './[id].vue'

beforeEach(() => {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
})

function widgetsCapabilities(withDelete: boolean): AdminSchema['collections'][number]['capabilities'] {
  return {
    readAny: { method: 'GET', path: '/admin/widgets/:id' },
    update: { method: 'PATCH', path: '/widgets/:id' },
    ...(withDelete ? { delete: { method: 'DELETE', path: '/widgets/:id' } } : {}),
  }
}

const { rawSchemaState } = vi.hoisted(() => {
  const titleField: SerializedField = { type: 'text', required: true, unique: false, localized: true, label: 'Title' }
  function collection(capabilities: AdminSchema['collections'][number]['capabilities']): AdminSchema['collections'][number] {
    return {
      name: 'widgets',
      mode: 'multi',
      translatable: true,
      pageLike: false,
      seo: false,
      status: false,
      layoutField: false,
      blocks: { enabled: false },
      editor: 'fields',
      nav: true,
      placement: 'rail',
      fields: { title: titleField },
      fieldLayout: [{ kind: 'row', fields: ['title'], tracks: [1] }],
      capabilities,
    }
  }
  return {
    rawSchemaState: {
      collection: collection({ readAny: { method: 'GET', path: '/admin/widgets/:id' }, update: { method: 'PATCH', path: '/widgets/:id' } }),
      locales: ['en'] as string[],
    },
  }
})
const schemaState = reactive(rawSchemaState)

mockNuxtImport('useRoute', () => () => ({
  params: { collection: 'widgets', id: 'w1' },
  query: {},
  path: '/admin/widgets/w1',
  fullPath: '/admin/widgets/w1',
}))

mockNuxtImport('useSchema', () => () => ({
  schema: computed<AdminSchema>(() => ({ locales: { all: schemaState.locales, primary: 'en', prefixPrimary: false }, collections: [schemaState.collection], features: [], capabilities: {} })),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

function baseRecord(): Document {
  return { id: 'w1', title: 'A widget', createdAt: 0, updatedAt: 0, _translations: { en: true } }
}

describe('the record page delete gate', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schemaState.collection = { ...schemaState.collection, capabilities: widgetsCapabilities(false), workflow: undefined }
    schemaState.locales = ['en']
  })

  it('offers no delete without the delete capability', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/widgets/w1', { method: 'GET', handler: () => baseRecord() }))

    const wrapper = await mountSuspended(RecordPage)
    await vi.waitFor(() => expect(wrapper.find('input').exists()).toBe(true))

    expect(wrapper.text()).not.toContain(en['common.delete'])
    wrapper.unmount()
  })

  it('offers delete with the delete capability', async () => {
    schemaState.collection = { ...schemaState.collection, capabilities: widgetsCapabilities(true) }
    unregisterAll.push(registerEndpoint('/api/admin/widgets/w1', { method: 'GET', handler: () => baseRecord() }))

    const wrapper = await mountSuspended(RecordPage)
    await vi.waitFor(() => expect(wrapper.find('input').exists()).toBe(true))

    expect(wrapper.text()).toContain(en['common.delete'])
    wrapper.unmount()
  })

  it('keeps offering delete with deleteTranslation alone, without the delete capability', async () => {
    schemaState.locales = ['en', 'de']
    schemaState.collection = {
      ...schemaState.collection,
      capabilities: {
        readAny: { method: 'GET', path: '/admin/widgets/:id' },
        update: { method: 'PATCH', path: '/widgets/:id' },
        deleteTranslation: { method: 'DELETE', path: '/widgets/:id/translations/:locale' },
      },
    }
    unregisterAll.push(registerEndpoint('/api/admin/widgets/w1', {
      method: 'GET',
      handler: () => ({ id: 'w1', title: 'A widget', createdAt: 0, updatedAt: 0, _translations: { en: true, de: true } }),
    }))

    const wrapper = await mountSuspended(RecordPage, { attachTo: document.body })
    await vi.waitFor(() => expect(wrapper.find('input').exists()).toBe(true))

    expect(wrapper.text()).toContain(en['common.delete'])

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === en['common.delete'])
    await deleteButton?.trigger('click')
    await vi.waitFor(() => expect(document.body.textContent).toContain(en['list.deleteTranslationOnly'].replace('{locale}', 'EN')))

    expect(document.body.textContent).not.toContain(en['list.deleteAllLocales'].replace('{locales}', 'EN, DE'))
    wrapper.unmount()
  })
})

describe('the record page publish gate', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schemaState.collection = { ...schemaState.collection, capabilities: widgetsCapabilities(false), workflow: undefined }
  })

  it('hides publish on an existing record without the update capability', async () => {
    schemaState.collection = {
      ...schemaState.collection,
      workflow: { field: 'status', live: 'published', draft: 'draft' },
      capabilities: { readAny: { method: 'GET', path: '/admin/widgets/:id' } },
    }
    unregisterAll.push(registerEndpoint('/api/admin/widgets/w1', { method: 'GET', handler: () => baseRecord() }))

    const wrapper = await mountSuspended(RecordPage)
    await vi.waitFor(() => expect(wrapper.find('input').exists()).toBe(true))

    expect(wrapper.text()).not.toContain(en['common.publish'])
    wrapper.unmount()
  })

  it('offers publish on an existing record with the update capability', async () => {
    schemaState.collection = {
      ...schemaState.collection,
      workflow: { field: 'status', live: 'published', draft: 'draft' },
      capabilities: widgetsCapabilities(false),
    }
    unregisterAll.push(registerEndpoint('/api/admin/widgets/w1', { method: 'GET', handler: () => baseRecord() }))

    const wrapper = await mountSuspended(RecordPage)
    await vi.waitFor(() => expect(wrapper.find('input').exists()).toBe(true))

    expect(wrapper.text()).toContain(en['common.publish'])
    wrapper.unmount()
  })
})
