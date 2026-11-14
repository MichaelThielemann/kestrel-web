import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
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

  it('shows the kit spinner instead of the icon while loading, and is busy and disabled', async () => {
    const wrapper = await mountSuspended(Button, { props: { loading: true, icon: 'x' }, slots: { default: () => 'Save' } })

    const button = wrapper.get('button')
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.find('.ui-spinner').exists()).toBe(true)
    expect(wrapper.find('svg[data-icon="x"]').exists()).toBe(false)
  })

  describe('disabled state', () => {
    const variants = ['primary', 'secondary', 'ghost', 'danger', 'danger-ghost', 'icon', 'bare'] as const

    it.each(variants)('marks a disabled %s button with the disabled class', async (variant) => {
      const wrapper = await mountSuspended(Button, { props: { variant, disabled: true }, slots: { default: () => 'Go' } })

      expect(wrapper.get('button').classes()).toContain('ui-button--disabled')
      expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    })

    it.each(variants)('marks a disabled %s link with the disabled class, aria-disabled and tabindex -1', async (variant) => {
      const wrapper = await mountSuspended(Button, { props: { variant, to: '/admin/media', disabled: true }, slots: { default: () => 'Go' } })

      const link = wrapper.get('a')
      expect(link.classes()).toContain('ui-button--disabled')
      expect(link.attributes('aria-disabled')).toBe('true')
      expect(link.attributes('tabindex')).toBe('-1')
    })

    function click(el: Element): MouseEvent {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      el.dispatchEvent(event)
      return event
    }

    it('renders a disabled link without a destination and swallows the click', async () => {
      const wrapper = await mountSuspended(Button, { props: { to: '/admin/media', disabled: true }, slots: { default: () => 'Go' }, attachTo: document.body })
      const link = wrapper.get('a')

      expect(link.attributes('href')).toBeUndefined()
      expect(click(link.element).defaultPrevented).toBe(true)
    })

    it('does not run the click handler of the caller on a disabled link', async () => {
      const onClick = vi.fn()
      const wrapper = await mountSuspended(Button, { props: { to: '/admin/media', disabled: true }, attrs: { onClick }, slots: { default: () => 'Go' }, attachTo: document.body })
      const link = wrapper.get('a')

      expect(click(link.element).defaultPrevented).toBe(true)
      expect(onClick).not.toHaveBeenCalled()
    })

    it.each(['onClickOnce', 'onClickPassive', 'onClickCaptureOnce', 'onClickCapture'])('does not run a %s listener of the caller on a disabled link', async (name) => {
      const handler = vi.fn()
      const wrapper = await mountSuspended(Button, { props: { to: '/admin/media', disabled: true }, attrs: { [name]: handler }, slots: { default: () => 'Go' }, attachTo: document.body })

      click(wrapper.get('a').element)

      expect(handler).not.toHaveBeenCalled()
    })

    it('keeps tabindex -1, aria-disabled and the link role of a disabled link whatever the caller passes', async () => {
      const wrapper = await mountSuspended(Button, {
        props: { to: '/admin/media', disabled: true },
        attrs: { tabindex: 0, 'aria-disabled': undefined, role: 'button' },
        slots: { default: () => 'Go' },
      })

      const link = wrapper.get('a')
      expect(link.attributes('tabindex')).toBe('-1')
      expect(link.attributes('aria-disabled')).toBe('true')
      expect(link.attributes('role')).toBe('link')
    })

    it('runs the click handler of the caller on an enabled link and an enabled button', async () => {
      const onClick = vi.fn()
      const link = await mountSuspended(Button, { props: { to: '/admin/media' }, attrs: { onClick }, slots: { default: () => 'Go' }, attachTo: document.body })
      click(link.get('a').element)
      const button = await mountSuspended(Button, { attrs: { onClick }, slots: { default: () => 'Go' }, attachTo: document.body })
      click(button.get('button').element)

      expect(onClick).toHaveBeenCalledTimes(2)
    })

    it('does not mark a loading button that is also disabled as disabled-styled', async () => {
      const wrapper = await mountSuspended(Button, { props: { loading: true, disabled: true }, slots: { default: () => 'Go' } })

      expect(wrapper.get('button').classes()).not.toContain('ui-button--disabled')
      expect(wrapper.get('button').attributes('aria-busy')).toBe('true')
    })

    it('keeps the destination of an enabled link', async () => {
      const wrapper = await mountSuspended(Button, { props: { to: '/admin/media' }, slots: { default: () => 'Go' } })

      expect(wrapper.get('a').attributes('href')).toBe('/admin/media')
    })

    it('leaves an enabled link focusable and free of the disabled class', async () => {
      const wrapper = await mountSuspended(Button, { props: { to: '/admin/media' }, slots: { default: () => 'Go' } })

      expect(wrapper.get('a').attributes('tabindex')).toBeUndefined()
      expect(wrapper.get('a').attributes('aria-disabled')).toBeUndefined()
      expect(wrapper.get('a').classes()).not.toContain('ui-button--disabled')
    })

    it('keeps an enabled button free of the disabled class', async () => {
      const wrapper = await mountSuspended(Button, { props: { variant: 'primary' }, slots: { default: () => 'Go' } })

      expect(wrapper.get('button').classes()).not.toContain('ui-button--disabled')
    })

    it('does not mark a loading button as disabled-styled', async () => {
      const wrapper = await mountSuspended(Button, { props: { loading: true }, slots: { default: () => 'Go' } })

      expect(wrapper.get('button').classes()).not.toContain('ui-button--disabled')
    })
  })
})
