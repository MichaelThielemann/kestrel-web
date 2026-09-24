import { computed, nextTick } from 'vue'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventDeliveryStatus } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import SystemEventsInline from './SystemEventsInline.vue'

const { authState, schemaState } = vi.hoisted(() => ({
  authState: { canInsightsRead: true },
  schemaState: { features: ['insights'] as string[] },
}))

mockNuxtImport('useAuth', () => () => ({
  can: (permission: string) => (permission === 'insights.read' ? authState.canInsightsRead : true),
}))

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => ({ locales: { all: ['en'], primary: 'en', prefixPrimary: false }, collections: [], features: schemaState.features })),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

describe('SystemEventsInline', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    vi.useRealTimers()
    authState.canInsightsRead = true
    schemaState.features = ['insights']
  })

  it('shows the failed-delivery count, since when, and the last failure, each paired with its label', async () => {
    const since = Date.UTC(2026, 8, 19, 9, 0, 0)
    const lastDeadAt = Date.UTC(2026, 8, 19, 10, 0, 0)
    const status: EventDeliveryStatus = { dead: 4, scope: 'process', since, lastDeadAt }
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => status }))

    const wrapper = await mountSuspended(SystemEventsInline)
    const dl = wrapper.get('.events-inline__facts')
    const dts = dl.findAll('dt').map((dt) => dt.text())
    const dds = dl.findAll('dd').map((dd) => dd.text())
    expect(dts).toEqual([en['events.failedInline'], en['events.since'], en['events.lastFailure']])
    expect(dds[0]).toBe('4')
    expect(dds[1]?.length).toBeGreaterThan(0)
    expect(dds[2]?.length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('links to Insights -> Live when the viewer can read insights', async () => {
    const status: EventDeliveryStatus = { dead: 0, scope: 'process', since: Date.now(), lastDeadAt: null }
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => status }))

    const wrapper = await mountSuspended(SystemEventsInline)
    const link = wrapper.find('a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/admin/insights?tab=live')
    expect(link.text()).toBe(en['events.seeInsights'])
    wrapper.unmount()
  })

  it('names the same text without a link when the viewer cannot read insights', async () => {
    schemaState.features = []
    const status: EventDeliveryStatus = { dead: 0, scope: 'process', since: Date.now(), lastDeadAt: null }
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => status }))

    const wrapper = await mountSuspended(SystemEventsInline)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.get('.events-inline__hint').text()).toBe(en['events.seeInsights'])
    wrapper.unmount()
  })

  it('shows the not-available text on NOT_FOUND, not a generic error', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', {
      method: 'GET',
      handler: (event) => {
        event.node.res.statusCode = 404
        return { error: 'not found', code: 'NOT_FOUND', retryable: false }
      },
    }))

    const wrapper = await mountSuspended(SystemEventsInline)
    expect(wrapper.text()).toContain(en['events.deliveryNotAvailable'])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('clears its poll interval on unmount', async () => {
    vi.useFakeTimers()
    const status: EventDeliveryStatus = { dead: 0, scope: 'process', since: Date.now(), lastDeadAt: null }
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => status }))

    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const wrapper = await mountSuspended(SystemEventsInline)
    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('keeps the same error region across polls instead of removing and re-adding it while the failure persists', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setInterval', 'clearInterval'] })
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', {
      method: 'GET',
      handler: (event) => {
        event.node.res.statusCode = 500
        return { error: 'boom', code: 'INTERNAL', retryable: false }
      },
    }))

    const wrapper = await mountSuspended(SystemEventsInline)
    const firstAlert = wrapper.get('[role="alert"]').element
    await vi.advanceTimersByTimeAsync(5000)
    await nextTick()
    const secondAlert = wrapper.get('[role="alert"]').element
    expect(secondAlert).toBe(firstAlert)
    wrapper.unmount()
  })
})
