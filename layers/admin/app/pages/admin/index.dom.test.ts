import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AdminSchema, ListPage } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import { useSchema } from '../../composables/useSchema'
import DashboardPage from './index.vue'

const pagesCollection: AdminSchema['collections'][number] = {
  name: 'pages',
  mode: 'multi',
  translatable: true,
  pageLike: true,
  seo: false,
  status: true,
  layoutField: false,
  blocks: { enabled: false },
  editor: 'fields',
  nav: true,
  placement: 'rail',
  fields: {},
  fieldLayout: [],
  workflow: { field: 'status', live: 'published', draft: 'draft' },
  capabilities: {
    listAll: { method: 'GET', path: '/admin/pages' },
    update: { method: 'PATCH', path: '/pages/:id' },
  },
}

const authorSchema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [pagesCollection],
  features: [],
  capabilities: {},
}

describe('admin dashboard for a role without users.manage', () => {
  const unregisterAll: (() => void)[] = []

  beforeEach(async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => authorSchema }))
    unregisterAll.push(registerEndpoint('/api/admin/pages', { method: 'GET', handler: (): ListPage<unknown> => ({ items: [], total: 3 }) }))
    await useSchema().load()
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  it('hides the users card and keeps the pages card, listed and counted', async () => {
    const wrapper = await mountSuspended(DashboardPage)

    expect(wrapper.text()).not.toContain(en['users.title'])
    expect(wrapper.text()).toContain('pages')
    wrapper.unmount()
  })

  it('never renders the delivery alert without the eventsDeliveryStatus capability', async () => {
    const wrapper = await mountSuspended(DashboardPage)

    expect(wrapper.find('.dash__alert').exists()).toBe(false)
    wrapper.unmount()
  })
})
