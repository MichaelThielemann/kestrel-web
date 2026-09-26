import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminSchema, AutoRedirect } from '#kestrel-admin/types/api'
import { useSchema } from '../composables/useSchema'
import RedirectsAuto from './RedirectsAuto.vue'

const schema: AdminSchema = {
  locales: { all: ['de', 'en'], primary: 'de', prefixPrimary: false },
  collections: [],
  features: ['redirects'],
  capabilities: {
    listAutoRedirects: { method: 'GET', path: '/admin/redirects/auto' },
    removeAutoRedirect: { method: 'DELETE', path: '/admin/redirects/auto/*path' },
  },
}

const moved: AutoRedirect = { from: '/ueber-uns/team', to: '/team', type: 'pages', docId: 'p2', locale: 'de', seq: 4 }

describe('RedirectsAuto', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  it('lists each moved page\'s old address with its current one', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/admin/redirects/auto', { method: 'GET', handler: () => [moved] }))
    await useSchema().load()

    const wrapper = await mountSuspended(RedirectsAuto)
    await vi.waitFor(() => expect(wrapper.findAll('tbody td').length).toBeGreaterThan(0))

    const cells = wrapper.findAll('tbody td').map((cell) => cell.text())
    expect(cells.slice(0, 2)).toEqual(['/ueber-uns/team', '/team'])
    expect(wrapper.get('tbody button').attributes('aria-label')).toBe('Remove the redirect from /ueber-uns/team')
    wrapper.unmount()
  })

  it('removes a redirect by its old address and reloads the list', async () => {
    let listed: AutoRedirect[] = [moved]
    const removed: string[] = []
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/admin/redirects/auto', { method: 'GET', handler: () => listed }))
    unregisterAll.push(registerEndpoint('/api/admin/redirects/auto/ueber-uns/team', {
      method: 'DELETE',
      handler: () => {
        removed.push('/ueber-uns/team')
        listed = []
        return {}
      },
    }))
    await useSchema().load()

    const wrapper = await mountSuspended(RedirectsAuto)
    await vi.waitFor(() => expect(wrapper.find('tbody button').exists()).toBe(true))
    await wrapper.get('tbody button').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.redirects-auto__empty').exists()).toBe(true))

    expect(removed).toEqual(['/ueber-uns/team'])
    wrapper.unmount()
  })

  it('renders nothing to list without the capability', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => ({ ...schema, capabilities: {} }) }))
    await useSchema().load()
    const wrapper = await mountSuspended(RedirectsAuto)
    await flushPromises()
    expect(wrapper.find('tbody').exists()).toBe(false)
    wrapper.unmount()
  })
})
