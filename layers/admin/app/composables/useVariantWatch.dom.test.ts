import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h } from 'vue'
import type { AdminSchema, MediaItem } from '#kestrel-admin/types/api'
import { useVariantWatch } from './useVariantWatch'

const { schema, apiCalls, apiHandler } = vi.hoisted(() => {
  const schema: AdminSchema = {
    locales: { all: ['en'], primary: 'en', prefixPrimary: false },
    collections: [],
    features: ['images'],
    capabilities: { listMedia: { method: 'GET', path: '/media' } },
  }
  const apiCalls: { path: string, options?: { query?: { ids?: string, locale?: string } } }[] = []
  const apiHandler = { fn: (_path: string, _options?: unknown): Promise<unknown> => Promise.resolve({ items: [], total: 0 }) }
  return { schema, apiCalls, apiHandler }
})

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

mockNuxtImport('useAdminApi', () => () => (route: { path: string, method: string }, options?: { query?: { ids?: string, locale?: string } }) => {
  apiCalls.push({ path: route.path, options })
  return apiHandler.fn(route.path, options)
})

function mediaItem(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'f1', filename: 'a.jpg', folder: '', contentType: 'image/jpeg', size: 1, key: 'f1', checksum: null,
    status: 'ready', createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null,
    alt: null, title: null, description: null, variants: [], variantCounts: { done: 0, pending: 1, error: 0, failed: 0 },
    ...over,
  }
}

async function mountProbe() {
  let api: ReturnType<typeof useVariantWatch> | undefined
  const Probe = defineComponent({
    setup() {
      api = useVariantWatch()
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Probe, { attachTo: document.body })
  if (!api) throw new Error('expected useVariantWatch to run during setup')
  return { wrapper, api }
}

describe('useVariantWatch', () => {
  afterEach(() => {
    apiCalls.splice(0)
    schema.features = ['images']
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('polls with backoff until pending reaches zero, then stops', async () => {
    vi.useFakeTimers()
    let call = 0
    apiHandler.fn = () => {
      call++
      const pending = call < 3 ? 1 : 0
      return Promise.resolve({ items: [mediaItem({ variantCounts: { done: call, pending, error: 0, failed: 0 } })], total: 1 })
    }

    const { wrapper, api } = await mountProbe()
    api.track('f1')

    await vi.advanceTimersByTimeAsync(0)
    expect(call).toBe(1)
    expect(api.entryFor('f1')?.variantCounts.pending).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(call).toBe(2)
    expect(api.entryFor('f1')?.variantCounts.pending).toBe(1)

    await vi.advanceTimersByTimeAsync(2000)
    expect(call).toBe(3)
    expect(api.entryFor('f1')?.variantCounts.pending).toBe(0)

    await vi.advanceTimersByTimeAsync(20000)
    expect(call).toBe(3)

    expect(apiCalls[0]).toMatchObject({ path: '/media', options: { query: { ids: 'f1', locale: 'en' } } })
    wrapper.unmount()
  })

  it('resets the backoff to 1s when a new id joins', async () => {
    vi.useFakeTimers()
    let call = 0
    apiHandler.fn = () => {
      call++
      return Promise.resolve({ items: [mediaItem({ id: 'f1' }), mediaItem({ id: 'f2' })], total: 2 })
    }

    const { wrapper, api } = await mountProbe()
    api.track('f1')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(call).toBe(2)

    api.track('f2')
    await vi.advanceTimersByTimeAsync(0)
    expect(call).toBe(3)

    wrapper.unmount()
  })

  it('does nothing when the images feature is off', async () => {
    schema.features = []
    vi.useFakeTimers()
    let called = false
    apiHandler.fn = () => { called = true; return Promise.resolve({ items: [], total: 0 }) }

    const { wrapper, api } = await mountProbe()
    api.track('f1')
    await vi.advanceTimersByTimeAsync(5000)

    expect(called).toBe(false)
    wrapper.unmount()
  })

  it('pauses while the document is hidden and resumes when visible', async () => {
    vi.useFakeTimers()
    let call = 0
    apiHandler.fn = () => { call++; return Promise.resolve({ items: [mediaItem({ variantCounts: { done: 1, pending: 1, error: 0, failed: 0 } })], total: 1 }) }
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })

    const { wrapper, api } = await mountProbe()
    api.track('f1')
    await vi.advanceTimersByTimeAsync(5000)
    expect(call).toBe(0)

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(call).toBe(1)

    wrapper.unmount()
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  })

  it('clears its timer and listener on unmount', async () => {
    vi.useFakeTimers()
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    apiHandler.fn = () => Promise.resolve({ items: [mediaItem({ variantCounts: { done: 0, pending: 1, error: 0, failed: 0 } })], total: 1 })

    const { wrapper, api } = await mountProbe()
    api.track('f1')
    await vi.advanceTimersByTimeAsync(0)
    expect(api.entryFor('f1')).toBeDefined()
    const callsBeforeUnmount = apiCalls.length

    wrapper.unmount()

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    await vi.advanceTimersByTimeAsync(60000)
    expect(apiCalls.length).toBe(callsBeforeUnmount)
  })

  it('reports pending while tracking and clears once every count reaches zero', async () => {
    vi.useFakeTimers()
    let call = 0
    apiHandler.fn = () => {
      call++
      return Promise.resolve({ items: [mediaItem({ variantCounts: { done: call, pending: call < 2 ? 1 : 0, error: 0, failed: 0 } })], total: 1 })
    }

    const { wrapper, api } = await mountProbe()
    expect(api.hasPending.value).toBe(false)

    api.track('f1')
    expect(api.hasPending.value).toBe(true)

    await vi.advanceTimersByTimeAsync(0)
    expect(api.hasPending.value).toBe(true)

    await vi.advanceTimersByTimeAsync(1000)
    expect(api.hasPending.value).toBe(false)

    wrapper.unmount()
  })

  it('does not restart polling when a request in flight at unmount finishes afterwards', async () => {
    vi.useFakeTimers()
    let call = 0
    let resolveFetch: ((value: unknown) => void) | undefined
    apiHandler.fn = () => {
      call++
      return new Promise((resolve) => { resolveFetch = resolve })
    }

    const { wrapper, api } = await mountProbe()
    api.track('f1')
    await vi.advanceTimersByTimeAsync(0)
    expect(call).toBe(1)

    wrapper.unmount()
    resolveFetch?.({ items: [mediaItem({ variantCounts: { done: 0, pending: 1, error: 0, failed: 0 } })], total: 1 })
    await vi.advanceTimersByTimeAsync(0)

    const callsRightAfterUnmount = call
    await vi.advanceTimersByTimeAsync(60000)
    expect(call).toBe(callsRightAfterUnmount)
  })

  it('stops polling and marks an id stalled after ten minutes without a count change', async () => {
    vi.useFakeTimers()
    apiHandler.fn = () => Promise.resolve({ items: [mediaItem({ variantCounts: { done: 0, pending: 1, error: 0, failed: 0 } })], total: 1 })

    const { wrapper, api } = await mountProbe()
    api.track('f1')
    await vi.advanceTimersByTimeAsync(0)
    expect(api.isStalled('f1')).toBe(false)

    await vi.advanceTimersByTimeAsync(11 * 60 * 1000)

    expect(api.isStalled('f1')).toBe(true)
    expect(api.hasPending.value).toBe(false)
    const callsAtStall = apiCalls.length
    await vi.advanceTimersByTimeAsync(60000)
    expect(apiCalls.length).toBe(callsAtStall)

    wrapper.unmount()
  })

  it('calls onReady exactly once when pending reaches zero with no errors', async () => {
    vi.useFakeTimers()
    apiHandler.fn = () => Promise.resolve({ items: [mediaItem({ variantCounts: { done: 1, pending: 0, error: 0, failed: 0 } })], total: 1 })
    const onReady = vi.fn()
    const onFailed = vi.fn()

    const { wrapper, api } = await mountProbe()
    api.track('f1', { onReady, onFailed })
    await vi.advanceTimersByTimeAsync(0)

    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onFailed).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(20000)
    expect(onReady).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('calls onFailed exactly once when pending reaches zero with a failed variant', async () => {
    vi.useFakeTimers()
    apiHandler.fn = () => Promise.resolve({ items: [mediaItem({ variantCounts: { done: 1, pending: 0, error: 0, failed: 1 } })], total: 1 })
    const onReady = vi.fn()
    const onFailed = vi.fn()

    const { wrapper, api } = await mountProbe()
    api.track('f1', { onReady, onFailed })
    await vi.advanceTimersByTimeAsync(0)

    expect(onFailed).toHaveBeenCalledTimes(1)
    expect(onReady).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('sends at most 200 ids in a single call', async () => {
    vi.useFakeTimers()
    apiHandler.fn = () => Promise.resolve({ items: [], total: 0 })

    const { wrapper, api } = await mountProbe()
    for (let i = 0; i < 250; i++) api.track(`f${i}`)
    await vi.advanceTimersByTimeAsync(0)

    const ids = apiCalls[0]?.options?.query?.ids ?? ''
    expect(ids.split(',')).toHaveLength(200)

    wrapper.unmount()
  })

  it('stops tracking on a 401 instead of retrying', async () => {
    vi.useFakeTimers()
    let call = 0
    apiHandler.fn = () => {
      call++
      return Promise.reject(Object.assign(new Error('nope'), { status: 401, name: 'ApiError', data: { error: 'nope', code: 'UNAUTHENTICATED' } }))
    }

    const { wrapper, api } = await mountProbe()
    api.track('f1')
    await vi.advanceTimersByTimeAsync(0)
    expect(call).toBe(1)
    expect(api.hasPending.value).toBe(false)

    await vi.advanceTimersByTimeAsync(60000)
    expect(call).toBe(1)

    wrapper.unmount()
  })
})
