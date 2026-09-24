import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminSchema, MediaRepairPublicReport } from '#kestrel-admin/types/api'
import { useSchema } from '../composables/useSchema'
import SystemDelivery from './SystemDelivery.vue'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {
    publishAll: { method: 'POST', path: '/admin/publish-all/pages' },
    repairPublicMedia: { method: 'POST', path: '/admin/media/repair-public' },
  },
}

describe('SystemDelivery repair action', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
    schema.capabilities = {
      publishAll: { method: 'POST', path: '/admin/publish-all/pages' },
      repairPublicMedia: { method: 'POST', path: '/admin/media/repair-public' },
    }
  })

  it('shows the repair section only when the caller has repairPublicMedia', async () => {
    schema.capabilities = { publishAll: { method: 'POST', path: '/admin/publish-all/pages' } }
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    await useSchema().load()

    const wrapper = await mountSuspended(SystemDelivery)
    expect(wrapper.text()).not.toContain('Repair public media copies')
    wrapper.unmount()
  })

  it('calls repairPublicMedia and reports what it wrote, removed and found missing', async () => {
    const report: MediaRepairPublicReport = { _publicMedia: { written: 2, removed: 1, missing: 0 } }
    const spy = vi.fn().mockResolvedValue(report)
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/admin/media/repair-public', { method: 'POST', handler: spy }))
    await useSchema().load()

    const wrapper = await mountSuspended(SystemDelivery)
    const button = wrapper.findAll('button').find((b) => b.text() === 'Repair public media copies')
    if (!button) throw new Error('expected a repair button')
    await button.trigger('click')
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    wrapper.unmount()
  })
})
