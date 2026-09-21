import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReplicationPoint, ReplicationStatus } from '#kestrel-admin/types/api'
import SystemReplication from './SystemReplication.vue'

const points: ReplicationPoint[] = []

describe('SystemReplication', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
  })

  it('shows an em dash for walBytes instead of "0 B" when the backend does not report it', async () => {
    const status: ReplicationStatus = { generation: '1', lastSyncAt: null, lastSnapshotAt: null, lastCheckpointAt: null, pendingRestore: null }
    unregisterAll.push(registerEndpoint('/api/admin/replication/status', { method: 'GET', handler: () => status }))
    unregisterAll.push(registerEndpoint('/api/admin/replication/points', { method: 'GET', handler: () => points }))

    const wrapper = await mountSuspended(SystemReplication)

    expect(wrapper.text()).not.toContain('0 B')
    const walStat = wrapper.findAll('.replication__stat').find((stat) => stat.text().includes('—'))
    expect(walStat).toBeTruthy()

    wrapper.unmount()
  })
})
