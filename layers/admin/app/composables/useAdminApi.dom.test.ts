import { defineComponent, h, watch } from 'vue'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { useAdminApi } from './useAdminApi'
import { useApi } from './useApi'
import { useAuth } from './useAuth'
import { useSchema } from './useSchema'

const { navigateCalls, callOrder } = vi.hoisted(() => ({ navigateCalls: [] as string[], callOrder: [] as string[] }))

mockNuxtImport('navigateTo', () => async (to: unknown) => {
  await Promise.resolve()
  navigateCalls.push(typeof to === 'string' ? to : JSON.stringify(to))
  callOrder.push('navigate')
})

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {},
}

async function mountProbe() {
  let call: ((route: { method: 'GET'; path: string }) => Promise<unknown>) | undefined
  let plainCall: ((path: string) => Promise<unknown>) | undefined
  const Probe = defineComponent({
    setup() {
      const api = useAdminApi()
      const plain = useApi()
      call = (route) => api(route)
      plainCall = (path) => plain(path)
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Probe, { route: { path: '/admin/pages' } })
  navigateCalls.length = 0
  if (!call || !plainCall) throw new Error('expected the probe to expose call functions')
  return { wrapper, call, plainCall }
}

describe('the admin client is intercepted on its own, with no global patching', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    navigateCalls.length = 0
    callOrder.length = 0
    useSchema().clear()
  })

  it('refetches the schema on a 403 and redirects to login on a 401, with no admin.vue ever mounted', async () => {
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

  it('resets the session only once the redirect navigation has settled, never before', async () => {
    unregisterAll.push(registerEndpoint('/api/login', {
      method: 'POST',
      handler: () => ({ token: 'seeded-token', identity: { id: 'u1', claims: { username: 'ada', roles: ['admin'] } } }),
    }))
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/probe-401', {
      method: 'GET',
      handler: (event) => { event.node.res.statusCode = 401; return { error: 'not authenticated', code: 'UNAUTHENTICATED', retryable: false } },
    }))

    const auth = useAuth()
    await auth.login('ada', 'secret')
    const stopWatch = watch(() => auth.authenticated.value, (value) => { if (!value) callOrder.push('reset') })

    const { wrapper, call } = await mountProbe()

    await expect(call({ method: 'GET', path: '/probe-401' })).rejects.toThrow()
    await vi.waitFor(() => expect(callOrder.length).toBe(2))
    expect(callOrder).toEqual(['navigate', 'reset'])

    stopWatch()
    wrapper.unmount()
  })

  it('never carries the reauth interceptor onto a plain useApi() call, even right after an admin 401', async () => {
    unregisterAll.push(registerEndpoint('/api/probe-401', {
      method: 'GET',
      handler: (event) => { event.node.res.statusCode = 401; return { error: 'not authenticated', code: 'UNAUTHENTICATED', retryable: false } },
    }))
    unregisterAll.push(registerEndpoint('/api/public-403', {
      method: 'GET',
      handler: (event) => { event.node.res.statusCode = 403; return { error: 'forbidden', code: 'FORBIDDEN', retryable: false } },
    }))

    const { wrapper, call, plainCall } = await mountProbe()

    await expect(call({ method: 'GET', path: '/probe-401' })).rejects.toThrow()
    await vi.waitFor(() => expect(navigateCalls.length).toBe(1))

    navigateCalls.length = 0
    callOrder.length = 0
    await expect(plainCall('/public-403')).rejects.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(navigateCalls).toEqual([])
    expect(callOrder).toEqual([])

    wrapper.unmount()
  })
})
