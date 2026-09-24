import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useAnnouncer } from './useAnnouncer'

async function mountProbe() {
  let api: ReturnType<typeof useAnnouncer> | undefined
  const Probe = defineComponent({
    setup() {
      api = useAnnouncer()
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
    expect(api.message.value).toBe('a.png uploaded b.png uploaded')

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
