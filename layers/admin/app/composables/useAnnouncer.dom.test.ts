import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useAnnouncer } from './useAnnouncer'

async function mountProbe(format?: (items: string[]) => string) {
  let api: ReturnType<typeof useAnnouncer<string>> | undefined
  const Probe = defineComponent({
    setup() {
      api = useAnnouncer(format)
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Probe)
  if (!api) throw new Error('expected useAnnouncer to run during setup')
  return { wrapper, api }
}

describe('useAnnouncer', () => {
  it('coalesces announcements that arrive within one second into a single message', async () => {
    vi.useFakeTimers()
    const { wrapper, api } = await mountProbe()

    api.announce('a.png uploaded')
    await vi.advanceTimersByTimeAsync(500)
    api.announce('b.png uploaded')
    expect(api.message.value).toBe('')

    await vi.advanceTimersByTimeAsync(500)
    expect(api.message.value).toBe('a.png uploaded. b.png uploaded')

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('hands the items of one batch to the formatter, and only the items announced since the last message', async () => {
    vi.useFakeTimers()
    const { wrapper, api } = await mountProbe((items) => `ready: ${items.join(', ')}`)

    api.announce('a.png')
    api.announce('b.png')
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.message.value).toBe('ready: a.png, b.png')

    api.announce('c.png')
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.message.value).toBe('ready: c.png')

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('re-announces a message identical to the one still displayed, instead of dropping it', async () => {
    vi.useFakeTimers()
    const { wrapper, api } = await mountProbe()

    api.announce('c.png uploaded')
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.message.value).toBe('c.png uploaded')

    api.announce('c.png uploaded')
    await vi.advanceTimersByTimeAsync(0)
    expect(api.message.value).toBe('')

    await vi.advanceTimersByTimeAsync(1000)
    expect(api.message.value).toBe('c.png uploaded')

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('clears the message a while after it was shown', async () => {
    vi.useFakeTimers()
    const { wrapper, api } = await mountProbe()

    api.announce('a.png uploaded')
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.message.value).toBe('a.png uploaded')

    await vi.advanceTimersByTimeAsync(3000)
    expect(api.message.value).toBe('')

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('starts a fresh coalescing window once the previous one has flushed', async () => {
    vi.useFakeTimers()
    const { wrapper, api } = await mountProbe()

    api.announce('a.png uploaded')
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.message.value).toBe('a.png uploaded')

    api.announce('b.png uploaded')
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.message.value).toBe('b.png uploaded')

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('clears its timers on unmount so no further update happens', async () => {
    vi.useFakeTimers()
    const { wrapper, api } = await mountProbe()

    api.announce('a.png uploaded')
    wrapper.unmount()

    await vi.advanceTimersByTimeAsync(10000)
    expect(api.message.value).toBe('')

    vi.useRealTimers()
  })
})
