import { computed } from 'vue'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import type { AdminSchema, StaleStatus } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import DashDeliveryStaleAlert from './DashDeliveryStaleAlert.vue'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: { pagesStaleStatus: { method: 'GET', path: '/admin/publish-status/pages' } },
}

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

function staleStatus(over: Partial<StaleStatus> = {}): StaleStatus {
  return { stale: 0, failed: 0, rendering: 0, unknown: 0, oldestStaleAt: null, abandoned: 0, ...over }
}

describe('DashDeliveryStaleAlert', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
  })

  it('renders nothing while no re-render failed, however many wait', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/publish-status/pages', { method: 'GET', handler: () => staleStatus({ stale: 40, unknown: 3 }) }))

    const wrapper = await mountSuspended(DashDeliveryStaleAlert)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.find('p').exists()).toBe(false)
    wrapper.unmount()
  })

  it('links to System › Static delivery and names the failed re-renders, with an icon', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/publish-status/pages', { method: 'GET', handler: () => staleStatus({ failed: 3 }) }))

    const wrapper = await mountSuspended(DashDeliveryStaleAlert)
    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('/admin/system?tab=delivery')
    expect(link.text()).toBe(en['dash.deliveryStaleFailed'].replace('{n}', '3'))
    expect(link.find('svg').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders nothing when a consumer excluded the pipeline', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/publish-status/pages', {
      method: 'GET',
      handler: (event) => {
        event.node.res.statusCode = 404
        return { error: 'not found', code: 'NOT_FOUND', retryable: false }
      },
    }))

    const wrapper = await mountSuspended(DashDeliveryStaleAlert)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.find('p').exists()).toBe(false)
    wrapper.unmount()
  })

  it('reports any other load error as an alert', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/publish-status/pages', {
      method: 'GET',
      handler: (event) => {
        event.node.res.statusCode = 500
        return { error: 'boom', code: 'INTERNAL', retryable: false }
      },
    }))

    const wrapper = await mountSuspended(DashDeliveryStaleAlert)
    expect(wrapper.get('[role="alert"]').text()).toContain('boom')
    wrapper.unmount()
  })
})
