import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import type { AdminSchema, ReplicationStatus } from '#kestrel-admin/types/api'
import { useSchema } from '../composables/useSchema'
import SystemReplication from './SystemReplication.vue'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {
    replicationStatus: { method: 'GET', path: '/admin/replication/status' },
    replicationPoints: { method: 'GET', path: '/admin/replication/points' },
    replicationSnapshot: { method: 'POST', path: '/admin/replication/snapshot' },
    replicationRestore: { method: 'POST', path: '/admin/replication/restore' },
  },
}

const status: ReplicationStatus = {
  generation: '3',
  lineage: 1,
  shippedFrames: 42,
  lastSyncAt: Date.UTC(2026, 8, 19, 9, 0, 0),
  lastSnapshotAt: Date.UTC(2026, 8, 19, 8, 0, 0),
  lastCheckpointAt: Date.UTC(2026, 8, 19, 9, 30, 0),
  walBytes: 1024,
  pendingRestore: null,
}

describe('SystemReplication', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  it('lists the restore points when the caller has replicationPoints', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/admin/replication/status', { method: 'GET', handler: () => status }))
    unregisterAll.push(registerEndpoint('/api/admin/replication/points', {
      method: 'GET',
      handler: () => [{ kind: 'snapshot', key: 's1', generation: 3, at: Date.now() }],
    }))
    await useSchema().load()

    const wrapper = await mountSuspended(SystemReplication)

    expect(wrapper.find('.u-scroll').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the status stats without an error when the caller lacks replicationPoints', async () => {
    const splitSchema: AdminSchema = { ...schema, capabilities: { replicationStatus: { method: 'GET', path: '/admin/replication/status' } } }
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => splitSchema }))
    unregisterAll.push(registerEndpoint('/api/admin/replication/status', { method: 'GET', handler: () => status }))
    await useSchema().load()

    const wrapper = await mountSuspended(SystemReplication)

    expect(wrapper.find('.ui-alert--error').exists()).toBe(false)
    expect(wrapper.text()).toContain(String(status.generation))
    expect(wrapper.find('.u-scroll').exists()).toBe(false)
    wrapper.unmount()
  })
})
