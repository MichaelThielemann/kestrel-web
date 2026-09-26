import { computed, reactive } from 'vue'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readBody } from 'h3'
import { boundaryCast } from '#kestrel/cast'
import type { AdminSchema, Document } from '#kestrel-admin/types/api'
import type { SerializedField } from '#kestrel-admin/types/kestrel'
import { en } from '#kestrel-admin/i18n/en'
import { useToast } from '#kestrel-admin/composables/useToast'
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
      routed: false,
      published: false,
      hasSlug: false,
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

describe('delivery derivation from the schema, not the slug field', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schemaState.collection = { ...schemaState.collection, hasSlug: false, published: false, capabilities: widgetsCapabilities(false), workflow: undefined }
  })

  function saveWithFailedDelivery(publishStatusRequested: { count: number }) {
    unregisterAll.push(registerEndpoint('/api/admin/widgets/w1', { method: 'GET', handler: () => baseRecord() }))
    unregisterAll.push(registerEndpoint('/api/widgets/w1', {
      method: 'PATCH',
      handler: async (event) => {
        const body = boundaryCast<Record<string, unknown>>(await readBody(event), 'json')
        return {
          ...baseRecord(),
          ...body,
          _events: { status: 'error', pipelines: [{ event: 'page.updated', pipeline: 'publishPage', status: 'error', attempts: 1, dead: false, error: 'boom' }] },
        }
      },
    }))
    unregisterAll.push(registerEndpoint('/api/admin/publish-status/widgets/w1', {
      method: 'GET',
      handler: () => { publishStatusRequested.count += 1; return [] },
    }))
  }

  function newToastsSince(toast: ReturnType<typeof useToast>, idsBefore: ReadonlySet<number>) {
    return toast.items.filter((item) => !idsBefore.has(item.id))
  }

  it('loads no publish status and shows no delivery toast for a collection with a slug but no delivery pipelines', async () => {
    schemaState.collection = { ...schemaState.collection, hasSlug: true, published: false, capabilities: widgetsCapabilities(false) }
    const publishStatusRequested = { count: 0 }
    saveWithFailedDelivery(publishStatusRequested)
    const toast = useToast()
    const idsBefore = new Set(toast.items.map((item) => item.id))

    const wrapper = await mountSuspended(RecordPage, { attachTo: document.body })
    await vi.waitFor(() => expect(wrapper.find('input').exists()).toBe(true))

    await wrapper.get('input').setValue('Renamed widget')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(newToastsSince(toast, idsBefore).length).toBeGreaterThan(0))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(publishStatusRequested.count).toBe(0)
    expect(document.body.querySelector('.editor-status-live')).toBeNull()
    expect(newToastsSince(toast, idsBefore).some((item) => item.type === 'error')).toBe(false)
    wrapper.unmount()
  })

  it('loads the publish status and shows the delivery toast for a collection whose publish-status pipeline is wired', async () => {
    schemaState.collection = {
      ...schemaState.collection,
      hasSlug: true,
      published: true,
      capabilities: { ...widgetsCapabilities(false), publishStatus: { method: 'GET', path: '/admin/publish-status/widgets/:id' } },
    }
    const publishStatusRequested = { count: 0 }
    saveWithFailedDelivery(publishStatusRequested)
    const toast = useToast()
    const idsBefore = new Set(toast.items.map((item) => item.id))

    const wrapper = await mountSuspended(RecordPage, { attachTo: document.body })
    await vi.waitFor(() => expect(wrapper.find('input').exists()).toBe(true))

    await wrapper.get('input').setValue('Renamed widget')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(newToastsSince(toast, idsBefore).some((item) => item.type === 'error')).toBe(true))

    expect(publishStatusRequested.count).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('still shows the delivery toast for a published collection when the caller lacks the publish-status capability', async () => {
    schemaState.collection = {
      ...schemaState.collection,
      hasSlug: true,
      published: true,
      capabilities: widgetsCapabilities(false),
    }
    const publishStatusRequested = { count: 0 }
    saveWithFailedDelivery(publishStatusRequested)
    const toast = useToast()
    const idsBefore = new Set(toast.items.map((item) => item.id))

    const wrapper = await mountSuspended(RecordPage, { attachTo: document.body })
    await vi.waitFor(() => expect(wrapper.find('input').exists()).toBe(true))

    await wrapper.get('input').setValue('Renamed widget')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(newToastsSince(toast, idsBefore).some((item) => item.type === 'error')).toBe(true))

    expect(publishStatusRequested.count).toBe(0)
    wrapper.unmount()
  })
})
