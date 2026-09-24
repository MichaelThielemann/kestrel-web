import { computed, nextTick, reactive } from 'vue'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminSchema, EventDeliveryStatus, EventsQueueStatus } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import SystemPage from './system.vue'

const { rawSchemaState } = vi.hoisted(() => {
  const capabilities: AdminSchema['capabilities'] = { eventsDeliveryStatus: { method: 'GET', path: '/admin/events/delivery' } }
  return { rawSchemaState: { capabilities } }
})
const schemaState = reactive(rawSchemaState)

mockNuxtImport('useSchema', () => () => ({
  schema: computed<AdminSchema>(() => ({ locales: { all: ['en'], primary: 'en', prefixPrimary: false }, collections: [], features: [], capabilities: schemaState.capabilities })),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

describe('the system page Events tab', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schemaState.capabilities = { eventsDeliveryStatus: { method: 'GET', path: '/admin/events/delivery' } }
  })

  it('mounts the inline events view when the schema offers no queue capability', async () => {
    const status: EventDeliveryStatus = { dead: 0, scope: 'process', since: Date.now(), lastDeadAt: null }
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => status }))

    const wrapper = await mountSuspended(SystemPage, { route: { path: '/admin/system', query: { tab: 'events' } } })
    expect(wrapper.find('.events-inline').exists()).toBe(true)
    expect(wrapper.find('.events').exists()).toBe(false)
    wrapper.unmount()
  })

  it('mounts the queue events view when the schema offers eventsQueueStatus', async () => {
    schemaState.capabilities = {
      eventsDeliveryStatus: { method: 'GET', path: '/admin/events/delivery' },
      eventsQueueStatus: { method: 'GET', path: '/admin/events/status' },
      eventsDead: { method: 'GET', path: '/admin/events/dead' },
    }
    const queueStatus: EventsQueueStatus = { pending: 0, running: 0, dead: 0, done24h: 0, oldestPendingAt: null, worker: { running: true, lastTickAt: null } }
    unregisterAll.push(registerEndpoint('/api/admin/events/status', { method: 'GET', handler: () => queueStatus }))
    unregisterAll.push(registerEndpoint('/api/admin/events/dead', { method: 'GET', handler: () => ({ items: [] }) }))

    const wrapper = await mountSuspended(SystemPage, { route: { path: '/admin/system', query: { tab: 'events' } } })
    expect(wrapper.find('.events').exists()).toBe(true)
    expect(wrapper.find('.events-inline').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('the system page tabs after a capability is lost', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schemaState.capabilities = { eventsDeliveryStatus: { method: 'GET', path: '/admin/events/delivery' } }
  })

  it('moves focus to the page heading when the active tab disappears from under it', async () => {
    schemaState.capabilities = {
      eventsDeliveryStatus: { method: 'GET', path: '/admin/events/delivery' },
      listUsers: { method: 'GET', path: '/users' },
    }
    unregisterAll.push(registerEndpoint('/api/users', { method: 'GET', handler: () => [] }))
    const status: EventDeliveryStatus = { dead: 0, scope: 'process', since: Date.now(), lastDeadAt: null }
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => status }))

    const wrapper = await mountSuspended(SystemPage, { attachTo: document.body, route: { path: '/admin/system', query: { tab: 'users' } } })
    expect(wrapper.find('#system-panel-users').exists()).toBe(true)

    schemaState.capabilities = { eventsDeliveryStatus: { method: 'GET', path: '/admin/events/delivery' } }
    await nextTick()
    await nextTick()

    expect(wrapper.find('#system-panel-users').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.system__title').element)
    wrapper.unmount()
  })

  it('leaves focus alone when the caller switches tabs themselves', async () => {
    schemaState.capabilities = {
      eventsDeliveryStatus: { method: 'GET', path: '/admin/events/delivery' },
      listUsers: { method: 'GET', path: '/users' },
    }
    unregisterAll.push(registerEndpoint('/api/users', { method: 'GET', handler: () => [] }))
    const status: EventDeliveryStatus = { dead: 0, scope: 'process', since: Date.now(), lastDeadAt: null }
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => status }))

    const wrapper = await mountSuspended(SystemPage, { attachTo: document.body, route: { path: '/admin/system', query: { tab: 'users' } } })
    await wrapper.get('#system-tab-events').trigger('click')
    await nextTick()
    await nextTick()

    expect(document.activeElement).not.toBe(wrapper.get('.system__title').element)
    wrapper.unmount()
  })
})

describe('a direct visit to /admin/system with no visible tab', () => {
  afterEach(() => {
    schemaState.capabilities = { eventsDeliveryStatus: { method: 'GET', path: '/admin/events/delivery' } }
  })

  it('shows the same capability-unavailable text other gated pages use, not an empty-tabs message', async () => {
    schemaState.capabilities = {}

    const wrapper = await mountSuspended(SystemPage, { route: { path: '/admin/system', query: {} } })
    expect(wrapper.find('.system__tabs').exists()).toBe(false)
    expect(wrapper.get('.system__missing').text()).toBe(en['capability.unavailable'])
    wrapper.unmount()
  })
})
