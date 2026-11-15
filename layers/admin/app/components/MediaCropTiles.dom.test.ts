import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { MediaFramingRatio } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import { tileId } from '../utils/media-crop'
import MediaCropTiles from './MediaCropTiles.vue'

const RATIOS: MediaFramingRatio[] = [
  { key: '3:2', sizes: ['hero-wide', 'teaser'], manual: false, fits: true, crop: null },
  { key: '1:1', sizes: ['thumb'], manual: false, fits: true, crop: null },
  { key: '16:9', sizes: ['banner'], manual: false, fits: true, crop: null },
]

async function mountTiles(selected = '3:2', over: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(MediaCropTiles, {
    attachTo: document.body,
    props: {
      'idPrefix': 'crop',
      'src': '/media/one/original.jpg',
      'draft': { focus: null, crops: {} },
      'ratios': RATIOS,
      'usages': { '3:2': ['Hero', 'Teaser-Karte'], '16:9': ['Page banner with a very long name that has to wrap'] },
      'width': 1200,
      'height': 800,
      'selected': selected,
      'onUpdate:selected': (key: string) => wrapper.setProps({ selected: key }),
      ...over,
    },
  })
  return wrapper
}

const tab = (wrapper: Awaited<ReturnType<typeof mountTiles>>, key: string) => wrapper.get(`#crop-tab-${tileId(key)}`)

describe('MediaCropTiles', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('labels the focus tile and every ratio tile with the uses of its sizes', async () => {
    const wrapper = await mountTiles()

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map((t) => t.attributes('id'))).toEqual(['crop-tab-focus', 'crop-tab-ratio-3x2', 'crop-tab-ratio-1x1', 'crop-tab-ratio-16x9'])
    expect(tabs[0]?.text().replace(/\s+/g, ' ')).toBe(`${en['mediaCrop.focusTile']} ${en['mediaCrop.focusScope']} ${en['mediaCrop.focusShort.none']}`)
    expect(tab(wrapper, '3:2').get('.media-crop-tiles__key').text()).toBe('3:2')
    expect(tab(wrapper, '3:2').get('[data-test="crop-uses"]').text()).toBe('Hero, Teaser-Karte')
    expect(tab(wrapper, '3:2').text().replace(/\s+/g, ' ')).toBe(`3:2 Hero, Teaser-Karte ${en['mediaCrop.auto']}`)
    expect(wrapper.get('[role="tablist"]').attributes('aria-orientation')).toBe('vertical')
    expect(wrapper.findAll('.media-crop-preview').every((preview) => preview.attributes('aria-hidden') === 'true')).toBe(true)
    wrapper.unmount()
  })

  it('falls back to the size names for a ratio without known uses', async () => {
    const wrapper = await mountTiles('1:1')

    expect(tab(wrapper, '1:1').get('[data-test="crop-uses"]').text()).toBe('thumb')
    wrapper.unmount()
  })

  it('shows a long use in full', async () => {
    const wrapper = await mountTiles()

    expect(tab(wrapper, '16:9').get('[data-test="crop-uses"]').text()).toBe('Page banner with a very long name that has to wrap')
    wrapper.unmount()
  })

  it('marks each tile the focus misses and tells the focus tile how many', async () => {
    const wrapper = await mountTiles('focus', { draft: { focus: { x: 0, y: 0.1, w: 1, h: 0.2 }, crops: {} }, misses: { '3:2': null, '1:1': 'wide', '16:9': 'tall' } })

    expect(tab(wrapper, '1:1').get('[data-test="crop-tile-warning"]').text()).toBe(en['mediaCrop.miss.wide'])
    expect(tab(wrapper, '16:9').get('[data-test="crop-tile-warning"]').text()).toBe(en['mediaCrop.miss.tall'])
    expect(tab(wrapper, '3:2').find('[data-test="crop-tile-warning"]').exists()).toBe(false)
    expect(tab(wrapper, 'focus').get('[data-test="crop-tile-warning"]').text()).toBe(en['mediaCrop.missCount'].replace('{n}', '2').replace('{total}', '3'))
    expect(tab(wrapper, 'focus').find('[data-test="crop-preview-focus"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('scrolls the chosen tile into view when it changes', async () => {
    const scrolled: string[] = []
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: HTMLElement) {
        scrolled.push(this.id)
      },
    })
    const wrapper = await mountTiles('16:9')
    expect(scrolled).toEqual(['crop-tab-ratio-16x9'])

    await tab(wrapper, '1:1').trigger('click')
    await nextTick()
    expect(scrolled).toEqual(['crop-tab-ratio-16x9', 'crop-tab-ratio-1x1'])
    expect(tab(wrapper, '1:1').attributes('aria-selected')).toBe('true')
    wrapper.unmount()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  })
})
