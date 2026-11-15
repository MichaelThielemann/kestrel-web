import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { MediaFramingRatio, MediaRect } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import { CROP_SNAP_KEY } from '../composables/useCropSnapPreference'
import MediaCropRatio from './MediaCropRatio.vue'

const WIDE: MediaFramingRatio = { key: '16:7', sizes: ['banner'], manual: false, fits: true, crop: null }

async function mountRatio(over: Record<string, unknown> = {}) {
  const crops: { key: string, rect: MediaRect | null }[] = []
  const wrapper = await mountSuspended(MediaCropRatio, {
    attachTo: document.body,
    props: {
      src: '/media/one/original.jpg',
      alt: 'A harbour at dusk',
      draft: { focus: null, crops: {} },
      ratio: WIDE,
      uses: ['Banner'],
      sizes: [],
      width: 1200,
      height: 800,
      onCrop: (key: string, rect: MediaRect | null) => { crops.push({ key, rect }) },
      ...over,
    },
  })
  return { wrapper, crops }
}

type Mounted = Awaited<ReturnType<typeof mountRatio>>['wrapper']
const snapSwitch = (wrapper: Mounted) => wrapper.get('[data-test="crop-snap"]')
const aside = (wrapper: Mounted) => wrapper.get('.ui-crop-frame__aside')
const childClasses = (wrapper: Mounted) => Array.from(wrapper.get('.ui-crop-frame').element.children).map((child) => child.className)

describe('MediaCropRatio', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    try {
      localStorage.removeItem(CROP_SNAP_KEY)
    } catch {
      return
    }
  })

  it('heads the side column with the ratio and its uses in full', async () => {
    const { wrapper } = await mountRatio()

    expect(aside(wrapper).get('h3').text()).toBe(en['mediaCrop.ratioTitle'].replace('{key}', '16:7'))
    expect(aside(wrapper).get('[data-test="crop-ratio-uses"]').text()).toBe('Banner')
    wrapper.unmount()
  })

  it('offers snapping as a switch in the side column after the fields, on by default', async () => {
    const { wrapper } = await mountRatio()

    const toggle = snapSwitch(wrapper)
    expect(toggle.attributes('role')).toBe('switch')
    expect(toggle.attributes('aria-checked')).toBe('true')
    expect(toggle.text()).toBe(en['mediaCrop.snap'])
    const order = Array.from(aside(wrapper).element.querySelectorAll('fieldset, [data-test="crop-snap"], [data-test="crop-status"]')).map((node) => node.getAttribute('data-test') ?? node.tagName.toLowerCase())
    expect(order).toEqual(['fieldset', 'crop-snap', 'crop-status'])
    wrapper.unmount()
  })

  it('keeps the state of the crop and the reset in the status block at the end of the side column', async () => {
    const { wrapper } = await mountRatio()

    const status = aside(wrapper).element.lastElementChild
    expect(status?.getAttribute('data-test')).toBe('crop-status')
    expect(status?.querySelector('[data-test="crop-state"]')?.textContent).toBe(en['mediaCrop.auto'])
    expect(status?.querySelector('[data-test="crop-reset"]')?.hasAttribute('disabled')).toBe(true)
    expect(wrapper.findAll('[data-test="crop-reset"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('remembers the switch in the browser across a remount', async () => {
    const first = await mountRatio()
    await snapSwitch(first.wrapper).trigger('click')
    expect(snapSwitch(first.wrapper).attributes('aria-checked')).toBe('false')
    expect(localStorage.getItem(CROP_SNAP_KEY)).toBe('off')
    first.wrapper.unmount()

    const second = await mountRatio()
    expect(snapSwitch(second.wrapper).attributes('aria-checked')).toBe('false')
    await snapSwitch(second.wrapper).trigger('click')
    expect(localStorage.getItem(CROP_SNAP_KEY)).toBe('on')
    second.wrapper.unmount()
  })

  it('keeps the switch across a remount when the browser refuses storage', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const first = await mountRatio()
    await snapSwitch(first.wrapper).trigger('click')
    first.wrapper.unmount()

    const second = await mountRatio()
    expect(snapSwitch(second.wrapper).attributes('aria-checked')).toBe('false')
    await snapSwitch(second.wrapper).trigger('click')
    expect(snapSwitch(second.wrapper).attributes('aria-checked')).toBe('true')
    second.wrapper.unmount()
  })

  it('hands the switch to the crop frame', async () => {
    const { wrapper } = await mountRatio()
    const help = () => wrapper.get('.ui-crop-frame__help').text()

    expect(help()).toContain('Alt')
    await snapSwitch(wrapper).trigger('click')
    expect(help()).not.toContain('Alt')
    await snapSwitch(wrapper).trigger('click')
    wrapper.unmount()
  })

  it('shows the advice in the status block after the fields and inserts nothing before the canvas', async () => {
    const { wrapper } = await mountRatio()
    const before = childClasses(wrapper)
    const lastBefore = aside(wrapper).element.lastElementChild

    await wrapper.setProps({ miss: 'tall', draft: { focus: { x: 0.4, y: 0.05, w: 0.1, h: 0.9 }, crops: {} } })
    expect(childClasses(wrapper)).toEqual(before)
    expect(before[0]).toBe('ui-crop-frame__stage')
    expect(aside(wrapper).element.lastElementChild).toBe(lastBefore)
    expect(lastBefore?.querySelector('[data-test="crop-advice"]')?.getAttribute('data-miss')).toBe('tall')
    wrapper.unmount()
  })

  it('advises a flatter focus when it is taller than the largest crop of the ratio', async () => {
    const { wrapper } = await mountRatio({ miss: 'tall' })

    expect(wrapper.get('[data-test="crop-advice"]').text()).toBe(en['mediaCrop.advice.tall'].replace('{key}', '16:7'))
    wrapper.unmount()
  })

  it('advises a narrower focus when it is wider than the largest crop of the ratio', async () => {
    const { wrapper } = await mountRatio({ miss: 'wide' })

    expect(wrapper.get('[data-test="crop-advice"]').text()).toBe(en['mediaCrop.advice.wide'].replace('{key}', '16:7'))
    wrapper.unmount()
  })

  it('offers the reset right after the advice when a manual crop hides a focus that would fit', async () => {
    const { wrapper, crops } = await mountRatio({ miss: 'covered', draft: { focus: { x: 0.9, y: 0.1, w: 0.05, h: 0.05 }, crops: { '16:7': { x: 0, y: 0.3, w: 0.5, h: 0.328125 } } } })

    const advice = wrapper.get('[data-test="crop-advice"]')
    expect(advice.text()).toBe(en['mediaCrop.advice.covered'])
    const reset = advice.element.nextElementSibling?.querySelector('[data-test="crop-reset"]')
    expect(reset?.hasAttribute('disabled')).toBe(false)
    expect(reset?.textContent?.trim()).toBe(en['mediaCrop.reset'])
    await wrapper.get('[data-test="crop-reset"]').trigger('click')
    expect(crops).toEqual([{ key: '16:7', rect: null }])
    wrapper.unmount()
  })

  it('asks to zoom out when a manual crop is smaller than a size of its ratio', async () => {
    const sizes = [{ name: 'banner', width: 1600, height: 700, fit: 'cover' }]
    const manual = await mountRatio({ sizes, draft: { focus: null, crops: { '16:7': { x: 0, y: 0, w: 0.5, h: 0.328125 } } } })
    expect(manual.wrapper.get('[data-test="crop-smaller"]').text()).toBe(en['mediaCrop.smallerManual'].replace('{sizes}', 'banner'))
    manual.wrapper.unmount()

    const automatic = await mountRatio({ sizes })
    expect(automatic.wrapper.get('[data-test="crop-smaller"]').text()).toBe(en['mediaCrop.smaller'].replace('{sizes}', 'banner'))
    automatic.wrapper.unmount()
  })

  it('announces a changed advice once editing pauses', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { wrapper } = await mountRatio({ miss: 'tall' })
      const spoken = () => wrapper.get('[data-test="crop-status"] [role="status"]').text()

      expect(spoken()).toBe('')
      await wrapper.setProps({ miss: 'wide' })
      vi.advanceTimersByTime(400)
      await wrapper.setProps({ miss: 'covered' })
      vi.advanceTimersByTime(400)
      await nextTick()
      expect(spoken()).toBe('')
      vi.advanceTimersByTime(400)
      await nextTick()
      expect(spoken()).toBe(en['mediaCrop.advice.covered'])
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
