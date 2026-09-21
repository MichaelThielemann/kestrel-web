import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useIsPhone } from './useIsPhone'

function stubMatchMedia(initialMatches: boolean) {
  let currentMatches = initialMatches
  const listeners = new Set<EventListenerOrEventListenerObject>()
  const removeEventListener = vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
    listeners.delete(listener)
  })
  const mediaQueryList: MediaQueryList = {
    get matches() {
      return currentMatches
    },
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener)
    },
    removeEventListener,
    dispatchEvent: () => false,
  }
  window.matchMedia = () => mediaQueryList
  return {
    removeEventListener,
    fireChange(matches: boolean) {
      currentMatches = matches
      const event = new Event('change')
      listeners.forEach((listener) => (typeof listener === 'function' ? listener(event) : listener.handleEvent(event)))
    },
  }
}

const Probe = defineComponent({
  setup() {
    const isPhone = useIsPhone()
    return () => h('span', String(isPhone.value))
  },
})

describe('useIsPhone', () => {
  it('reflects the initial media query state and reacts to changes', async () => {
    const media = stubMatchMedia(true)
    const wrapper = mount(Probe)
    await nextTick()

    expect(wrapper.text()).toBe('true')

    media.fireChange(false)
    await nextTick()
    expect(wrapper.text()).toBe('false')

    wrapper.unmount()
  })

  it('removes the media query listener on unmount', () => {
    const media = stubMatchMedia(false)
    const wrapper = mount(Probe)

    wrapper.unmount()

    expect(media.removeEventListener).toHaveBeenCalledTimes(1)
  })
})
