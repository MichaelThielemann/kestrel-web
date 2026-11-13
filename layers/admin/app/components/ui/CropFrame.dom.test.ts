import { cropForRatio, type PixelCrop } from '@michaelthielemann/kestrel-images-default/framing'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { MediaRect } from '../../types/api'
import CropFrame from './CropFrame.vue'

const WIDTH = 1600
const HEIGHT = 1200

async function mountFrame(initial: MediaRect | null, focus: MediaRect | null = null, image: { ratio: string, width: number, height: number } = { ratio: '16:9', width: WIDTH, height: HEIGHT }) {
  const emitted: MediaRect[] = []
  const wrapper = await mountSuspended(CropFrame, {
    attachTo: document.body,
    props: {
      src: '/media/one/original.jpg',
      alt: 'A harbour at dusk',
      label: `Crop for ${image.ratio}`,
      ratio: image.ratio,
      width: image.width,
      height: image.height,
      focus,
      modelValue: initial,
      'onUpdate:modelValue': (value: MediaRect | null) => {
        if (value) emitted.push(value)
        void wrapper.setProps({ modelValue: value })
      },
    },
  })
  return { wrapper, emitted }
}

function cropOf(rect: MediaRect | undefined): PixelCrop | null {
  if (!rect) return null
  return cropForRatio({ focus: null, crops: { '16:9': rect } }, '16:9', WIDTH, HEIGHT) ?? { left: 0, top: 150, width: 1600, height: 900 }
}

function wheel(deltaY: number, clientX: number, clientY: number): WheelEvent {
  return new WheelEvent('wheel', { deltaY, clientX, clientY, bubbles: true, cancelable: true })
}

describe('KestrelUiCropFrame', () => {
  it('names the frame, explains its keys and keeps it in the tab order', async () => {
    const { wrapper } = await mountFrame(null)

    const frame = wrapper.get('.ui-crop-frame__frame')
    expect(frame.attributes('tabindex')).toBe('0')
    expect(frame.attributes('aria-label')).toBe('Crop for 16:9')
    expect(frame.attributes('style')).toContain('--ui-crop-frame-ratio: 16 / 9')
    const help = document.getElementById(frame.attributes('aria-describedby') ?? '')
    expect(help?.textContent).toContain('Shift')
    wrapper.unmount()
  })

  it('shows the centred crop without a manual crop or a focus', async () => {
    const { wrapper } = await mountFrame(null)

    const style = wrapper.get('.ui-crop-frame__image').attributes('style') ?? ''
    expect(style).toContain('width: 100%')
    expect(style).toContain('translate(0%, -12.5%)')
    expect(wrapper.get<HTMLInputElement>('input[data-field="zoom"]').element.value).toBe('100')
    wrapper.unmount()
  })

  it('shows the crop centred on the focus when no manual crop is set', async () => {
    const { wrapper } = await mountFrame(null, { x: 0, y: 0, w: 0.2, h: 0.2 })

    expect(wrapper.get('.ui-crop-frame__image').attributes('style')).toContain('translate(0%, 0%)')
    wrapper.unmount()
  })

  it('shows a manual crop scaled and moved into the frame', async () => {
    const { wrapper } = await mountFrame({ x: 0.25, y: 0.3125, w: 0.5, h: 0.375 })

    const style = wrapper.get('.ui-crop-frame__image').attributes('style') ?? ''
    expect(style).toContain('width: 200%')
    expect(style).toContain('translate(-25%, -31.25%)')
    expect(wrapper.get<HTMLInputElement>('input[data-field="zoom"]').element.value).toBe('200')
    expect(wrapper.get<HTMLInputElement>('input[data-field="x"]').element.value).toBe('25')
    wrapper.unmount()
  })

  it('moves the crop with the arrow keys by one percent of the image, ten with Shift, within the image', async () => {
    const { wrapper, emitted } = await mountFrame(null)
    const frame = wrapper.get('.ui-crop-frame__frame')

    await frame.trigger('keydown', { key: 'ArrowDown' })
    expect(cropOf(emitted.at(-1))).toEqual({ left: 0, top: 162, width: 1600, height: 900 })
    await frame.trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    expect(cropOf(emitted.at(-1))).toEqual({ left: 0, top: 282, width: 1600, height: 900 })
    await frame.trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    expect(cropOf(emitted.at(-1))).toEqual({ left: 0, top: 300, width: 1600, height: 900 })
    await frame.trigger('keydown', { key: 'ArrowRight' })
    expect(cropOf(emitted.at(-1))).toEqual({ left: 0, top: 300, width: 1600, height: 900 })
    wrapper.unmount()
  })

  it('zooms in and out around the centre of the crop with plus and minus', async () => {
    const { wrapper, emitted } = await mountFrame(null)
    const frame = wrapper.get('.ui-crop-frame__frame')

    await frame.trigger('keydown', { key: '+' })
    expect(cropOf(emitted.at(-1))).toEqual({ left: 160, top: 240, width: 1280, height: 720 })
    await frame.trigger('keydown', { key: '-' })
    expect(cropOf(emitted.at(-1))).toEqual({ left: 0, top: 150, width: 1600, height: 900 })
    wrapper.unmount()
  })

  it('takes the zoom in percent and the position in percent of the image as numbers', async () => {
    const { wrapper, emitted } = await mountFrame(null)

    await wrapper.get('input[data-field="zoom"]').setValue('200')
    expect(cropOf(emitted.at(-1))).toEqual({ left: 400, top: 375, width: 800, height: 450 })
    await wrapper.get('input[data-field="x"]').setValue('10')
    expect(cropOf(emitted.at(-1))).toEqual({ left: 160, top: 375, width: 800, height: 450 })
    await wrapper.get('input[data-field="y"]').setValue('90')
    expect(cropOf(emitted.at(-1))).toEqual({ left: 160, top: 750, width: 800, height: 450 })
    wrapper.unmount()
  })

  it('zooms with the slider and the buttons, and cannot zoom out past the whole image', async () => {
    const { wrapper, emitted } = await mountFrame(null)

    expect(wrapper.get('[data-action="zoom-out"]').attributes('disabled')).toBeDefined()
    await wrapper.get('input[type="range"]').setValue('2')
    expect(cropOf(emitted.at(-1))).toEqual({ left: 400, top: 375, width: 800, height: 450 })
    await wrapper.get('[data-action="zoom-in"]').trigger('click')
    expect(cropOf(emitted.at(-1))).toEqual({ left: 480, top: 420, width: 640, height: 360 })
    await wrapper.get('[data-action="zoom-out"]').trigger('click')
    expect(cropOf(emitted.at(-1))).toEqual({ left: 400, top: 375, width: 800, height: 450 })
    wrapper.unmount()
  })

  it('zooms in with the wheel and keeps the page from scrolling', async () => {
    const { wrapper, emitted } = await mountFrame(null)
    const frame = wrapper.get('.ui-crop-frame__frame').element
    frame.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: 180, width: 320, height: 180, x: 0, y: 0, toJSON: () => ({}) })

    const event = wheel(-100, 160, 90)
    frame.dispatchEvent(event)
    await nextTick()
    expect(event.defaultPrevented).toBe(true)
    const crop = cropOf(emitted.at(-1))
    expect(crop?.width).toBeLessThan(1600)
    expect((crop?.left ?? 0) + (crop?.width ?? 0) / 2).toBeCloseTo(800, -1)
    wrapper.unmount()
  })

  it('pans the crop against the direction the image is dragged', async () => {
    const { wrapper, emitted } = await mountFrame({ x: 0.25, y: 0.3125, w: 0.5, h: 0.375 })
    const frame = wrapper.get('.ui-crop-frame__frame').element
    frame.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: 180, width: 320, height: 180, x: 0, y: 0, toJSON: () => ({}) })

    const down = new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true })
    const move = new MouseEvent('pointermove', { clientX: 140, clientY: 82, bubbles: true })
    const up = new MouseEvent('pointerup', { clientX: 140, clientY: 82, bubbles: true })
    for (const event of [down, move, up]) Object.defineProperty(event, 'pointerId', { value: 1 })
    frame.dispatchEvent(down)
    frame.dispatchEvent(move)
    frame.dispatchEvent(up)
    await nextTick()
    expect(cropOf(emitted.at(-1))).toEqual({ left: 300, top: 420, width: 800, height: 450 })
    wrapper.unmount()
  })

  it('applies a typed zoom once it is committed, not digit by digit', async () => {
    const { wrapper, emitted } = await mountFrame({ x: 0.25, y: 0.3125, w: 0.5, h: 0.375 })
    const input = wrapper.get<HTMLInputElement>('input[data-field="zoom"]').element
    input.focus()

    for (const typed of ['', '4', '40', '400']) {
      input.value = typed
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()
      expect(input.value).toBe(typed)
    }
    expect(emitted).toEqual([])
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    expect(emitted).toHaveLength(1)
    expect(cropOf(emitted[0])).toEqual({ left: 600, top: 488, width: 400, height: 225 })
    expect(input.value).toBe('400')
    expect(wrapper.get<HTMLInputElement>('input[data-field="x"]').element.value).toBe('37.5')
    wrapper.unmount()
  })

  it('applies a typed position on Enter', async () => {
    const { wrapper, emitted } = await mountFrame({ x: 0.25, y: 0.3125, w: 0.5, h: 0.375 })
    const input = wrapper.get<HTMLInputElement>('input[data-field="x"]').element
    input.focus()
    input.value = '1'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.value = '10'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(emitted).toEqual([])

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await nextTick()
    expect(cropOf(emitted.at(-1))).toEqual({ left: 160, top: 375, width: 800, height: 450 })
    wrapper.unmount()
  })

  it('stops zooming in at the closest crop it can reach and offers that as the slider and number maximum', async () => {
    const { wrapper } = await mountFrame(null, null, { ratio: '1:1', width: 1200, height: 700 })
    const zoomIn = wrapper.get<HTMLButtonElement>('[data-action="zoom-in"]').element

    for (let i = 0; i < 20 && !zoomIn.disabled; i++) {
      zoomIn.click()
      await nextTick()
    }
    expect(zoomIn.disabled).toBe(true)
    const slider = wrapper.get<HTMLInputElement>('input[type="range"]').element
    expect(Number(slider.max)).toBeCloseTo(700 / 88, 6)
    expect(Number(slider.value)).toBeCloseTo(700 / 88, 6)
    expect(wrapper.get<HTMLInputElement>('input[data-field="zoom"]').element.max).toBe('795')
    expect(wrapper.get<HTMLInputElement>('input[data-field="zoom"]').element.value).toBe('795')
    wrapper.unmount()
  })

  it('moves keyboard focus to the slider when a zoom button reaches its limit and disables itself', async () => {
    const { wrapper } = await mountFrame({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
    const zoomOut = wrapper.get<HTMLButtonElement>('[data-action="zoom-out"]').element
    zoomOut.focus()
    zoomOut.click()
    await nextTick()

    expect(zoomOut.disabled).toBe(true)
    await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.get('input[type="range"]').element))
    wrapper.unmount()
  })

  it('keeps the crop automatic when the image is too small for a crop of the exact ratio', async () => {
    const { wrapper, emitted } = await mountFrame(null, null, { ratio: '16:9', width: 40, height: 40 })
    const frame = wrapper.get('.ui-crop-frame__frame')

    await frame.trigger('keydown', { key: 'ArrowDown' })
    await frame.trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    expect(emitted).toEqual([])
    wrapper.unmount()
  })
})
