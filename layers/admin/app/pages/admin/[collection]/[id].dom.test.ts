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
  schema: computed<AdminSchema>(() => ({ locales: { all: ['en'], primary: 'en', prefixPrimary: false }, collections: [schemaState.collection], features: [], capabilities: {} })),
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
    schemaState.collection = { ...schemaState.collection, capabilities: widgetsCapabilities(false) }
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
})
