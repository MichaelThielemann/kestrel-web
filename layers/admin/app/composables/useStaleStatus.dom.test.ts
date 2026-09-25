import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h } from 'vue'
import type { AdminSchema, StaleStatus } from '#kestrel-admin/types/api'
import { useStaleStatus } from './useStaleStatus'

const { schema, apiCalls, apiHandler } = vi.hoisted(() => {
  const schema: AdminSchema = {
    locales: { all: ['en'], primary: 'en', prefixPrimary: false },
    collections: [],
    features: [],
    capabilities: { pagesStaleStatus: { method: 'GET', path: '/admin/publish-status/pages' } },
  }
  const apiCalls: string[] = []
  const apiHandler = { fn: (_path: string): Promise<unknown> => Promise.resolve({}) }
  return { schema, apiCalls, apiHandler }
})

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

mockNuxtImport('useAdminApi', () => () => (route: { path: string, method: string }) => {
  apiCalls.push(route.path)
  return apiHandler.fn(route.path)
})

function staleStatus(over: Partial<StaleStatus> = {}): StaleStatus {
  return { stale: 0, failed: 0, rendering: 0, unknown: 0, oldestStaleAt: null, abandoned: 0, ...over }
}

function answering(...answers: StaleStatus[]): void {
  let call = 0
  apiHandler.fn = () => Promise.resolve(answers[Math.min(call++, answers.length - 1)])
}

async function mountProbe() {
  let api: ReturnType<typeof useStaleStatus> | undefined
  const Probe = defineComponent({
    setup() {
      api = useStaleStatus()
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Probe, { attachTo: document.body })
  if (!api) throw new Error('expected useStaleStatus to run during setup')
  return { wrapper, api }
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useStaleStatus', () => {
  afterEach(() => {
    apiCalls.splice(0)
    schema.capabilities = { pagesStaleStatus: { method: 'GET', path: '/admin/publish-status/pages' } }
    setHidden(false)
    vi.useRealTimers()
  })

  it('loads the counts once on mount and stays quiet while nothing waits', async () => {
    vi.useFakeTimers()
    answering(staleStatus({ failed: 1 }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.status.value).toEqual(staleStatus({ failed: 1 }))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(apiCalls).toHaveLength(1)
    wrapper.unmount()
  })

  it('polls every two seconds while pages wait, tracks the progress and stops at zero', async () => {
    vi.useFakeTimers()
    answering(staleStatus({ stale: 4 }), staleStatus({ stale: 3 }), staleStatus({ stale: 1 }), staleStatus())
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.status.value?.stale).toBe(4)
    expect(api.progress.value).toEqual({ done: 0, total: 4, percent: 0 })

    await vi.advanceTimersByTimeAsync(1999)
    expect(apiCalls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(api.status.value?.stale).toBe(3)
    expect(api.progress.value).toEqual({ done: 1, total: 4, percent: 25 })

    await vi.advanceTimersByTimeAsync(4000)
    expect(api.status.value?.stale).toBe(0)
    expect(api.progress.value).toBeNull()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(apiCalls).toHaveLength(4)
    wrapper.unmount()
  })

  it('counts the progress from the number just queued', async () => {
    vi.useFakeTimers()
    answering(staleStatus(), staleStatus({ stale: 8 }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    await api.watch(10)
    expect(api.progress.value).toEqual({ done: 2, total: 10, percent: 20 })
    wrapper.unmount()
  })

  it('pauses while the document is hidden and resumes at once when it is shown again', async () => {
    vi.useFakeTimers()
    answering(staleStatus({ stale: 5 }))
    const { wrapper } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toHaveLength(1)

    setHidden(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(apiCalls).toHaveLength(1)

    setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toHaveLength(2)
    wrapper.unmount()
  })

  it('clears its timer and its listener when the component unmounts', async () => {
    vi.useFakeTimers()
    answering(staleStatus({ stale: 5 }))
    const removed = vi.spyOn(document, 'removeEventListener')
    const { wrapper } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    wrapper.unmount()
    expect(removed).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    await vi.advanceTimersByTimeAsync(10_000)
    setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toHaveLength(1)
    removed.mockRestore()
  })

  it('keeps the load error and requests nothing without the capability', async () => {
    vi.useFakeTimers()
    apiHandler.fn = () => Promise.reject(Object.assign(new Error('store busy'), { status: 503, data: { error: 'store busy', code: 'TRANSIENT', retryable: true } }))
    const failing = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(failing.api.loadError.value).toBeTruthy()
    failing.wrapper.unmount()

    apiCalls.splice(0)
    schema.capabilities = {}
    const without = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toEqual([])
    expect(without.api.available.value).toBe(false)
    without.wrapper.unmount()
  })
})
