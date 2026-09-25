import { defineComponent, h } from 'vue'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, useApi } from './useApi'

async function mountApi() {
  let api: ReturnType<typeof useApi> | undefined
  await mountSuspended(defineComponent({
    setup() {
      api = useApi()
      return () => h('div')
    },
  }))
  if (!api) throw new Error('expected the probe to expose useApi()')
  return api
}

function refusalOf(promise: Promise<unknown>): Promise<ApiError> {
  return promise.then(
    () => { throw new Error('expected the call to be refused') },
    (e: unknown) => {
      if (!(e instanceof ApiError)) throw e
      return e
    },
  )
}

describe('useApi() on a statically delivered page', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    document.documentElement.removeAttribute('data-kestrel-delivery')
    vi.restoreAllMocks()
  })

  it('refuses a GET with 404 STATIC_DELIVERY without sending it, and warns once per path', async () => {
    let calls = 0
    unregisterAll.push(registerEndpoint('/api/media/static-get', { method: 'GET', handler: () => { calls++; return {} } }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    document.documentElement.setAttribute('data-kestrel-delivery', 'static')
    const api = await mountApi()

    const first = await refusalOf(api('/media/static-get', { query: { locale: 'de' } }))
    const second = await refusalOf(api('/media/static-get'))

    expect(first.status).toBe(404)
    expect(first.code).toBe('STATIC_DELIVERY')
    expect(first.message).toBe('GET /api/media/static-get is not available on the static site; a page\'s data comes from its HTML')
    expect(second.code).toBe('STATIC_DELIVERY')
    expect(calls).toBe(0)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(first.message)
  })

  it('refuses a HEAD the same way', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    document.documentElement.setAttribute('data-kestrel-delivery', 'static')
    const api = await mountApi()

    const refused = await refusalOf(api('/settings', { method: 'HEAD' }))

    expect(refused.code).toBe('STATIC_DELIVERY')
    expect(refused.message).toMatch(/^HEAD \/api\/settings /)
  })

  it('sends every other method', async () => {
    let calls = 0
    unregisterAll.push(registerEndpoint('/api/static-post', { method: 'POST', handler: () => { calls++; return { ok: true } } }))
    document.documentElement.setAttribute('data-kestrel-delivery', 'static')
    const api = await mountApi()

    await expect(api('/static-post', { method: 'POST', body: {} })).resolves.toEqual({ ok: true })
    expect(calls).toBe(1)
  })

  it('sends a GET as before on a page without the marker', async () => {
    let calls = 0
    unregisterAll.push(registerEndpoint('/api/live-get', { method: 'GET', handler: () => { calls++; return { live: true } } }))
    const api = await mountApi()

    await expect(api('/live-get')).resolves.toEqual({ live: true })
    expect(calls).toBe(1)
  })
})
