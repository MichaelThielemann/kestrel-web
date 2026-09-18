import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SerializedBlock } from '#kestrel-admin/types/kestrel'
import BlockPicker from './BlockPicker.vue'

const blockPickerSource = readFileSync(resolve(process.cwd(), 'layers/admin/app/components/BlockPicker.vue'), 'utf-8')

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

  it('renders a single favorite as its own tile in the large view', async () => {
    localStorage.setItem('kestrel.blockPicker.view', 'large')
    localStorage.setItem('kestrel.blockPicker.favorites', JSON.stringify(['hero']))

    const wrapper = await mountSuspended(BlockPicker, { props: { open: true, types: [heroBlock], lang: 'en' } })

    const favoritesGrid = document.body.querySelector('.block-picker__grid--large')
    expect(favoritesGrid).toBeTruthy()
    expect(favoritesGrid?.querySelectorAll('.block-picker-item')).toHaveLength(1)

    wrapper.unmount()
    localStorage.removeItem('kestrel.blockPicker.view')
    localStorage.removeItem('kestrel.blockPicker.favorites')
  })

  it('sizes the large grid with auto-fill so a single favorite does not span the full width', () => {
    expect(blockPickerSource).toMatch(/&__grid--large\s*{\s*\n\s*grid-template-columns:\s*repeat\(auto-fill,/)
    expect(blockPickerSource).not.toMatch(/&__grid--large\s*{\s*\n\s*grid-template-columns:\s*repeat\(auto-fit,/)
  })
})
