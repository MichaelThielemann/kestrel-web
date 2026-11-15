import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { en } from '#kestrel-admin/i18n/en'
import MediaCropFocus from './MediaCropFocus.vue'

async function mountFocus(over: Record<string, unknown> = {}) {
  return mountSuspended(MediaCropFocus, {
    attachTo: document.body,
    props: {
      src: '/media/one/original.jpg',
      alt: 'A harbour at dusk',
      draft: { focus: { x: 0.4, y: 0.05, w: 0.1, h: 0.9 }, crops: {} },
      ...over,
    },
  })
}

describe('MediaCropFocus', () => {
  it('shows the advice in the status block after the fields and inserts nothing before the canvas', async () => {
    const wrapper = await mountFocus({ misses: { '3:2': null } })
    const children = () => Array.from(wrapper.get('.ui-rect-select').element.children).map((child) => child.className)
    const before = children()
    const aside = wrapper.get('.ui-rect-select__aside').element
    const statusBefore = aside.lastElementChild

    await wrapper.setProps({ misses: { '3:2': null, '16:7': 'tall' } })
    expect(children()).toEqual(before)
    expect(before[0]).toBe('ui-rect-select__stage')
    expect(aside.lastElementChild).toBe(statusBefore)
    expect(statusBefore?.getAttribute('data-test')).toBe('crop-status')
    expect(statusBefore?.querySelector('[data-test="crop-advice"]')?.getAttribute('data-miss')).toBe('tall')
    wrapper.unmount()
  })

  it('lists in the focus view which ratios the focus misses and why', async () => {
    const wrapper = await mountFocus({ misses: { '16:7': 'tall', '3:2': null, '1:1': 'covered', '7:3': 'tall', '9:16': 'wide' } })

    expect(wrapper.findAll('[data-test="crop-advice"]').map((line) => [line.attributes('data-miss'), line.text()])).toEqual([
      ['tall', en['mediaCrop.missIn.tall'].replace('{keys}', '16:7, 7:3')],
      ['wide', en['mediaCrop.missIn.wide'].replace('{keys}', '9:16')],
      ['covered', en['mediaCrop.missIn.covered'].replace('{keys}', '1:1')],
    ])
    expect(wrapper.get('[data-test="crop-focus-state"]').text()).toBe(en['mediaCrop.focusSet'])
    wrapper.unmount()
  })

  it('heads the side column with what the focus is for and offers no snapping', async () => {
    const wrapper = await mountFocus()

    expect(wrapper.get('.ui-rect-select__aside h3').text()).toBe(en['mediaCrop.focusTitle'])
    expect(wrapper.find('[data-test="crop-snap"]').exists()).toBe(false)
    expect(wrapper.get('.ui-info-toggle__panel').text()).toContain(en['mediaCrop.focusIntro'])
    wrapper.unmount()
  })
})
