import { flushPromises } from '@vue/test-utils'
import { clearNuxtState } from '#app'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '../i18n/en'
import type { AdminSchema, DeadEvent, EventsQueueStatus } from '#kestrel-admin/types/api'
import { useDeadLetterCount } from '../composables/useDeadLetterCount'
import { useSchema } from '../composables/useSchema'
import SystemEvents from './SystemEvents.vue'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {
    eventsQueueStatus: { method: 'GET', path: '/admin/events/status' },
    eventsDead: { method: 'GET', path: '/admin/events/dead' },
    eventsRetryDead: { method: 'POST', path: '/admin/events/retry' },
    eventsRetryOne: { method: 'POST', path: '/admin/events/dead/:id/retry' },
  },
}

const status: EventsQueueStatus = {
  pending: 1,
  running: 0,
  dead: 1,
  done24h: 4,
  oldestPendingAt: Date.UTC(2026, 8, 19, 9, 0, 0),
  worker: { running: true, lastTickAt: Date.UTC(2026, 8, 19, 10, 0, 0) },
}

const dead: DeadEvent[] = [
  { id: 'evt-1', name: 'user.deleted', pipeline: 'anonymizeAuditUser', runId: 'run-1', attempts: 5, error: 'boom', createdAt: 0, availableAt: 0 },
]

describe('SystemEvents', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
    clearNuxtState('kestrel-admin-dead-letter-count')
  })

  it('names the pipeline and the run each dead-letter row belongs to', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/admin/events/status', { method: 'GET', handler: () => status }))
    unregisterAll.push(registerEndpoint('/api/admin/events/dead', { method: 'GET', handler: () => ({ items: dead }) }))
    await useSchema().load()

    const wrapper = await mountSuspended(SystemEvents)

    const row = wrapper.get('tbody tr')
    expect(row.text()).toContain('user.deleted')
    expect(row.text()).toContain('anonymizeAuditUser')
    expect(row.text()).toContain('run-1')
    wrapper.unmount()
  })

  it('shows the queue status without an error when the caller lacks eventsDead', async () => {
    const splitSchema: AdminSchema = { ...schema, capabilities: { eventsQueueStatus: { method: 'GET', path: '/admin/events/status' } } }
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => splitSchema }))
    unregisterAll.push(registerEndpoint('/api/admin/events/status', { method: 'GET', handler: () => status }))
    await useSchema().load()

    const wrapper = await mountSuspended(SystemEvents)

    expect(wrapper.find('.ui-alert--error').exists()).toBe(false)
    expect(wrapper.text()).toContain(String(status.pending))
    expect(wrapper.find('.u-scroll').exists()).toBe(false)
    wrapper.unmount()
  })

  it('lowers the rail count right after retrying every dead event, without waiting for the next poll', async () => {
    const queue = { dead: 2 }
    const withDelivery: AdminSchema = { ...schema, capabilities: { ...schema.capabilities, eventsDeliveryStatus: { method: 'GET', path: '/admin/events/delivery' } } }
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => withDelivery }))
    unregisterAll.push(registerEndpoint('/api/admin/events/status', { method: 'GET', handler: () => ({ ...status, dead: queue.dead }) }))
    unregisterAll.push(registerEndpoint('/api/admin/events/dead', { method: 'GET', handler: () => ({ items: queue.dead > 0 ? dead : [] }) }))
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => ({ dead: queue.dead, scope: 'store', since: null, lastDeadAt: null }) }))
    unregisterAll.push(registerEndpoint('/api/admin/events/retry', { method: 'POST', handler: () => { queue.dead = 0; return { retried: 2 } } }))
    await useSchema().load()
    const rail = useDeadLetterCount({ poll: false })
    await rail.refresh()
    expect(rail.count.value).toBe(2)

    const wrapper = await mountSuspended(SystemEvents, { attachTo: document.body })
    const retryAll = wrapper.findAll('button').find((button) => button.text() === en['events.retryAll'])
    await retryAll?.trigger('click')
    const confirm = await vi.waitFor(() => {
      const button = [...document.querySelectorAll('.ui-dialog__content button')].find((candidate) => candidate.textContent?.trim() === en['events.retryAll'])
      if (!(button instanceof HTMLButtonElement)) throw new Error('the confirmation button is not open yet')
      return button
    })
    confirm.click()
    await vi.waitFor(() => expect(rail.count.value).toBe(0))
    await flushPromises()
    wrapper.unmount()
  })
})
