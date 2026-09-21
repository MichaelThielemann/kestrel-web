import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { useIsPhone, phoneMediaQuery } from './useIsPhone'

function stubMatchMedia() {
  const queries: string[] = []
  window.matchMedia = (query: string) => {
    queries.push(query)
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }
  }
  return queries
}

const Probe = defineComponent({
  setup() {
    const isPhone = useIsPhone()
    return () => h('span', String(isPhone.value))
  },
})

describe('useIsPhone', () => {
  it('queries the phone breakpoint', () => {
    const queries = stubMatchMedia()
    const wrapper = mount(Probe)

    expect(queries).toEqual([phoneMediaQuery()])
    wrapper.unmount()
  })
})
