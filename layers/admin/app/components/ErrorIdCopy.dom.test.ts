import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useToast } from '../composables/useToast'
import ErrorIdCopy from './ErrorIdCopy.vue'

describe('ErrorIdCopy', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

  function stubClipboard(value: unknown) {
    Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
  }

  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else Reflect.deleteProperty(navigator, 'clipboard')
    useToast().items.splice(0)
  })

  it('copies the error id and confirms it', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubClipboard({ writeText })
    const wrapper = await mountSuspended(ErrorIdCopy, { props: { id: 'a1b2c3d4e5f6' } })

    await wrapper.get('button[aria-label="Copy error ID a1b2c3d4e5f6"]').trigger('click')
    await vi.waitFor(() => expect(useToast().items.map((toast) => toast.message)).toContain('Error ID copied'))

    expect(writeText).toHaveBeenCalledWith('a1b2c3d4e5f6')
  })

  it('says so when the clipboard is not available', async () => {
    stubClipboard(undefined)
    const wrapper = await mountSuspended(ErrorIdCopy, { props: { id: 'a1b2c3d4e5f6' } })

    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(useToast().items.map((toast) => toast.message)).toContain('The error ID could not be copied.'))
  })
})
