import { defineComponent, h } from 'vue'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { installAdminClient } from './admin-client'
import { useAdminApi } from '../composables/useAdminApi'
import { useSchema } from '../composables/useSchema'

const { navigateCalls } = vi.hoisted(() => ({ navigateCalls: [] as string[] }))

mockNuxtImport('navigateTo', () => (to: unknown) => {
  navigateCalls.push(typeof to === 'string' ? to : JSON.stringify(to))
  return Promise.resolve()
})

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {},
}

async function mountProbe() {
  let call: ((route: { method: 'GET'; path: string }) => Promise<unknown>) | undefined
  const Probe = defineComponent({
    setup() {
      installAdminClient()
      const api = useAdminApi()
      call = (route) => api(route)
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Probe, { route: { path: '/admin/pages' } })
  navigateCalls.length = 0
  if (!call) throw new Error('expected the probe to expose a call function')
  return { wrapper, call }
}

describe('every admin request goes through the intercepted client, regardless of plugin order', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    navigateCalls.length = 0
    useSchema().clear()
  })

  it('refetches the schema on a 403 and redirects to login on a 401', async () => {
    let schemaRequests = 0
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => { schemaRequests++; return schema } }))
    unregisterAll.push(registerEndpoint('/api/probe-403', {
      method: 'GET',
      handler: (event) => { event.node.res.statusCode = 403; return { error: 'forbidden', code: 'FORBIDDEN', retryable: false } },
    }))
    unregisterAll.push(registerEndpoint('/api/probe-401', {
      method: 'GET',
      handler: (event) => { event.node.res.statusCode = 401; return { error: 'not authenticated', code: 'UNAUTHENTICATED', retryable: false } },
    }))

    const { wrapper, call } = await mountProbe()

    await expect(call({ method: 'GET', path: '/probe-403' })).rejects.toThrow()
    await vi.waitFor(() => expect(schemaRequests).toBe(1))
    expect(navigateCalls).toEqual([])

    await expect(call({ method: 'GET', path: '/probe-401' })).rejects.toThrow()
    await vi.waitFor(() => expect(navigateCalls.length).toBe(1))
    expect(navigateCalls[0]).toContain('/admin/login')

    wrapper.unmount()
  })
})
