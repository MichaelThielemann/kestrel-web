import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SerializedBlock } from '#kestrel-admin/types/kestrel'
import BlockPicker from './BlockPicker.vue'

const heroBlock: SerializedBlock = { name: 'hero', label: 'Hero', fields: {} }

class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('BlockPicker', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens the block info popover outside its scroll container and toggles the trigger attributes', async () => {
    const wrapper = await mountSuspended(BlockPicker, { props: { open: true, types: [heroBlock], lang: 'en' } })

    const scrollContainer = document.body.querySelector('.block-picker__body')
    const trigger = document.body.querySelector('.block-picker-item__info')
    expect(scrollContainer).toBeTruthy()
    expect(trigger).toBeTruthy()
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(trigger?.getAttribute('aria-controls')).toBeNull()

    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await nextTick()

    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    const controlsId = trigger?.getAttribute('aria-controls')
    expect(controlsId).toBeTruthy()

    const popover = controlsId ? document.getElementById(controlsId) : null
    expect(popover).toBeTruthy()
    expect(popover?.getAttribute('role')).toBe('dialog')
    expect(scrollContainer?.contains(popover)).toBe(false)

    wrapper.unmount()
  })
})
