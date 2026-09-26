import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { useSchema } from '../composables/useSchema'
import SystemPaths from './SystemPaths.vue'

const schema: AdminSchema = {
  locales: { all: ['de'], primary: 'de', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: { rebuildPaths: { method: 'POST', path: '/admin/paths/rebuild' } },
}

describe('SystemPaths', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  it('rebuilds the paths and names the page that kept a doubly claimed address and the one left without', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/admin/paths/rebuild', {
      method: 'POST',
      handler: () => ({ indexed: 12, conflicts: [{ path: '/team', locale: 'de', winner: { type: 'pages', id: 'p1' }, losers: [{ type: 'pages', id: 'p7' }], reason: 'taken' }] }),
    }))
    await useSchema().load()

    const wrapper = await mountSuspended(SystemPaths)
    await wrapper.get('.paths__head button').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('tbody tr').exists()).toBe(true))

    expect(wrapper.get('.paths__report p').text()).toBe('12 paths computed.')
    const cells = wrapper.findAll('tbody td').map((cell) => cell.text())
    expect(cells).toEqual(['/team DE', 'claimed twice', 'pages/p1', 'pages/p7'])
    expect(wrapper.get('tbody a').attributes('href')).toBe('/admin/pages/p1')
    wrapper.unmount()
  })
})
