import { cropForRatio, type PixelCrop } from '@michaelthielemann/kestrel-images-default/framing'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { en } from '../../i18n/en'
import type { MediaRect } from '../../types/api'
import CropFrame from './CropFrame.vue'

const WIDTH = 1600
const HEIGHT = 1200

async function mountFrame(initial: MediaRect | null, focus: MediaRect | null = null, image: { ratio: string, width: number, height: number } = { ratio: '16:9', width: WIDTH, height: HEIGHT }, snap?: boolean) {
  const emitted: MediaRect[] = []
  const pending: boolean[] = []
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
      ...(snap === undefined ? {} : { snap }),
      modelValue: initial,
      onPending: (value: boolean) => { pending.push(value) },
      'onUpdate:modelValue': (value: MediaRect | null) => {
        if (value) emitted.push(value)
        void wrapper.setProps({ modelValue: value })
      },
    },
  })
  return { wrapper, emitted, pending }
}

function cropOf(rect: MediaRect | undefined): PixelCrop | null {
  if (!rect) return null
  return cropForRatio({ focus: null, crops: { '16:9': rect } }, '16:9', WIDTH, HEIGHT) ?? { left: 0, top: 150, width: 1600, height: 900 }
}

function wheel(deltaY: number, clientX: number, clientY: number, init: WheelEventInit = {}): WheelEvent {
  return new WheelEvent('wheel', { deltaY, clientX, clientY, bubbles: true, cancelable: true, ...init })
}

const PINCH = { ctrlKey: true }

const helpPanel = (wrapper: Awaited<ReturnType<typeof mountFrame>>['wrapper']) => wrapper.get('.ui-info-toggle__panel')

const SMALL = { ratio: '1:1', width: 1200, height: 700 }

function squareCropOf(rect: MediaRect | undefined): PixelCrop | null {
  return rect ? cropForRatio({ focus: null, crops: { '1:1': rect } }, '1:1', SMALL.width, SMALL.height) ?? null : null
}

function squareRect(left: number, top: number, side: number): MediaRect {
  return { x: left / SMALL.width, y: top / SMALL.height, w: side / SMALL.width, h: side / SMALL.height }
}

function pointerEvent(type: string, pointerId: number, clientX: number, clientY: number, altKey = false): MouseEvent {
  const event = new MouseEvent(type, { clientX, clientY, altKey, bubbles: true, cancelable: true })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  return event
}

function sizedFrame(wrapper: Awaited<ReturnType<typeof mountFrame>>['wrapper'], width: number, height: number): Element {
  const frame = wrapper.get('.ui-crop-frame__frame').element
  frame.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) })
  return frame
}

function squareFrame(wrapper: Awaited<ReturnType<typeof mountFrame>>['wrapper']): Element {
  return sizedFrame(wrapper, 600, 600)
}

describe('KestrelUiCropFrame', () => {
  it('names the frame, explains its keys and keeps it in the tab order', async () => {
    const { wrapper } = await mountFrame(null)

    const frame = wrapper.get('.ui-crop-frame__frame')
    expect(frame.attributes('tabindex')).toBe('0')
    expect(frame.attributes('aria-label')).toBe('Crop for 16:9')
    expect(frame.attributes('style')).toContain('--ui-crop-frame-ratio: 16 / 9')
    const keys = document.getElementById(frame.attributes('aria-describedby') ?? '')
    expect(keys?.textContent).toBe(en['cropFrame.keys'])
    expect(helpPanel(wrapper).attributes('hidden')).toBeDefined()
    expect(helpPanel(wrapper).text()).toContain(en['cropFrame.help'])
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

  it('follows the crop again after the shown value is typed and the field is left without a change event', async () => {
    const { wrapper, emitted, pending } = await mountFrame({ x: 0.25, y: 0.3125, w: 0.5, h: 0.375 })
    const input = wrapper.get<HTMLInputElement>('input[data-field="x"]').element
    input.focus()
    for (const typed of ['2', '25']) {
      input.value = typed
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await nextTick()
    expect(pending.at(-1)).toBe(true)

    input.dispatchEvent(new FocusEvent('blur'))
    await nextTick()
    expect(pending.at(-1)).toBe(false)
    expect(emitted).toEqual([])

    await wrapper.get('.ui-crop-frame__frame').trigger('keydown', { key: 'ArrowRight' })
    expect(cropOf(emitted.at(-1))).toEqual({ left: 416, top: 375, width: 800, height: 450 })
    expect(input.value).toBe('26')
    wrapper.unmount()
  })

  it('applies a typed position when the field is left', async () => {
    const { wrapper, emitted, pending } = await mountFrame({ x: 0.25, y: 0.3125, w: 0.5, h: 0.375 })
    const input = wrapper.get<HTMLInputElement>('input[data-field="x"]').element
    input.focus()
    for (const typed of ['1', '10']) {
      input.value = typed
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await nextTick()
    expect(emitted).toEqual([])

    input.dispatchEvent(new FocusEvent('blur'))
    await nextTick()
    expect(cropOf(emitted.at(-1))).toEqual({ left: 160, top: 375, width: 800, height: 450 })
    expect(pending.at(-1)).toBe(false)
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

  it('follows a slow drag at a high zoom, where one screen pixel is less than half an image pixel', async () => {
    const { wrapper, emitted } = await mountFrame(squareRect(500, 262, 175), null, SMALL)
    const frame = squareFrame(wrapper)

    frame.dispatchEvent(pointerEvent('pointerdown', 1, 300, 300))
    for (let x = 301; x <= 400; x++) {
      frame.dispatchEvent(pointerEvent('pointermove', 1, x, 300))
      await nextTick()
    }
    frame.dispatchEvent(pointerEvent('pointerup', 1, 400, 300))
    await nextTick()
    const crop = squareCropOf(emitted.at(-1))
    expect(crop?.width).toBe(175)
    expect(Math.abs((crop?.left ?? 0) - (500 - (100 / 600) * 175))).toBeLessThanOrEqual(1)
    wrapper.unmount()
  })

  it('keeps a slow drag under the pointer where one screen pixel is most of an image pixel', async () => {
    const { wrapper, emitted } = await mountFrame(squareRect(300, 100, 467), null, SMALL)
    const frame = squareFrame(wrapper)

    frame.dispatchEvent(pointerEvent('pointerdown', 1, 300, 300))
    for (let x = 301; x <= 360; x++) {
      frame.dispatchEvent(pointerEvent('pointermove', 1, x, 300))
      await nextTick()
    }
    frame.dispatchEvent(pointerEvent('pointerup', 1, 360, 300))
    await nextTick()
    const crop = squareCropOf(emitted.at(-1))
    expect(Math.abs((crop?.left ?? 0) - (300 - (60 / 600) * 467))).toBeLessThanOrEqual(1)
    wrapper.unmount()
  })

  it('follows a slow pinch at a high zoom by the total change of the finger distance', async () => {
    const { wrapper, emitted } = await mountFrame(squareRect(530, 280, 140), null, SMALL)
    const frame = squareFrame(wrapper)

    frame.dispatchEvent(pointerEvent('pointerdown', 1, 100, 300))
    frame.dispatchEvent(pointerEvent('pointerdown', 2, 400, 300))
    for (let x = 401; x <= 440; x++) {
      frame.dispatchEvent(pointerEvent('pointermove', 2, x, 300))
      await nextTick()
    }
    frame.dispatchEvent(pointerEvent('pointerup', 2, 440, 300))
    frame.dispatchEvent(pointerEvent('pointerup', 1, 100, 300))
    await nextTick()
    const crop = squareCropOf(emitted.at(-1))
    expect(Math.abs((crop?.width ?? 0) - 140 * (300 / 340))).toBeLessThanOrEqual(1)
    wrapper.unmount()
  })

  it('adds up small wheel steps instead of dropping them', async () => {
    const { wrapper, emitted } = await mountFrame(squareRect(500, 262, 175), null, SMALL)
    const frame = squareFrame(wrapper)

    for (let i = 0; i < 50; i++) {
      frame.dispatchEvent(wheel(-1, 300, 300, PINCH))
      await nextTick()
    }
    const crop = squareCropOf(emitted.at(-1))
    expect(Math.abs((crop?.width ?? 0) - 175 / Math.exp(0.1))).toBeLessThanOrEqual(1)
    wrapper.unmount()
  })

  it('adds up small wheel steps on a wide tile whose crop does not round back to the same pixels', async () => {
    const { wrapper, emitted } = await mountFrame(null)
    const frame = sizedFrame(wrapper, 640, 360)

    for (let i = 0; i < 400; i++) {
      frame.dispatchEvent(wheel(-0.25, 320, 180, PINCH))
      await nextTick()
    }
    const crop = cropOf(emitted.at(-1))
    expect(Math.abs((crop?.width ?? 0) - 1600 / Math.exp(0.2))).toBeLessThanOrEqual(2)
    wrapper.unmount()
  })

  it('adds up small wheel steps on a 3:2 tile and keeps the point under the pointer in place', async () => {
    const image = { ratio: '3:2', width: 1200, height: 700 }
    const { wrapper, emitted } = await mountFrame(null, null, image)
    const frame = sizedFrame(wrapper, 600, 400)

    for (let i = 0; i < 400; i++) {
      frame.dispatchEvent(wheel(-0.25, 150, 100, PINCH))
      await nextTick()
    }
    const last = emitted.at(-1)
    const crop = last ? cropForRatio({ focus: null, crops: { '3:2': last } }, '3:2', image.width, image.height) : null
    const width = 1050 / Math.exp(0.2)
    expect(Math.abs((crop?.width ?? 0) - width)).toBeLessThanOrEqual(2)
    expect(Math.abs((crop?.left ?? 0) - (75 + 0.25 * 1050 - 0.25 * width))).toBeLessThanOrEqual(2)
    expect(Math.abs((crop?.top ?? 0) - (0.25 * 700 - 0.25 * width * (2 / 3)))).toBeLessThanOrEqual(2)
    wrapper.unmount()
  })

  describe('wheel speeds', () => {
    async function wheelOnce(init: WheelEventInit & { deltaY?: number }) {
      const { wrapper, emitted } = await mountFrame(null)
      const frame = sizedFrame(wrapper, 320, 180)
      frame.dispatchEvent(wheel(init.deltaY ?? 0, 160, 90, init))
      await nextTick()
      const width = cropOf(emitted.at(-1))?.width ?? 0
      wrapper.unmount()
      return width
    }

    it('zooms finely with the plain wheel', async () => {
      expect(Math.abs((await wheelOnce({ deltaY: -100 })) - 1600 / Math.exp(0.08))).toBeLessThanOrEqual(2)
    })

    it('zooms in large steps with Shift, also from a horizontal delta', async () => {
      const coarse = 1600 / Math.exp(0.22)
      expect(Math.abs((await wheelOnce({ deltaY: -100, shiftKey: true })) - coarse)).toBeLessThanOrEqual(2)
      expect(Math.abs((await wheelOnce({ deltaY: 0, deltaX: -100, shiftKey: true })) - coarse)).toBeLessThanOrEqual(2)
    })

    it('keeps the pinch speed of a wheel with Ctrl', async () => {
      expect(Math.abs((await wheelOnce({ deltaY: -100, ctrlKey: true })) - 1600 / Math.exp(0.2))).toBeLessThanOrEqual(2)
    })

    it('adds up small steps of the fine wheel instead of dropping them', async () => {
      const { wrapper, emitted } = await mountFrame(squareRect(500, 262, 175), null, SMALL)
      const frame = squareFrame(wrapper)

      for (let i = 0; i < 100; i++) {
        frame.dispatchEvent(wheel(-1, 300, 300))
        await nextTick()
      }
      expect(Math.abs((squareCropOf(emitted.at(-1))?.width ?? 0) - 175 / Math.exp(0.08))).toBeLessThanOrEqual(1)
      wrapper.unmount()
    })
  })

  describe('trackpad gestures', () => {
    function gesture(type: string, scale: number, clientX = 160, clientY = 90): Event {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, { scale: { value: scale }, clientX: { value: clientX }, clientY: { value: clientY }, altKey: { value: false } })
      return event
    }

    it('zooms with a pinch that the browser reports as gesture events, around the point under the fingers', async () => {
      const { wrapper, emitted } = await mountFrame(null)
      const frame = sizedFrame(wrapper, 320, 180)

      const start = gesture('gesturestart', 1)
      frame.dispatchEvent(start)
      frame.dispatchEvent(gesture('gesturechange', 1.5))
      const change = gesture('gesturechange', 2)
      frame.dispatchEvent(change)
      frame.dispatchEvent(gesture('gestureend', 2))
      await nextTick()

      expect(start.defaultPrevented).toBe(true)
      expect(change.defaultPrevented).toBe(true)
      const crop = cropOf(emitted.at(-1))
      expect(Math.abs((crop?.width ?? 0) - 800)).toBeLessThanOrEqual(2)
      expect(Math.abs((crop?.left ?? 0) - 400)).toBeLessThanOrEqual(2)
      wrapper.unmount()
    })

    it('leaves a pinch to the pointers while fingers are down on the frame', async () => {
      const { wrapper, emitted } = await mountFrame(null)
      const frame = sizedFrame(wrapper, 320, 180)

      frame.dispatchEvent(pointerEvent('pointerdown', 1, 150, 90))
      frame.dispatchEvent(gesture('gesturestart', 1))
      frame.dispatchEvent(gesture('gesturechange', 2))
      frame.dispatchEvent(gesture('gestureend', 2))
      frame.dispatchEvent(pointerEvent('pointerup', 1, 150, 90))
      await nextTick()

      expect(emitted).toEqual([])
      wrapper.unmount()
    })
  })

  describe('focus outline', () => {
    it('outlines the focus over the crop, kept from assistive technology', async () => {
      const { wrapper } = await mountFrame({ x: 0.25, y: 0.3125, w: 0.5, h: 0.375 }, { x: 0.25, y: 0.3125, w: 0.25, h: 0.1875 })

      const outline = wrapper.get('.ui-crop-frame__focus')
      expect(outline.attributes('aria-hidden')).toBe('true')
      const style = outline.attributes('style') ?? ''
      for (const part of ['left: 0%', 'top: 0%', 'width: 50%', 'height: 50%']) expect(style).toContain(part)
      wrapper.unmount()
    })

    it('draws a point focus as a ring and nothing without a focus', async () => {
      const point = await mountFrame({ x: 0.25, y: 0.3125, w: 0.5, h: 0.375 }, { x: 0.5, y: 0.5, w: 0, h: 0 })
      expect(point.wrapper.get('.ui-crop-frame__focus').classes()).toContain('ui-crop-frame__focus--point')
      point.wrapper.unmount()

      const none = await mountFrame(null)
      expect(none.wrapper.find('.ui-crop-frame__focus').exists()).toBe(false)
      none.wrapper.unmount()
    })
  })

  describe('snapping to the guides', () => {
    const OFF_CENTRE = { x: 0.25625, y: 0.3125, w: 0.5, h: 0.375 }
    const guideLines = (wrapper: Awaited<ReturnType<typeof mountFrame>>['wrapper']) => wrapper.findAll('.ui-crop-guides__line').map((line) => ({ axis: line.attributes('data-axis'), style: line.attributes('style') }))

    async function drag(frame: Element, dx: number, altKey = false): Promise<void> {
      frame.dispatchEvent(pointerEvent('pointerdown', 1, 160, 90, altKey))
      frame.dispatchEvent(pointerEvent('pointermove', 1, 160 + dx, 90, altKey))
      await nextTick()
    }

    function labels(wrapper: Awaited<ReturnType<typeof mountFrame>>['wrapper']): Record<string, string> {
      const out: Record<string, string> = {}
      for (const line of wrapper.findAll('.ui-crop-guides__line')) out[line.attributes('data-axis') ?? ''] = line.get('.ui-crop-guides__label').text()
      return out
    }
    const announced = (wrapper: Awaited<ReturnType<typeof mountFrame>>['wrapper']) => wrapper.get('.ui-crop-frame__snapped').text().replaceAll('\u200B', '')

    it('labels the guide it snapped to: image centre, focus centre, focus on a third', async () => {
      const image = await mountFrame(OFF_CENTRE)
      await drag(sizedFrame(image.wrapper, 320, 180), 2)
      expect(labels(image.wrapper).x).toBe(en['cropFrame.snap.image'])
      image.wrapper.unmount()

      const centre = await mountFrame({ x: 0.08125, y: 0.3125, w: 0.5, h: 0.375 }, { x: 0.3, y: 0.45, w: 0.05, h: 0.1 })
      await drag(sizedFrame(centre.wrapper, 320, 180), 2)
      expect(cropOf(centre.emitted.at(-1))?.left).toBe(120)
      expect(labels(centre.wrapper)).toEqual({ x: en['cropFrame.snap.focus'], y: en['cropFrame.snap.image'] })
      centre.wrapper.unmount()

      const third = await mountFrame({ x: 0.225, y: 0.3125, w: 0.5, h: 0.375 }, { x: 0.35, y: 0.45, w: 0.05, h: 0.1 })
      await drag(sizedFrame(third.wrapper, 320, 180), 8)
      expect(labels(third.wrapper).x).toBe(en['cropFrame.snap.focusThird'])
      third.wrapper.unmount()
    })

    it('shows no label without snapping', async () => {
      const alt = await mountFrame(OFF_CENTRE)
      await drag(sizedFrame(alt.wrapper, 320, 180), 2, true)
      expect(alt.wrapper.findAll('.ui-crop-guides__label')).toEqual([])
      alt.wrapper.unmount()

      const off = await mountFrame(OFF_CENTRE, null, undefined, false)
      await drag(sizedFrame(off.wrapper, 320, 180), 2)
      expect(off.wrapper.findAll('.ui-crop-guides__label')).toEqual([])
      off.wrapper.unmount()

      const keys = await mountFrame({ x: 0.25625, y: 0.3125, w: 0.5, h: 0.375 })
      sizedFrame(keys.wrapper, 320, 180)
      await keys.wrapper.get('.ui-crop-frame__frame').trigger('keydown', { key: 'ArrowLeft' })
      expect(keys.wrapper.findAll('.ui-crop-guides__label')).toEqual([])
      expect(announced(keys.wrapper)).toBe('')
      keys.wrapper.unmount()
    })

    it('announces the snapped guide once when the drag ends and clears it afterwards', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const { wrapper } = await mountFrame(OFF_CENTRE)
        const frame = sizedFrame(wrapper, 320, 180)
        const live = () => wrapper.get('.ui-crop-frame__snapped')
        const message = en['cropFrame.snapped'].replace('{guides}', en['cropFrame.snap.image'])

        expect(live().attributes('role')).toBe('status')
        expect(live().classes()).toContain('ui-live-status')
        await drag(frame, 2)
        frame.dispatchEvent(pointerEvent('pointermove', 1, 163, 90))
        await nextTick()
        vi.advanceTimersByTime(2000)
        await nextTick()
        expect(announced(wrapper)).toBe('')
        frame.dispatchEvent(pointerEvent('pointerup', 1, 163, 90))
        await nextTick()
        vi.advanceTimersByTime(1000)
        await nextTick()
        expect(announced(wrapper)).toBe(message)
        vi.advanceTimersByTime(3000)
        await nextTick()
        expect(announced(wrapper)).toBe('')

        await drag(frame, 30)
        frame.dispatchEvent(pointerEvent('pointerup', 1, 190, 90))
        await nextTick()
        vi.advanceTimersByTime(1000)
        await nextTick()
        expect(announced(wrapper)).toBe(message)
        wrapper.unmount()
      } finally {
        vi.useRealTimers()
      }
    })

    it('snaps the middle of the image to the middle of the frame within 8 screen pixels and highlights the guide while dragging', async () => {
      const { wrapper, emitted } = await mountFrame(OFF_CENTRE)
      const frame = sizedFrame(wrapper, 320, 180)

      await drag(frame, 2)
      expect(cropOf(emitted.at(-1))?.left).toBe(400)
      expect(guideLines(wrapper)).toContainEqual({ axis: 'x', style: 'left: 50%;' })

      frame.dispatchEvent(pointerEvent('pointerup', 1, 162, 90))
      await nextTick()
      expect(guideLines(wrapper)).toEqual([])
      wrapper.unmount()
    })

    it('does not snap beyond 8 screen pixels', async () => {
      const { wrapper, emitted } = await mountFrame(OFF_CENTRE)
      const frame = sizedFrame(wrapper, 320, 180)

      await drag(frame, -6)
      expect(cropOf(emitted.at(-1))?.left).toBe(425)
      expect(guideLines(wrapper).filter((line) => line.axis === 'x')).toEqual([])
      wrapper.unmount()
    })

    it('places the crop freely while Alt is held', async () => {
      const { wrapper, emitted } = await mountFrame(OFF_CENTRE)
      const frame = sizedFrame(wrapper, 320, 180)

      await drag(frame, 2, true)
      expect(cropOf(emitted.at(-1))?.left).toBe(405)
      expect(guideLines(wrapper)).toEqual([])
      wrapper.unmount()
    })

    it('places the crop freely when snapping is switched off', async () => {
      const { wrapper, emitted } = await mountFrame(OFF_CENTRE, null, undefined, false)
      const frame = sizedFrame(wrapper, 320, 180)

      await drag(frame, 2)
      expect(cropOf(emitted.at(-1))?.left).toBe(405)
      expect(guideLines(wrapper)).toEqual([])
      expect(helpPanel(wrapper).text()).not.toContain('Alt')
      wrapper.unmount()
    })

    it('tells how to place the crop freely while snapping is on', async () => {
      const { wrapper } = await mountFrame(null)

      expect(helpPanel(wrapper).text()).toContain('Alt')
      wrapper.unmount()
    })

    it('tells which gestures snap to which guides and that the keyboard, the slider and the number fields stay exact', async () => {
      const { wrapper } = await mountFrame(null)

      const help = helpPanel(wrapper).text()
      expect(help).toContain('Dragging, pinching with two fingers and the wheel snap the middle of the image to the middle of the frame')
      expect(help).toContain('the centre of the focus to the middle and the thirds of the frame')
      expect(help).toContain('the keyboard, the slider and the number fields stay exact')
      wrapper.unmount()
    })

    it('snaps the centre of the focus to a third of the frame', async () => {
      const focus = { x: 0.35, y: 0.45, w: 0.05, h: 0.1 }
      const { wrapper, emitted } = await mountFrame({ x: 0.225, y: 0.3125, w: 0.5, h: 0.375 }, focus)
      const frame = sizedFrame(wrapper, 320, 180)

      await drag(frame, 8)
      expect(cropOf(emitted.at(-1))?.left).toBe(333)
      expect(guideLines(wrapper)).toContainEqual({ axis: 'x', style: 'left: 33.333%;' })
      wrapper.unmount()
    })

    it('snaps while zooming with the wheel, and not with Alt held', async () => {
      const snapped = await mountFrame(OFF_CENTRE)
      sizedFrame(snapped.wrapper, 320, 180).dispatchEvent(wheel(-1, 160, 90, PINCH))
      await nextTick()
      const crop = cropOf(snapped.emitted.at(-1))
      expect(Math.abs((crop?.left ?? 0) + (crop?.width ?? 0) / 2 - 800)).toBeLessThanOrEqual(1)
      snapped.wrapper.unmount()

      const free = await mountFrame(OFF_CENTRE)
      const event = wheel(-1, 160, 90, { ...PINCH, altKey: true })
      sizedFrame(free.wrapper, 320, 180).dispatchEvent(event)
      await nextTick()
      const freeCrop = cropOf(free.emitted.at(-1))
      expect(Math.abs((freeCrop?.left ?? 0) + (freeCrop?.width ?? 0) / 2 - 810)).toBeLessThanOrEqual(1)
      free.wrapper.unmount()
    })

    function altWheel(deltaY: number): WheelEvent {
      return wheel(deltaY, 160, 90, { ...PINCH, altKey: true })
    }

    function centreX(rect: MediaRect | undefined): number {
      const crop = cropOf(rect)
      return (crop?.left ?? 0) + (crop?.width ?? 0) / 2
    }

    it('zooms with Alt held around the snapped crop a drag left behind', async () => {
      const { wrapper, emitted } = await mountFrame(OFF_CENTRE)
      const frame = sizedFrame(wrapper, 320, 180)

      frame.dispatchEvent(pointerEvent('pointerdown', 1, 160, 90))
      frame.dispatchEvent(pointerEvent('pointermove', 1, 171, 90))
      frame.dispatchEvent(pointerEvent('pointerup', 1, 171, 90))
      await nextTick()
      expect(cropOf(emitted.at(-1))?.left).toBe(400)

      frame.dispatchEvent(altWheel(-0.5))
      await nextTick()
      expect(Math.abs(centreX(emitted.at(-1)) - 800)).toBeLessThanOrEqual(1)
      frame.dispatchEvent(altWheel(-100))
      await nextTick()
      expect(Math.abs(centreX(emitted.at(-1)) - 800)).toBeLessThanOrEqual(1)
      wrapper.unmount()
    })

    it('zooms around the snapped crop a drag left behind once snapping is switched off', async () => {
      const { wrapper, emitted } = await mountFrame(OFF_CENTRE)
      const frame = sizedFrame(wrapper, 320, 180)

      frame.dispatchEvent(pointerEvent('pointerdown', 1, 160, 90))
      frame.dispatchEvent(pointerEvent('pointermove', 1, 171, 90))
      frame.dispatchEvent(pointerEvent('pointerup', 1, 171, 90))
      await nextTick()
      await wrapper.setProps({ snap: false })

      frame.dispatchEvent(wheel(-0.5, 160, 90, PINCH))
      await nextTick()
      expect(Math.abs(centreX(emitted.at(-1)) - 800)).toBeLessThanOrEqual(1)
      wrapper.unmount()
    })

    it('zooms with Alt held around the crop a snapping wheel step just showed', async () => {
      const { wrapper, emitted } = await mountFrame(OFF_CENTRE)
      const frame = sizedFrame(wrapper, 320, 180)

      frame.dispatchEvent(wheel(-1, 160, 90, PINCH))
      await nextTick()
      expect(Math.abs(centreX(emitted.at(-1)) - 800)).toBeLessThanOrEqual(1)

      frame.dispatchEvent(altWheel(-0.5))
      await nextTick()
      expect(Math.abs(centreX(emitted.at(-1)) - 800)).toBeLessThanOrEqual(1)
      wrapper.unmount()
    })

    it('keeps the guides and the held position of a drag that starts while a snapped wheel step still shows its guides', async () => {
      async function wheelThenDrag(waitForWheelGuides: boolean) {
        const { wrapper, emitted } = await mountFrame(OFF_CENTRE)
        const frame = sizedFrame(wrapper, 320, 180)
        frame.dispatchEvent(wheel(-1, 160, 90, PINCH))
        await nextTick()
        frame.dispatchEvent(pointerEvent('pointerdown', 1, 160, 90))
        frame.dispatchEvent(pointerEvent('pointermove', 1, 157, 90))
        await nextTick()
        if (waitForWheelGuides) vi.advanceTimersByTime(700)
        await nextTick()
        const held = guideLines(wrapper)
        frame.dispatchEvent(pointerEvent('pointermove', 1, 151, 90))
        await nextTick()
        const centre = centreX(emitted.at(-1))
        wrapper.unmount()
        return { held, centre }
      }

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const steady = await wheelThenDrag(false)
        const waited = await wheelThenDrag(true)
        expect(steady.held).toContainEqual({ axis: 'x', style: 'left: 50%;' })
        expect(waited.held).toEqual(steady.held)
        expect(steady.centre).toBeGreaterThan(810)
        expect(waited.centre).toBe(steady.centre)
      }
      finally {
        vi.useRealTimers()
      }
    })

    it('keeps the guides of a drag when the wheel turns during it', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const { wrapper } = await mountFrame(OFF_CENTRE)
        const frame = sizedFrame(wrapper, 320, 180)
        frame.dispatchEvent(pointerEvent('pointerdown', 1, 160, 90))
        frame.dispatchEvent(pointerEvent('pointermove', 1, 162, 90))
        frame.dispatchEvent(wheel(-1, 160, 90, PINCH))
        await nextTick()
        vi.advanceTimersByTime(700)
        await nextTick()
        expect(guideLines(wrapper)).toContainEqual({ axis: 'x', style: 'left: 50%;' })

        frame.dispatchEvent(pointerEvent('pointerup', 1, 162, 90))
        await nextTick()
        expect(guideLines(wrapper)).toEqual([])
        wrapper.unmount()
      }
      finally {
        vi.useRealTimers()
      }
    })

    it('hides the guides of a snapped wheel step as soon as a drag starts, before it moves', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const { wrapper } = await mountFrame(OFF_CENTRE)
        const frame = sizedFrame(wrapper, 320, 180)
        frame.dispatchEvent(wheel(-1, 160, 90, PINCH))
        await nextTick()
        expect(guideLines(wrapper)).toContainEqual({ axis: 'x', style: 'left: 50%;' })

        frame.dispatchEvent(pointerEvent('pointerdown', 1, 160, 90))
        await nextTick()
        expect(guideLines(wrapper)).toEqual([])
        vi.advanceTimersByTime(700)
        await nextTick()
        expect(guideLines(wrapper)).toEqual([])

        frame.dispatchEvent(pointerEvent('pointerup', 1, 160, 90))
        wrapper.unmount()
      }
      finally {
        vi.useRealTimers()
      }
    })

    it.each([
      { name: '16:9 on 1600 x 1200', image: { ratio: '16:9', width: 1600, height: 1200 }, frame: { width: 320, height: 180 }, move: { dx: 0, dy: -30 }, axis: 'x' },
      { name: '16:9 on 1366 x 768, one pixel narrower after rounding', image: { ratio: '16:9', width: 1366, height: 768 }, frame: { width: 320, height: 180 }, move: { dx: 0, dy: -30 }, axis: 'x' },
      { name: '4:5 on 1080 x 1351, one pixel lower after rounding', image: { ratio: '4:5', width: 1080, height: 1351 }, frame: { width: 144, height: 180 }, move: { dx: -30, dy: 0 }, axis: 'y' },
      { name: '16:9 on 1367 x 768, two pixels narrower after rounding', image: { ratio: '16:9', width: 1367, height: 768 }, frame: { width: 320, height: 180 }, move: { dx: 0, dy: -30 }, axis: 'x' },
      { name: '4:5 on 1080 x 1352, two pixels lower', image: { ratio: '4:5', width: 1080, height: 1352 }, frame: { width: 144, height: 180 }, move: { dx: -30, dy: 0 }, axis: 'y' },
    ])('draws no guide on an axis that leaves the crop at most two pixels of room, however it is dragged: $name', async ({ image, frame: { width: frameWidth, height: frameHeight }, move: { dx, dy }, axis }) => {
      const { wrapper } = await mountFrame(null, null, image)
      const frame = sizedFrame(wrapper, frameWidth, frameHeight)
      const [x, y] = [frameWidth / 2, frameHeight / 2]

      frame.dispatchEvent(pointerEvent('pointerdown', 1, x, y))
      frame.dispatchEvent(pointerEvent('pointermove', 1, x + dx, y + dy))
      await nextTick()
      expect(guideLines(wrapper).filter((line) => line.axis === axis)).toEqual([])
      frame.dispatchEvent(pointerEvent('pointerup', 1, x + dx, y + dy))
      wrapper.unmount()
    })

    it('snaps while pinching', async () => {
      const { wrapper, emitted } = await mountFrame(OFF_CENTRE)
      const frame = sizedFrame(wrapper, 320, 180)

      frame.dispatchEvent(pointerEvent('pointerdown', 1, 100, 90))
      frame.dispatchEvent(pointerEvent('pointerdown', 2, 220, 90))
      frame.dispatchEvent(pointerEvent('pointermove', 2, 222, 90))
      frame.dispatchEvent(pointerEvent('pointermove', 1, 98, 90))
      await nextTick()
      const crop = cropOf(emitted.at(-1))
      expect(crop?.width).toBeLessThan(800)
      expect(Math.abs((crop?.left ?? 0) + (crop?.width ?? 0) / 2 - 800)).toBeLessThanOrEqual(1)
      wrapper.unmount()
    })

    it('keeps the arrow keys, the slider and the number fields exact', async () => {
      const { wrapper, emitted } = await mountFrame(OFF_CENTRE)
      sizedFrame(wrapper, 320, 180)

      await wrapper.get('.ui-crop-frame__frame').trigger('keydown', { key: 'ArrowLeft' })
      expect(cropOf(emitted.at(-1))?.left).toBe(394)
      await wrapper.get('input[data-field="x"]').setValue('25.5')
      expect(cropOf(emitted.at(-1))?.left).toBe(408)
      await wrapper.get('input[type="range"]').setValue('2.05')
      const crop = cropOf(emitted.at(-1))
      expect(crop?.width).toBeLessThan(800)
      expect(Math.abs((crop?.left ?? 0) + (crop?.width ?? 0) / 2 - 808)).toBeLessThanOrEqual(1)
      expect(guideLines(wrapper)).toEqual([])
      wrapper.unmount()
    })
  })
})
