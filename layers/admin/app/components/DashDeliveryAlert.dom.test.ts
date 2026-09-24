import { computed } from 'vue'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import type { AdminSchema, EventDeliveryStatus } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import DashDeliveryAlert from './DashDeliveryAlert.vue'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: { eventsDeliveryStatus: { method: 'GET', path: '/admin/events/delivery' } },
}

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

describe('DashDeliveryAlert', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
  })

  it('renders nothing when there is no failed delivery', async () => {
    const status: EventDeliveryStatus = { dead: 0, scope: 'store', since: null, lastDeadAt: null }
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => status }))

    const wrapper = await mountSuspended(DashDeliveryAlert)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.find('p').exists()).toBe(false)
    wrapper.unmount()
  })

  it('links to the events tab and names the dead-letter count for the queue scope', async () => {
    const status: EventDeliveryStatus = { dead: 3, scope: 'store', since: null, lastDeadAt: Date.now() }
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => status }))

    const wrapper = await mountSuspended(DashDeliveryAlert)
    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('/admin/system?tab=events')
    expect(link.text()).toBe(en['events.dashDead'].replace('{n}', '3'))
    expect(link.text()).not.toContain('this process')
    wrapper.unmount()
  })

  it('names the process scope for a failed inline delivery', async () => {
    const status: EventDeliveryStatus = { dead: 2, scope: 'process', since: Date.now(), lastDeadAt: Date.now() }
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => status }))

    const wrapper = await mountSuspended(DashDeliveryAlert)
    expect(wrapper.get('a').text()).toBe(en['events.dashFailedInline'].replace('{n}', '2'))
    wrapper.unmount()
  })

  it('renders nothing when a consumer excluded the pipeline', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', {
      method: 'GET',
      handler: (event) => {
        event.node.res.statusCode = 404
        return { error: 'not found', code: 'NOT_FOUND', retryable: false }
      },
    }))

    const wrapper = await mountSuspended(DashDeliveryAlert)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.find('p').exists()).toBe(false)
    wrapper.unmount()
  })

  it('reports any other load error as an alert', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', {
      method: 'GET',
      handler: (event) => {
        event.node.res.statusCode = 500
        return { error: 'boom', code: 'INTERNAL', retryable: false }
      },
    }))

    const wrapper = await mountSuspended(DashDeliveryAlert)
    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('boom')
    wrapper.unmount()
  })
})
