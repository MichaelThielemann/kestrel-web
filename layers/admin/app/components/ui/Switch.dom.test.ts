import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import Switch from './Switch.vue'

async function mountSwitch(props: { modelValue: boolean, disabled?: boolean }) {
  const wrapper = await mountSuspended(Switch, {
    attachTo: document.body,
    props: { 'label': 'Snap to guides', ...props, 'onUpdate:modelValue': (value: boolean) => wrapper.setProps({ modelValue: value }) },
  })
  return wrapper
}

describe('KestrelUiSwitch', () => {
  it('is a button with the switch role, named by its label, that reports its state', async () => {
    const wrapper = await mountSwitch({ modelValue: true })

    const button = wrapper.get('button')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('role')).toBe('switch')
    expect(button.attributes('aria-checked')).toBe('true')
    expect(button.text()).toBe('Snap to guides')
    expect(wrapper.get('.ui-switch__track').attributes('aria-hidden')).toBe('true')
    wrapper.unmount()
  })

  it('flips its value on click', async () => {
    const wrapper = await mountSwitch({ modelValue: false })

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    expect(wrapper.get('button').attributes('aria-checked')).toBe('true')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true], [false]])
    wrapper.unmount()
  })

  it('cannot be switched while disabled', async () => {
    const wrapper = await mountSwitch({ modelValue: false, disabled: true })

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    wrapper.get<HTMLButtonElement>('button').element.click()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})
