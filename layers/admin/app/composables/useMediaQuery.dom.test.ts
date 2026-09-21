import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from './useMediaQuery'

function stubMatchMedia(initialMatches: boolean) {
  let currentMatches = initialMatches
  const listeners = new Set<EventListenerOrEventListenerObject>()
  const removeEventListener = vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
    listeners.delete(listener)
  })
  const queries: string[] = []
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
  window.matchMedia = (query: string) => {
    queries.push(query)
    return mediaQueryList
  }
  return {
    queries,
    removeEventListener,
    fireChange(matches: boolean) {
      currentMatches = matches
      const event = new Event('change')
      listeners.forEach((listener) => (typeof listener === 'function' ? listener(event) : listener.handleEvent(event)))
    },
  }
}

function Probe(query: string) {
  return defineComponent({
    setup() {
      const matches = useMediaQuery(query)
      return () => h('span', String(matches.value))
    },
  })
}

describe('useMediaQuery', () => {
  it('queries the given media string', () => {
    const media = stubMatchMedia(false)
    const wrapper = mount(Probe('(min-width: 800px)'))

    expect(media.queries).toEqual(['(min-width: 800px)'])
    wrapper.unmount()
  })

  it('reflects the initial state and reacts to changes', async () => {
    const media = stubMatchMedia(true)
    const wrapper = mount(Probe('(prefers-reduced-motion: reduce)'))
    await nextTick()

    expect(wrapper.text()).toBe('true')

    media.fireChange(false)
    await nextTick()
    expect(wrapper.text()).toBe('false')

    wrapper.unmount()
  })

  it('removes the media query listener on unmount', () => {
    const media = stubMatchMedia(false)
    const wrapper = mount(Probe('(min-width: 800px)'))

    wrapper.unmount()

    expect(media.removeEventListener).toHaveBeenCalledTimes(1)
  })
})
