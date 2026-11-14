import { defineComponent, h, watch } from 'vue'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { useAdminApi } from './useAdminApi'
import { ApiError, useApi } from './useApi'
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

const PROBE_PATH = '/admin/api-probe'
let removeProbeRoute: (() => void) | undefined

beforeAll(() => {
  removeProbeRoute = useRouter().addRoute({ path: PROBE_PATH, component: defineComponent({ render: () => null }) })
})

afterAll(() => removeProbeRoute?.())

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
  const wrapper = await mountSuspended(Probe, { route: PROBE_PATH })
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

describe('every admin request carries a fresh request id', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    navigateCalls.length = 0
    callOrder.length = 0
  })

  it('sends a new x-request-id on each call of both clients and keeps it on the error of a refused call', async () => {
    const seen: (string | undefined)[] = []
    unregisterAll.push(registerEndpoint('/api/probe-ok', { method: 'GET', handler: (event) => { seen.push(event.node.req.headers['x-request-id']?.toString()); return { ok: true } } }))
    unregisterAll.push(registerEndpoint('/api/probe-409', {
      method: 'GET',
      handler: (event) => {
        seen.push(event.node.req.headers['x-request-id']?.toString())
        event.node.res.statusCode = 409
        return { error: 'conflict', code: 'CONFLICT', retryable: false }
      },
    }))

    const { wrapper, call, plainCall } = await mountProbe()

    await call({ method: 'GET', path: '/probe-ok' })
    await plainCall('/probe-ok')
    const refused = await call({ method: 'GET', path: '/probe-409' }).then(() => null, (e: unknown) => e)

    expect(seen).toHaveLength(3)
    for (const id of seen) expect(id).toMatch(/^[0-9a-f]{12}$/)
    expect(new Set(seen).size).toBe(3)
    expect(refused).toBeInstanceOf(ApiError)
    if (!(refused instanceof ApiError)) throw new Error('expected an ApiError')
    expect(refused.status).toBe(409)
    expect(refused.requestId).toBe(seen[2])
    expect(refused.reached).toBe(true)

    wrapper.unmount()
  })

  it('marks a page a proxy wrote in place of an answer as not reached, without its HTML as the message', async () => {
    unregisterAll.push(registerEndpoint('/api/probe-proxy', {
      method: 'GET',
      handler: (event) => {
        event.node.res.statusCode = 502
        event.node.res.setHeader('content-type', 'text/html')
        return '<html><body>502 Bad Gateway</body></html>'
      },
    }))

    const { wrapper, plainCall } = await mountProbe()
    const refused = await plainCall('/probe-proxy').then(() => null, (e: unknown) => e)

    if (!(refused instanceof ApiError)) throw new Error('expected an ApiError')
    expect(refused.status).toBe(502)
    expect(refused.reached).toBe(false)
    expect(refused.message).not.toContain('<html>')
    expect(refused.requestId).toMatch(/^[0-9a-f]{12}$/)

    wrapper.unmount()
  })

  it('rejects a sign-in page an auth proxy answered with 200 in place of the save as not reached, on both clients', async () => {
    unregisterAll.push(registerEndpoint('/api/probe-signin', {
      method: 'GET',
      handler: (event) => {
        event.node.res.setHeader('content-type', 'text/html; charset=utf-8')
        return '<html><body><form action="/sso/login">Sign in</form></body></html>'
      },
    }))

    const { wrapper, call, plainCall } = await mountProbe()
    for (const request of [() => call({ method: 'GET', path: '/probe-signin' }), () => plainCall('/probe-signin')]) {
      const refused = await request().then(() => null, (e: unknown) => e)

      if (!(refused instanceof ApiError)) throw new Error('expected an ApiError')
      expect(refused.status).toBe(200)
      expect(refused.reached).toBe(false)
      expect(refused.message).not.toContain('<html>')
      expect(refused.requestId).toMatch(/^[0-9a-f]{12}$/)
    }

    wrapper.unmount()
  })
})
