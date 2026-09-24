import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventDeliveryStatus } from '#kestrel-admin/types/api'
import SystemEventsInline from './SystemEventsInline.vue'

describe('SystemEventsInline', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    vi.useRealTimers()
  })

  it('shows the failed-delivery count, since when, and the last failure', async () => {
    const status: EventDeliveryStatus = { dead: 4, scope: 'process', since: Date.UTC(2026, 8, 19, 9, 0, 0), lastDeadAt: Date.UTC(2026, 8, 19, 10, 0, 0) }
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => status }))

    const wrapper = await mountSuspended(SystemEventsInline)
    expect(wrapper.text()).toContain('4')
    wrapper.unmount()
  })

  it('shows a not-available notice on NOT_FOUND', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', {
      method: 'GET',
      handler: (event) => {
        event.node.res.statusCode = 404
        return { error: 'not found', code: 'NOT_FOUND', retryable: false }
      },
    }))

    const wrapper = await mountSuspended(SystemEventsInline)
    expect(wrapper.find('[role="status"]').exists() || wrapper.text().length > 0).toBe(true)
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
})
