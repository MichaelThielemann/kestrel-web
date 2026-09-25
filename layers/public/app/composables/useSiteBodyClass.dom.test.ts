import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useSiteBodyClass } from './useSiteBodyClass'

const Host = defineComponent({
  setup() {
    useSiteBodyClass()
    return () => h('div')
  },
})

describe('useSiteBodyClass', () => {
  it('marks the body only while the site layout is mounted', async () => {
    expect(document.body.classList.contains('site-body')).toBe(false)

    const wrapper = await mountSuspended(Host, { attachTo: document.body })
    await vi.waitFor(() => expect(document.body.classList.contains('site-body')).toBe(true))

    wrapper.unmount()
    await vi.waitFor(() => expect(document.body.classList.contains('site-body')).toBe(false))
  })
})
