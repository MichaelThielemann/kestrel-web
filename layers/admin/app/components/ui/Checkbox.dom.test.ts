import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import Checkbox from './Checkbox.vue'

describe('Checkbox', () => {
  it('renders the bare input by default, with the caller attributes on it', async () => {
    const wrapper = await mountSuspended(Checkbox, { props: { modelValue: false }, attrs: { 'aria-label': 'Publish' } })

    expect(wrapper.find('label').exists()).toBe(false)
    expect(wrapper.get('input.ui-checkbox').attributes('aria-label')).toBe('Publish')
    wrapper.unmount()
  })

  it('wraps a standalone checkbox in a label that is the click target and keeps the caller attributes on the input', async () => {
    const wrapper = await mountSuspended(Checkbox, {
      props: { 'modelValue': false, 'standalone': true, 'onUpdate:modelValue': (v: boolean) => wrapper.setProps({ modelValue: v }) },
      attrs: { 'aria-label': 'Select a.jpg', 'tabindex': '-1' },
      attachTo: document.body,
    })

    const target = wrapper.get('label.ui-checkbox-target')
    const input = target.get('input.ui-checkbox')
    expect(input.attributes('aria-label')).toBe('Select a.jpg')
    expect(input.attributes('tabindex')).toBe('-1')
    expect(target.attributes('aria-label')).toBeUndefined()

    await target.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    wrapper.unmount()
  })
})
