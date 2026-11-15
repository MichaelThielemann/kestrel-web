import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import InfoToggle from './InfoToggle.vue'

async function mountToggle(open = false) {
  const wrapper = await mountSuspended(InfoToggle, {
    attachTo: document.body,
    props: { label: 'Help', open, 'onUpdate:open': (value: boolean) => { void wrapper.setProps({ open: value }) } },
    slots: { head: () => h('h3', 'Focus for all ratios'), default: () => h('p', 'Drag across the image.') },
  })
  return wrapper
}

describe('KestrelUiInfoToggle', () => {
  it('keeps its panel in the page but hidden, behind a named button that says what it controls', async () => {
    const wrapper = await mountToggle()

    const button = wrapper.get('button')
    expect(button.attributes('aria-label')).toBe('Help')
    expect(button.attributes('aria-expanded')).toBe('false')
    const panel = document.getElementById(button.attributes('aria-controls') ?? '')
    expect(panel?.textContent).toBe('Drag across the image.')
    expect(panel?.hidden).toBe(true)
    expect(wrapper.get('.ui-info-toggle__head').text()).toContain('Focus for all ratios')
    wrapper.unmount()
  })

  it('opens and closes the panel with the button', async () => {
    const wrapper = await mountToggle()

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:open')).toEqual([[true]])
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
    expect(document.getElementById(wrapper.get('button').attributes('aria-controls') ?? '')?.hidden).toBe(false)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:open')).toEqual([[true], [false]])
    wrapper.unmount()
  })
})
