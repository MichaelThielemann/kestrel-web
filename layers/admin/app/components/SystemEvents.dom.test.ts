import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import type { AdminSchema, DeadEvent, EventsQueueStatus } from '#kestrel-admin/types/api'
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
})
