import { computed, defineComponent, h, reactive } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminSchema, EventDeliveryStatus } from '#kestrel-admin/types/api'
import { useDeadLetterCount } from './useDeadLetterCount'
import { useToast } from './useToast'

const { schema, apiCalls, apiHandler } = vi.hoisted(() => {
  const schema: AdminSchema = {
    locales: { all: ['en'], primary: 'en', prefixPrimary: false },
    collections: [],
    features: [],
    capabilities: { eventsDeliveryStatus: { method: 'GET', path: '/admin/events/delivery' } },
  }
  const apiCalls: string[] = []
  const apiHandler = { fn: (_path: string): Promise<unknown> => Promise.resolve({}) }
  return { schema, apiCalls, apiHandler }
})

const liveSchema = reactive(schema)

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => liveSchema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

mockNuxtImport('useAdminApi', () => () => (route: { path: string, method: string }) => {
  apiCalls.push(route.path)
  return apiHandler.fn(route.path)
})

const CAPABILITIES = schema.capabilities

function delivery(over: Partial<EventDeliveryStatus> = {}): EventDeliveryStatus {
  return { dead: 0, scope: 'store', since: null, lastDeadAt: null, ...over }
}

function answering(...answers: (EventDeliveryStatus | Error)[]): void {
  let call = 0
  apiHandler.fn = () => {
    const next = answers[Math.min(call++, answers.length - 1)]
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
  }
}

async function mountProbe(options?: { poll?: boolean }) {
  let api: ReturnType<typeof useDeadLetterCount> | undefined
  const Probe = defineComponent({
    setup() {
      api = useDeadLetterCount(options)
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Probe, { attachTo: document.body })
  if (!api) throw new Error('expected useDeadLetterCount to run during setup')
  return { wrapper, api }
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useDeadLetterCount', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    apiCalls.splice(0)
    useToast().clear()
    liveSchema.capabilities = CAPABILITIES
    setHidden(false)
    vi.useRealTimers()
  })

  it('reports zero and nothing to show while no event is dead', async () => {
    answering(delivery({ dead: 3 }), delivery({ dead: 0 }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.count.value).toBe(3)
    await api.refresh()
    expect(api.count.value).toBe(0)
    wrapper.unmount()
  })

  it('reports the dead events of the queue scope', async () => {
    answering(delivery({ dead: 3, scope: 'store' }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.count.value).toBe(3)
    wrapper.unmount()
  })

  it('reports nothing for the process scope, which a retry cannot lower', async () => {
    answering(delivery({ dead: 2, scope: 'process', since: 1 }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toHaveLength(1)
    expect(api.count.value).toBe(0)
    wrapper.unmount()
  })

  it('sends no request without the delivery status capability', async () => {
    liveSchema.capabilities = {}
    answering(delivery({ dead: 3 }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(apiCalls).toEqual([])
    expect(api.count.value).toBe(0)
    await api.refresh()
    expect(apiCalls).toEqual([])
    wrapper.unmount()
  })

  it('drops a held count to zero when the capability goes away', async () => {
    answering(delivery({ dead: 3 }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.count.value).toBe(3)
    liveSchema.capabilities = {}
    await vi.advanceTimersByTimeAsync(30_000)
    expect(api.count.value).toBe(0)
    expect(apiCalls).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps the last value and raises no toast when a load fails', async () => {
    answering(delivery({ dead: 4 }), new Error('boom'))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.count.value).toBe(4)
    await api.refresh()
    expect(apiCalls).toHaveLength(2)
    expect(api.count.value).toBe(4)
    expect(useToast().items).toEqual([])
    wrapper.unmount()
  })

  it('loads again on refresh', async () => {
    answering(delivery({ dead: 2 }), delivery({ dead: 0 }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.count.value).toBe(2)
    await api.refresh()
    expect(api.count.value).toBe(0)
    wrapper.unmount()
  })

  it('polls on a timer and follows the count', async () => {
    answering(delivery({ dead: 1 }), delivery({ dead: 5 }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.count.value).toBe(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(api.count.value).toBe(5)
    wrapper.unmount()
  })

  it('pauses polling while the tab is hidden and loads once when it shows again', async () => {
    answering(delivery({ dead: 1 }))
    const { wrapper } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toHaveLength(1)
    setHidden(true)
    await vi.advanceTimersByTimeAsync(300_000)
    expect(apiCalls).toHaveLength(1)
    setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toHaveLength(2)
    wrapper.unmount()
  })

  it('runs no timer and no request after the component unmounts', async () => {
    answering(delivery({ dead: 1 }))
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(300_000)
    setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toHaveLength(1)
    expect(api.count.value).toBe(1)
  })

  it('schedules no timer when the component unmounts while a load is still running', async () => {
    let resolveLoad: (status: EventDeliveryStatus) => void = () => {}
    apiHandler.fn = () => new Promise((resolve) => { resolveLoad = resolve })
    const { wrapper, api } = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toHaveLength(1)
    wrapper.unmount()
    resolveLoad(delivery({ dead: 2 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(apiCalls).toHaveLength(1)
    expect(api.count.value).toBe(2)
  })

  it('shares one count between every caller and starts no poll for a caller that opts out', async () => {
    answering(delivery({ dead: 2 }), delivery({ dead: 0 }))
    const first = await mountProbe()
    await vi.advanceTimersByTimeAsync(0)
    const second = await mountProbe({ poll: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCalls).toHaveLength(1)
    expect(second.api.count.value).toBe(2)
    await second.api.refresh()
    expect(first.api.count.value).toBe(0)
    second.wrapper.unmount()
    expect(vi.getTimerCount()).toBe(1)
    first.wrapper.unmount()
  })
})
