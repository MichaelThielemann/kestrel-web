import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { MediaFramingRatio } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import { CROP_SNAP_KEY } from '../composables/useCropSnapPreference'
import MediaCropTiles from './MediaCropTiles.vue'

const RATIOS: MediaFramingRatio[] = [
  { key: '3:2', sizes: ['hero-wide', 'teaser'], manual: false, fits: true, crop: null },
  { key: '1:1', sizes: ['thumb'], manual: false, fits: true, crop: null },
  { key: '16:9', sizes: ['banner'], manual: false, fits: true, crop: null },
]

async function mountTiles(selected = '3:2') {
  const wrapper = await mountSuspended(MediaCropTiles, {
    attachTo: document.body,
    props: {
      'src': '/media/one/original.jpg',
      'alt': 'A harbour at dusk',
      'draft': { focus: null, crops: {} },
      'ratios': RATIOS,
      'usages': { '3:2': ['Hero', 'Teaser-Karte'], '16:9': ['Page banner with a very long name that has to wrap'] },
      'sizes': [],
      'width': 1200,
      'height': 800,
      'selected': selected,
      'onUpdate:selected': (key: string) => wrapper.setProps({ selected: key }),
    },
  })
  return wrapper
}

const snapSwitch = (wrapper: Awaited<ReturnType<typeof mountTiles>>) => wrapper.get('[data-test="crop-snap"]')

describe('MediaCropTiles', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    try {
      localStorage.removeItem(CROP_SNAP_KEY)
    } catch {
      return
    }
  })

  it('names under each ratio what its sizes are used for', async () => {
    const wrapper = await mountTiles()

    const tile = wrapper.get('[data-key="3:2"]')
    expect(tile.get('.media-crop-tiles__key').text()).toBe('3:2')
    expect(tile.get('[data-test="crop-uses"]').text()).toBe('Hero, Teaser-Karte')
    expect(wrapper.get('.media-crop-tiles__title').text()).toBe('Ratio 3:2 (Hero, Teaser-Karte)')
    wrapper.unmount()
  })

  it('falls back to the size names for a ratio without known uses', async () => {
    const wrapper = await mountTiles('1:1')

    expect(wrapper.get('[data-key="1:1"] [data-test="crop-uses"]').text()).toBe('thumb')
    expect(wrapper.get('.media-crop-tiles__title').text()).toBe('Ratio 1:1 (thumb)')
    wrapper.unmount()
  })

  it('shows a long use in full', async () => {
    const wrapper = await mountTiles()

    expect(wrapper.get('[data-key="16:9"] [data-test="crop-uses"]').text()).toBe('Page banner with a very long name that has to wrap')
    wrapper.unmount()
  })

  it('scrolls the chosen tile into view when it changes', async () => {
    const scrolled: string[] = []
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: HTMLElement) {
        scrolled.push(this.dataset.key ?? '')
      },
    })
    const wrapper = await mountTiles('16:9')
    expect(scrolled).toEqual(['16:9'])

    await wrapper.get('[data-key="1:1"]').trigger('click')
    await nextTick()
    expect(scrolled).toEqual(['16:9', '1:1'])
    expect(wrapper.get('[data-key="1:1"]').attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  })

  it('offers snapping as a switch in the head of the crop, on by default', async () => {
    const wrapper = await mountTiles()

    const toggle = snapSwitch(wrapper)
    expect(toggle.attributes('role')).toBe('switch')
    expect(toggle.attributes('aria-checked')).toBe('true')
    expect(toggle.text()).toBe(en['mediaCrop.snap'])
    expect(wrapper.get('[data-test="crop-detail"] .media-crop-tiles__head').find('[data-test="crop-snap"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('remembers the switch in the browser across a remount', async () => {
    const first = await mountTiles()
    await snapSwitch(first).trigger('click')
    expect(snapSwitch(first).attributes('aria-checked')).toBe('false')
    expect(localStorage.getItem(CROP_SNAP_KEY)).toBe('off')
    first.unmount()

    const second = await mountTiles()
    expect(snapSwitch(second).attributes('aria-checked')).toBe('false')
    await snapSwitch(second).trigger('click')
    expect(localStorage.getItem(CROP_SNAP_KEY)).toBe('on')
    second.unmount()
  })

  it('keeps the switch across a remount when the browser refuses storage', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const first = await mountTiles()
    await snapSwitch(first).trigger('click')
    first.unmount()

    const second = await mountTiles()
    expect(snapSwitch(second).attributes('aria-checked')).toBe('false')
    await snapSwitch(second).trigger('click')
    expect(snapSwitch(second).attributes('aria-checked')).toBe('true')
    second.unmount()
  })

  it('hands the switch to the crop frame', async () => {
    const wrapper = await mountTiles()
    const help = () => wrapper.get('.ui-crop-frame__help').text()

    expect(snapSwitch(wrapper).attributes('aria-checked')).toBe('true')
    expect(help()).toContain('Alt')
    await snapSwitch(wrapper).trigger('click')
    expect(help()).not.toContain('Alt')
    await snapSwitch(wrapper).trigger('click')
    wrapper.unmount()
  })
})
