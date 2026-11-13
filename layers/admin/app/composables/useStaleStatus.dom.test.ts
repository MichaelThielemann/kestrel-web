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
  return { stale: 0, failed: 0, rendering: 0, unknown: 0, oldestStaleAt: null, abandoned: 0, exports: { indexes: null, llmsFull: null }, ...over }
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
    delete schema.llmsFull
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

  it('polls every two seconds while pages wait, tracks the progress and stops at zero when the site writes no llms-full.txt', async () => {
    vi.useFakeTimers()
    const exported = { indexes: { at: 7, entries: 4, error: null, skipped: false }, llmsFull: null }
    answering(staleStatus({ stale: 4 }), staleStatus({ stale: 3, exports: exported }), staleStatus({ stale: 1, exports: exported }), staleStatus({ exports: exported }))
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
    await vi.advanceTimersByTimeAsync(60_000)
    expect(apiCalls).toHaveLength(4)
    wrapper.unmount()
  })

  it('keeps polling until an llms-full export that ends long after the drain is shown', async () => {
    vi.useFakeTimers()
    schema.llmsFull = true
    const before = { indexes: { at: 1, entries: 3, error: null, skipped: false }, llmsFull: { at: 1, entries: 0, error: 'could not read the stored HTML', skipped: false } }
    const indexesOnly = { ...before, indexes: { at: 2, entries: 3, error: null, skipped: false } }
    const both = { ...indexesOnly, llmsFull: { at: 3, entries: 3, error: null, skipped: false } }
    answering(
      staleStatus({ stale: 2, exports: before }),
      staleStatus({ exports: before }),
      ...Array.from({ length: 6 }, () => staleStatus({ exports: indexesOnly })),
      staleStatus({ exports: both }),
    )
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.status.value?.stale).toBe(0)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(api.status.value?.exports.llmsFull?.error).toBe('could not read the stored HTML')
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.status.value?.exports).toEqual(both)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(apiCalls).toHaveLength(9)
    wrapper.unmount()
  })

  it('stops polling a minute after the drain when no llms-full export follows it', async () => {
    vi.useFakeTimers()
    schema.llmsFull = true
    answering(staleStatus({ stale: 1 }), staleStatus())
    const { wrapper } = await mountProbe()
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(60_000)
    const calls = apiCalls.length
    expect(calls).toBeGreaterThan(25)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(apiCalls).toHaveLength(calls)
    wrapper.unmount()
  })

  it('reads out an llms-full export that failed after the backlog once, and then stops polling', async () => {
    vi.useFakeTimers()
    schema.llmsFull = true
    const written = { indexes: { at: 1, entries: 3, error: null, skipped: false }, llmsFull: { at: 1, entries: 3, error: null, skipped: false } }
    const failedAt = (at: number) => ({ ...written, llmsFull: { at, entries: 0, error: 'EACCES: llms-full.txt', skipped: false } })
    answering(staleStatus({ stale: 1, exports: written }), staleStatus({ exports: written }), staleStatus({ exports: written }), staleStatus({ exports: failedAt(5) }), staleStatus({ exports: failedAt(40) }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.announcement.value).toBe('Every published page shows its current content.')
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.announcement.value).toBe('Every published page shows its current content.')
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.announcement.value).toMatch(/^llms-full\.txt: Export failed at .+: EACCES: llms-full\.txt$/)
    const said = api.announcement.value
    await vi.advanceTimersByTimeAsync(60_000)
    expect(apiCalls).toHaveLength(4)
    expect(api.announcement.value).toBe(said)
    wrapper.unmount()
  })

  it('keeps the exports watch() waits for across the drain, so an index export during the backlog and the llms-full export after it end the wait', async () => {
    vi.useFakeTimers()
    schema.llmsFull = true
    const before = { indexes: { at: 1, entries: 3, error: null, skipped: false }, llmsFull: { at: 1, entries: 3, error: null, skipped: false } }
    const indexed = { ...before, indexes: { at: 2, entries: 3, error: null, skipped: false } }
    const exported = { ...indexed, llmsFull: { at: 5, entries: 3, error: null, skipped: false } }
    answering(staleStatus({ exports: before }), staleStatus({ stale: 3, exports: before }), staleStatus({ stale: 1, exports: indexed }), staleStatus({ exports: indexed }), staleStatus({ exports: exported }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    await api.watch(3)
    await vi.advanceTimersByTimeAsync(4000)
    expect(api.status.value?.stale).toBe(0)
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.status.value?.exports).toEqual(exported)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(apiCalls).toHaveLength(5)
    wrapper.unmount()
  })

  it('waits for the llms-full export after a drain that comes more than a minute after watch()', async () => {
    vi.useFakeTimers()
    schema.llmsFull = true
    const before = { indexes: { at: 1, entries: 3, error: null, skipped: false }, llmsFull: { at: 1, entries: 3, error: null, skipped: false } }
    const exported = { ...before, llmsFull: { at: 90, entries: 3, error: null, skipped: false } }
    answering(staleStatus({ exports: before }), ...Array.from({ length: 36 }, () => staleStatus({ stale: 2, exports: before })), staleStatus({ exports: before }), staleStatus({ exports: before }), staleStatus({ exports: exported }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    await api.watch(2)
    await vi.advanceTimersByTimeAsync(72_000)
    expect(api.status.value?.stale).toBe(0)
    await vi.advanceTimersByTimeAsync(4000)
    expect(api.status.value?.exports).toEqual(exported)
    wrapper.unmount()
  })

  it('keeps polling for the exports after watch() even when the backlog is already empty', async () => {
    vi.useFakeTimers()
    const exported = { indexes: { at: 9, entries: 4, error: null, skipped: false }, llmsFull: null }
    answering(staleStatus(), staleStatus(), staleStatus({ exports: exported }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    await api.watch(0)
    expect(apiCalls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.status.value?.exports).toEqual(exported)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(apiCalls.length).toBeLessThanOrEqual(5)
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

  it('never has two requests in flight, and loads once more after one that a toggle or a queue started meanwhile', async () => {
    vi.useFakeTimers()
    let inFlight = 0
    let most = 0
    const pending: (() => void)[] = []
    apiHandler.fn = () => {
      inFlight++
      most = Math.max(most, inFlight)
      return new Promise((resolve) => {
        pending.push(() => {
          inFlight--
          resolve(staleStatus({ stale: 2 }))
        })
      })
    }
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toHaveLength(1)

    setHidden(true)
    setHidden(false)
    const queued = api.watch(5)
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toHaveLength(1)

    pending.shift()?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toHaveLength(2)
    pending.shift()?.()
    await queued
    expect(most).toBe(1)
    expect(api.progress.value).toEqual({ done: 3, total: 5, percent: 60 })
    wrapper.unmount()
  })

  it('announces only when pages start waiting and when the backlog ends, not on every poll', async () => {
    vi.useFakeTimers()
    answering(staleStatus(), staleStatus({ stale: 3 }), staleStatus({ stale: 2 }), staleStatus({ stale: 1 }), staleStatus())
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.announcement.value).toBe('')

    await api.watch(3)
    expect(api.announcement.value).toBe('3 pages wait to be re-rendered because content they show changed.')
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.status.value?.stale).toBe(2)
    expect(api.announcement.value).toBe('3 pages wait to be re-rendered because content they show changed.')
    await vi.advanceTimersByTimeAsync(4000)
    expect(api.status.value?.stale).toBe(0)
    expect(api.announcement.value).toBe('Every published page shows its current content.')
    wrapper.unmount()
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
