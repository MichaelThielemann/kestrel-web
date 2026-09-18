import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
import Button from './Button.vue'

type Focusable = { focus: (options?: FocusOptions) => void }

function focusable(vm: unknown): Focusable {
  return boundaryCast<Focusable>(vm, 'host')
}

describe('KestrelUiButton', () => {
  it('renders a single root button for the bare variant', async () => {
    const wrapper = await mountSuspended(Button, { props: { variant: 'bare' }, slots: { default: () => 'Go' } })

    expect(wrapper.html()).toMatch(/^<button\b/)
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.classes()).toEqual(['ui-button--bare'])
  })

  it('renders a single root button for the icon variant', async () => {
    const wrapper = await mountSuspended(Button, { props: { variant: 'icon', icon: 'x' } })

    expect(wrapper.html()).toMatch(/^<button\b/)
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.classes()).toEqual(['ui-button--icon'])
  })

  it('renders a link when to is set', async () => {
    const wrapper = await mountSuspended(Button, { props: { variant: 'bare', to: '/admin/media' }, slots: { default: () => 'Media' } })

    expect(wrapper.html()).toMatch(/^<a\b/)
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.get('a').attributes('href')).toBe('/admin/media')
  })

  it('focuses the button branch', async () => {
    const wrapper = await mountSuspended(Button, { props: { variant: 'icon', icon: 'x' }, attachTo: document.body })

    focusable(wrapper.vm).focus()

    expect(document.activeElement).toBe(wrapper.get('button').element)
  })

  it('focuses the link branch', async () => {
    const wrapper = await mountSuspended(Button, { props: { variant: 'bare', to: '/admin/media' }, slots: { default: () => 'Media' }, attachTo: document.body })

    focusable(wrapper.vm).focus()

    expect(document.activeElement).toBe(wrapper.get('a').element)
  })

  it('sizes the icon box only when size is set', async () => {
    const plain = await mountSuspended(Button, { props: { variant: 'icon', icon: 'x' } })
    const large = await mountSuspended(Button, { props: { variant: 'icon', icon: 'x', size: 'lg' } })

    expect(plain.classes()).not.toContain('ui-button--icon-lg')
    expect(large.classes()).toContain('ui-button--icon')
    expect(large.classes()).toContain('ui-button--icon-lg')
  })
})
