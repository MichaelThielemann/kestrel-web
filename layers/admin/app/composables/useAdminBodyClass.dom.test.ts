import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useAdminBodyClass } from './useAdminBodyClass'

const Host = defineComponent({
  setup() {
    useAdminBodyClass()
    return () => h('div')
  },
})

describe('useAdminBodyClass', () => {
  it('marks the body only while the admin layout is mounted', async () => {
    expect(document.body.classList.contains('admin-body')).toBe(false)

    const wrapper = await mountSuspended(Host, { attachTo: document.body })
    await vi.waitFor(() => expect(document.body.classList.contains('admin-body')).toBe(true))

    wrapper.unmount()
    await vi.waitFor(() => expect(document.body.classList.contains('admin-body')).toBe(false))
  })
})
