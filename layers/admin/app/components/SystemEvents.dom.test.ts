import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import type { DeadEvent, EventsQueueStatus } from '#kestrel-admin/types/api'
import SystemEvents from './SystemEvents.vue'

const status: EventsQueueStatus = {
  pending: 1,
  running: 0,
  dead: 1,
  done24h: 4,
  oldestPendingAt: Date.UTC(2026, 8, 19, 9, 0, 0),
  worker: { running: true, lastTickAt: Date.UTC(2026, 8, 19, 10, 0, 0) },
}

const dead: DeadEvent[] = [
  { id: 'evt-1', name: 'user.deleted', pipeline: 'anonymizeAuditUser', attempts: 5, error: 'boom', createdAt: 0, availableAt: 0 },
]

describe('SystemEvents', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
  })

  it('names the pipeline each dead-letter row belongs to', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/events/status', { method: 'GET', handler: () => status }))
    unregisterAll.push(registerEndpoint('/api/admin/events/dead', { method: 'GET', handler: () => ({ items: dead }) }))

    const wrapper = await mountSuspended(SystemEvents)

    const row = wrapper.get('tbody tr')
    expect(row.text()).toContain('user.deleted')
    expect(row.text()).toContain('anonymizeAuditUser')
    wrapper.unmount()
  })
})
