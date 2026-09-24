import { computed } from 'vue'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventDeliveryStatus, EventsQueueStatus } from '#kestrel-admin/types/api'
import SystemPage from './system.vue'

const { schemaState } = vi.hoisted(() => ({ schemaState: { features: [] as string[] } }))

mockNuxtImport('useAuth', () => () => ({
  isAdmin: computed(() => true),
  can: () => true,
  ensureSession: () => Promise.resolve(true),
}))

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => ({ locales: { all: ['en'], primary: 'en', prefixPrimary: false }, collections: [], features: schemaState.features })),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

describe('the system page Events tab', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schemaState.features = []
  })

  it('mounts the inline events view for an admin without the eventsQueue feature', async () => {
    const status: EventDeliveryStatus = { dead: 0, scope: 'process', since: Date.now(), lastDeadAt: null }
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => status }))

    const wrapper = await mountSuspended(SystemPage, { route: { path: '/admin/system', query: { tab: 'events' } } })
    expect(wrapper.find('.events-inline').exists()).toBe(true)
    expect(wrapper.find('.events').exists()).toBe(false)
    wrapper.unmount()
  })

  it('mounts the queue events view for an admin with the eventsQueue feature', async () => {
    schemaState.features = ['eventsQueue']
    const queueStatus: EventsQueueStatus = { pending: 0, running: 0, dead: 0, done24h: 0, oldestPendingAt: null, worker: { running: true, lastTickAt: null } }
    unregisterAll.push(registerEndpoint('/api/admin/events/status', { method: 'GET', handler: () => queueStatus }))
    unregisterAll.push(registerEndpoint('/api/admin/events/dead', { method: 'GET', handler: () => ({ items: [] }) }))

    const wrapper = await mountSuspended(SystemPage, { route: { path: '/admin/system', query: { tab: 'events' } } })
    expect(wrapper.find('.events').exists()).toBe(true)
    expect(wrapper.find('.events-inline').exists()).toBe(false)
    wrapper.unmount()
  })
})
