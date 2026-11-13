import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { MediaRect } from '../../types/api'
import RectSelect from './RectSelect.vue'

async function mountSelect(initial: MediaRect | null) {
  const emitted: (MediaRect | null)[] = []
  const wrapper = await mountSuspended(RectSelect, {
    attachTo: document.body,
    props: {
      src: '/media/one/original.jpg',
      alt: 'A harbour at dusk',
      label: 'Focus area',
      modelValue: initial,
      'onUpdate:modelValue': (value: MediaRect | null) => {
        emitted.push(value)
        void wrapper.setProps({ modelValue: value })
      },
    },
  })
  return { wrapper, emitted, last: () => emitted.at(-1) }
}

function expectRect(actual: MediaRect | null | undefined, expected: MediaRect) {
  expect(actual).toBeTruthy()
  for (const key of ['x', 'y', 'w', 'h'] as const) expect(actual?.[key]).toBeCloseTo(expected[key], 6)
}

function pointer(type: string, clientX: number, clientY: number): Event {
  const event = new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  return event
}

function fakeBox(el: Element, width: number, height: number) {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) })
}

describe('KestrelUiRectSelect', () => {
  it('names the selection surface and explains its keys', async () => {
    const { wrapper } = await mountSelect(null)

    const surface = wrapper.get('.ui-rect-select__surface')
    expect(surface.attributes('tabindex')).toBe('0')
    expect(surface.attributes('aria-label')).toBe('Focus area')
    const help = document.getElementById(surface.attributes('aria-describedby') ?? '')
    expect(help?.textContent).toContain('Shift')
    expect(wrapper.find('.ui-rect-select__rect').exists()).toBe(false)
    wrapper.unmount()
  })

  it('places the rectangle by percentages of the image and fills the numeric fields', async () => {
    const { wrapper } = await mountSelect({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })

    const style = wrapper.get('.ui-rect-select__rect').attributes('style') ?? ''
    expect(style).toContain('left: 10%')
    expect(style).toContain('top: 20%')
    expect(style).toContain('width: 30%')
    expect(style).toContain('height: 40%')
    expect(wrapper.get<HTMLInputElement>('input[data-field="x"]').element.value).toBe('10')
    expect(wrapper.get<HTMLInputElement>('input[data-field="h"]').element.value).toBe('40')
    wrapper.unmount()
  })

  it('moves the rectangle with the arrow keys, ten times as far with Shift, and stops at the edge', async () => {
    const { wrapper, last } = await mountSelect({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 })
    const surface = wrapper.get('.ui-rect-select__surface')

    await surface.trigger('keydown', { key: 'ArrowRight' })
    expectRect(last(), { x: 0.21, y: 0.2, w: 0.3, h: 0.3 })
    await surface.trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    expectRect(last(), { x: 0.21, y: 0.1, w: 0.3, h: 0.3 })
    await surface.trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    await surface.trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    expectRect(last(), { x: 0.21, y: 0, w: 0.3, h: 0.3 })
    wrapper.unmount()
  })

  it('resizes the rectangle with Alt and the arrow keys', async () => {
    const { wrapper, last } = await mountSelect({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 })
    const surface = wrapper.get('.ui-rect-select__surface')

    await surface.trigger('keydown', { key: 'ArrowRight', altKey: true })
    expectRect(last(), { x: 0.2, y: 0.2, w: 0.31, h: 0.3 })
    await surface.trigger('keydown', { key: 'ArrowUp', altKey: true, shiftKey: true })
    expectRect(last(), { x: 0.2, y: 0.2, w: 0.31, h: 0.2 })
    wrapper.unmount()
  })

  it('creates a centred rectangle with Enter and removes it with Delete', async () => {
    const { wrapper, last } = await mountSelect(null)
    const surface = wrapper.get('.ui-rect-select__surface')

    await surface.trigger('keydown', { key: 'Enter' })
    expectRect(last(), { x: 0.25, y: 0.25, w: 0.5, h: 0.5 })
    await surface.trigger('keydown', { key: 'Delete' })
    expect(last()).toBeNull()
    wrapper.unmount()
  })

  it('takes x, y, width and height as numbers in percent and keeps the rectangle in the image', async () => {
    const { wrapper, last } = await mountSelect({ x: 0.2, y: 0.2, w: 0.5, h: 0.4 })

    await wrapper.get('input[data-field="x"]').setValue('30')
    expectRect(last(), { x: 0.3, y: 0.2, w: 0.5, h: 0.4 })
    await wrapper.get('input[data-field="w"]').setValue('90')
    expectRect(last(), { x: 0.3, y: 0.2, w: 0.7, h: 0.4 })
    await wrapper.get('input[data-field="y"]').setValue('80')
    expectRect(last(), { x: 0.3, y: 0.6, w: 0.7, h: 0.4 })
    await wrapper.get('input[data-field="h"]').setValue('0')
    expectRect(last(), { x: 0.3, y: 0.6, w: 0.7, h: 0 })
    wrapper.unmount()
  })

  it('starts from the centred rectangle when a number is typed without a selection', async () => {
    const { wrapper, last } = await mountSelect(null)

    await wrapper.get('input[data-field="w"]').setValue('20')
    expectRect(last(), { x: 0.25, y: 0.25, w: 0.2, h: 0.5 })
    wrapper.unmount()
  })

  it('draws a rectangle by dragging across the image', async () => {
    const { wrapper, last } = await mountSelect(null)
    const surface = wrapper.get('.ui-rect-select__surface').element
    fakeBox(surface, 200, 100)

    surface.dispatchEvent(pointer('pointerdown', 20, 10))
    surface.dispatchEvent(pointer('pointermove', 120, 60))
    surface.dispatchEvent(pointer('pointerup', 120, 60))
    await nextTick()
    expectRect(last(), { x: 0.1, y: 0.1, w: 0.5, h: 0.5 })
    wrapper.unmount()
  })

  it('moves the rectangle when it is dragged by its body and resizes it by a handle', async () => {
    const { wrapper, last } = await mountSelect({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })
    const surface = wrapper.get('.ui-rect-select__surface').element
    fakeBox(surface, 200, 100)

    const body = wrapper.get('.ui-rect-select__rect').element
    body.dispatchEvent(pointer('pointerdown', 40, 15))
    body.dispatchEvent(pointer('pointermove', 60, 25))
    body.dispatchEvent(pointer('pointerup', 60, 25))
    await nextTick()
    expectRect(last(), { x: 0.2, y: 0.2, w: 0.2, h: 0.2 })

    const handle = wrapper.get('[data-handle="se"]').element
    handle.dispatchEvent(pointer('pointerdown', 80, 40))
    handle.dispatchEvent(pointer('pointermove', 100, 60))
    handle.dispatchEvent(pointer('pointerup', 100, 60))
    await nextTick()
    expectRect(last(), { x: 0.2, y: 0.2, w: 0.3, h: 0.4 })
    wrapper.unmount()
  })

  it('sets a point focus on double-click', async () => {
    const { wrapper, last } = await mountSelect({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })
    const surface = wrapper.get('.ui-rect-select__surface').element
    fakeBox(surface, 200, 100)

    surface.dispatchEvent(new MouseEvent('dblclick', { clientX: 150, clientY: 25, bubbles: true }))
    await nextTick()
    expectRect(last(), { x: 0.75, y: 0.25, w: 0, h: 0 })
    wrapper.unmount()
  })

  it('offers a resize handle at every corner and edge, kept from assistive technology', async () => {
    const { wrapper } = await mountSelect({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })

    const handles = wrapper.findAll('[data-handle]')
    expect(handles.map((handle) => handle.attributes('data-handle')).sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'])
    for (const handle of handles) expect(handle.attributes('aria-hidden')).toBe('true')
    wrapper.unmount()
  })
})
