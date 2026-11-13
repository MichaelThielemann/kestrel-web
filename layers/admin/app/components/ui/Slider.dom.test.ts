import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import Slider from './Slider.vue'

describe('KestrelUiSlider', () => {
  it('labels a native range input and passes its bounds and value text', async () => {
    const wrapper = await mountSuspended(Slider, { props: { label: 'Zoom', min: 1, max: 8, step: 0.01, modelValue: 2, valueText: '200 %' } })

    const input = wrapper.get<HTMLInputElement>('input[type="range"]')
    const label = wrapper.get('label')
    expect(label.text()).toBe('Zoom')
    expect(label.attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('min')).toBe('1')
    expect(input.attributes('max')).toBe('8')
    expect(input.attributes('step')).toBe('0.01')
    expect(input.attributes('aria-valuetext')).toBe('200 %')
    expect(input.element.value).toBe('2')
  })

  it('emits the moved value as a number', async () => {
    const wrapper = await mountSuspended(Slider, { props: { label: 'Zoom', min: 1, max: 8, modelValue: 1 } })

    await wrapper.get('input[type="range"]').setValue('3')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([3])
  })

  it('can keep its label for assistive technology only', async () => {
    const wrapper = await mountSuspended(Slider, { props: { label: 'Zoom', hideLabel: true, modelValue: 1 } })

    expect(wrapper.get('label').classes()).toContain('ui-slider__label--hidden')
  })

  it('puts a layout class and style on its wrapper and every other attribute on the input', async () => {
    const wrapper = await mountSuspended(Slider, {
      props: { label: 'Zoom', modelValue: 1 },
      attrs: { class: 'grow', style: 'order: 2', 'data-field': 'zoom' },
    })

    expect(wrapper.get('.ui-slider').classes()).toContain('grow')
    expect(wrapper.get('.ui-slider').attributes('style')).toContain('order: 2')
    const input = wrapper.get('input[type="range"]')
    expect(input.classes()).not.toContain('grow')
    expect(input.attributes('style')).toBeUndefined()
    expect(input.attributes('data-field')).toBe('zoom')
  })
})
