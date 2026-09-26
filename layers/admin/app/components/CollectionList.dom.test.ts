import { computed } from 'vue'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import type { AdminSchema, ListPage } from '#kestrel-admin/types/api'
import type { SerializedCollection, SerializedField } from '#kestrel-admin/types/kestrel'
import { en } from '#kestrel-admin/i18n/en'
import CollectionList from './CollectionList.vue'

const titleField: SerializedField = { type: 'text', required: true, unique: false, localized: false, label: 'Title' }

const widgetsCollection: SerializedCollection = {
  name: 'widgets',
  mode: 'multi',
  translatable: false,
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
}

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [{
    ...widgetsCollection,
    capabilities: { listAll: { method: 'GET', path: '/admin/widgets' }, update: { method: 'PATCH', path: '/widgets/:id' } },
  }],
  features: [],
  capabilities: {},
}

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

describe('CollectionList bulk bar', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
  })

  it('offers no bulk delete without the delete capability', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/widgets', {
      method: 'GET',
      handler: (): ListPage<unknown> => ({ items: [{ id: 'w1', title: 'One', updatedAt: 0 }], total: 1 }),
    }))

    const wrapper = await mountSuspended(CollectionList, { props: { schema: widgetsCollection } })

    await wrapper.get('thead input[type="checkbox"]').setValue(true)

    const toolbar = wrapper.get('[role="toolbar"]')
    expect(toolbar.text()).not.toContain(en['list.bulkDelete'])

    wrapper.unmount()
  })

  describe('bulk publish gate', () => {
    const workflowCollection: SerializedCollection = { ...widgetsCollection, workflow: { field: 'status', live: 'published', draft: 'draft' } }

    afterEach(() => {
      schema.collections[0]!.capabilities = { listAll: { method: 'GET', path: '/admin/widgets' }, update: { method: 'PATCH', path: '/widgets/:id' } }
    })

    it('offers no bulk publish without the update capability', async () => {
      schema.collections[0]!.capabilities = { listAll: { method: 'GET', path: '/admin/widgets' } }
      unregisterAll.push(registerEndpoint('/api/admin/widgets', {
        method: 'GET',
        handler: (): ListPage<unknown> => ({ items: [{ id: 'w1', title: 'One', updatedAt: 0 }], total: 1 }),
      }))

      const wrapper = await mountSuspended(CollectionList, { props: { schema: workflowCollection } })

      await wrapper.get('thead input[type="checkbox"]').setValue(true)

      const toolbar = wrapper.get('[role="toolbar"]')
      expect(toolbar.text()).not.toContain(en['list.bulkPublish'])
      expect(toolbar.text()).not.toContain(en['list.bulkUnpublish'])

      wrapper.unmount()
    })

    it('offers bulk publish with the update capability', async () => {
      unregisterAll.push(registerEndpoint('/api/admin/widgets', {
        method: 'GET',
        handler: (): ListPage<unknown> => ({ items: [{ id: 'w1', title: 'One', updatedAt: 0 }], total: 1 }),
      }))

      const wrapper = await mountSuspended(CollectionList, { props: { schema: workflowCollection } })

      await wrapper.get('thead input[type="checkbox"]').setValue(true)

      const toolbar = wrapper.get('[role="toolbar"]')
      expect(toolbar.text()).toContain(en['list.bulkPublish'])
      expect(toolbar.text()).toContain(en['list.bulkUnpublish'])

      wrapper.unmount()
    })
  })
})
