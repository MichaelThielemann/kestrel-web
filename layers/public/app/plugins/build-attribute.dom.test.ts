import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

describe('the build attribute plugin', () => {
  it('puts data-kestrel-build with the running build id on <html> in the browser', async () => {
    const buildId = useRuntimeConfig().app.buildId
    expect(typeof buildId).toBe('string')
    expect(buildId.length).toBeGreaterThan(0)

    await mountSuspended(defineComponent({ setup: () => () => h('div') }))

    await vi.waitFor(() => {
      expect(document.documentElement.getAttribute('data-kestrel-build')).toBe(buildId)
    })
  })
})
