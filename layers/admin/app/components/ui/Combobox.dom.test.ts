import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { FieldOption } from '../../utils/field-component'
import Combobox from './Combobox.vue'

const home: FieldOption = { value: 'home', label: 'Startseite' }
const about: FieldOption = { value: 'about', label: 'Über uns', hint: 'Entwurf' }
const options: FieldOption[] = [home, { value: 'news', label: 'News' }, about, { value: 'imprint', label: 'Impressum' }]

async function mountOpen(props: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(Combobox, {
    props: { options, selected: [], modelValue: null, ...props },
    attachTo: document.body,
  })
  onTestFinished(() => wrapper.unmount())
  const input = wrapper.get('input')
  await input.trigger('focus')
  await input.trigger('click')
  await vi.waitFor(() => expect(document.body.querySelectorAll('[role="option"]').length).toBeGreaterThan(0))
  return wrapper
}

const items = () => [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]

describe('KestrelUiCombobox hints', () => {
  it('shows the hint as a badge right behind the label of the option', async () => {
    await mountOpen()

    const item = items().find((el) => el.textContent?.includes('Über uns'))
    const badge = item?.querySelector('.ui-badge')
    expect(badge?.textContent).toBe('Entwurf')
    expect(badge?.getAttribute('data-variant')).toBe('muted')
    expect(badge?.previousElementSibling?.textContent).toBe('Über uns')
  })

  it('shows no badge for an option without a hint', async () => {
    await mountOpen()

    const item = items().find((el) => el.textContent?.includes('Startseite'))
    expect(item?.querySelector('.ui-badge')).toBeNull()
    expect(document.body.querySelectorAll('[role="option"] .ui-badge')).toHaveLength(1)
  })

  it('names the option together with its hint for assistive technology', async () => {
    await mountOpen()

    const hinted = items().find((el) => el.textContent?.includes('Über uns'))
    const plain = items().find((el) => el.textContent?.includes('Startseite'))
    expect(hinted?.getAttribute('aria-label')).toBe('Über uns, Entwurf')
    expect(plain?.getAttribute('aria-label')).toBeNull()
  })

  it('shows the hint of the chosen record next to the input and describes the input with it', async () => {
    const wrapper = await mountSuspended(Combobox, {
      props: { options, selected: [about], modelValue: 'about', inputId: 'picker', describedby: 'picker-help' },
    })
    onTestFinished(() => wrapper.unmount())

    const badge = wrapper.get('.ui-combobox__anchor .ui-badge')
    expect(badge.text()).toBe('Entwurf')
    const describedby = wrapper.get('input').attributes('aria-describedby')?.split(' ')
    expect(describedby).toEqual(['picker-help', badge.attributes('id')])
  })

  it('hides the hint of the chosen record while another search term is typed', async () => {
    const wrapper = await mountSuspended(Combobox, {
      props: { options, selected: [about], modelValue: 'about', describedby: 'picker-help' },
    })
    onTestFinished(() => wrapper.unmount())

    await wrapper.get('input').setValue('Imp')

    expect(wrapper.find('.ui-combobox__anchor .ui-badge').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('picker-help')

    await wrapper.get('input').setValue('Über uns')

    expect(wrapper.get('.ui-combobox__anchor .ui-badge').text()).toBe('Entwurf')
  })

  it('shows the hint again after the chosen record is picked again from the list', async () => {
    const wrapper = await mountOpen({ selected: [about], modelValue: 'about' })

    await wrapper.get('input').setValue('Imp')
    expect(wrapper.find('.ui-combobox__anchor .ui-badge').exists()).toBe(false)
    await wrapper.setProps({ options: [about] })
    await vi.waitFor(() => expect(items()).toHaveLength(1))
    items()[0]?.click()

    await vi.waitFor(() => expect(wrapper.get('.ui-combobox__anchor .ui-badge').text()).toBe('Entwurf'))
  })

  it('leaves the input description alone when the chosen record has no hint', async () => {
    const wrapper = await mountSuspended(Combobox, {
      props: { options, selected: [home], modelValue: 'home', describedby: 'picker-help' },
    })
    onTestFinished(() => wrapper.unmount())

    expect(wrapper.find('.ui-combobox__anchor .ui-badge').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('picker-help')
  })

  it('shows the hint on the chips of a multiple selection', async () => {
    const wrapper = await mountSuspended(Combobox, {
      props: { options, selected: [home, about], modelValue: ['home', 'about'], multiple: true },
    })
    onTestFinished(() => wrapper.unmount())

    const chips = wrapper.findAll('.ui-combobox__chip')
    expect(chips[0]?.find('.ui-badge').exists()).toBe(false)
    expect(chips[1]?.get('.ui-badge').text()).toBe('Entwurf')
  })
})
