import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'
import { useToast } from '../../composables/useToast'
import Toasts from './Toasts.vue'

describe('Toasts', () => {
  afterEach(() => {
    useToast().clear()
    vi.useRealTimers()
  })

  it('renders an info toast with the info variant, in the polite live region', async () => {
    useToast().info('Die Seite wurde gespeichert; die Veröffentlichung läuft noch.')
    const wrapper = await mountSuspended(Toasts, { attachTo: document.body })

    const info = document.body.querySelector('.ui-toast--info')
    expect(info?.textContent).toContain('Die Seite wurde gespeichert; die Veröffentlichung läuft noch.')
    expect(document.body.querySelector('.ui-toast--error')).toBeNull()
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('Die Seite wurde gespeichert')
    wrapper.unmount()
  })

  it('tells the polite live region that a toast carries an action', async () => {
    const wrapper = await mountSuspended(Toasts, { attachTo: document.body })
    useToast().push('success', '2 items moved to the trash', { timeout: 8000, action: { label: 'Undo', run: () => {} } })
    await nextTick()

    expect(document.body.querySelector('.ui-toasts__live[role="status"]')?.textContent?.trim()).toBe('2 items moved to the trash. Undo available in the notifications.')
    wrapper.unmount()
  })

  it('renders the action as a button that runs it and dismisses the toast', async () => {
    const run = vi.fn()
    const wrapper = await mountSuspended(Toasts, { attachTo: document.body })
    useToast().push('success', '2 items moved to the trash', { timeout: 8000, action: { label: 'Undo', run } })
    await nextTick()

    const action = document.body.querySelector<HTMLButtonElement>('.ui-toast__action')
    expect(action?.textContent?.trim()).toBe('Undo')
    expect(action?.tagName).toBe('BUTTON')
    action?.click()
    await nextTick()

    expect(run).toHaveBeenCalledTimes(1)
    expect(useToast().items).toEqual([])
    wrapper.unmount()
  })

  it('hands focus back to where it came from when its action or its close button dismisses the focused toast', async () => {
    const wrapper = await mountSuspended(Toasts, { attachTo: document.body })
    const origin = document.createElement('button')
    document.body.append(origin)
    onTestFinished(() => origin.remove())

    for (const control of ['.ui-toast__action', '.ui-toast__close']) {
      useToast().push('success', 'Moved', { timeout: 8000, action: { label: 'Undo', run: () => {} } })
      await nextTick()
      origin.focus()
      const button = document.body.querySelector<HTMLButtonElement>(control)
      button?.focus()
      expect(document.activeElement).toBe(button)
      button?.click()
      await nextTick()
      expect(document.activeElement).toBe(origin)
    }
    wrapper.unmount()
  })

  it('moves focus to the main region when the element it came from is gone', async () => {
    const wrapper = await mountSuspended(Toasts, { attachTo: document.body })
    const main = document.createElement('main')
    main.tabIndex = -1
    const origin = document.createElement('button')
    document.body.append(main, origin)
    onTestFinished(() => main.remove())

    useToast().push('success', 'Moved', { timeout: 8000, action: { label: 'Undo', run: () => { origin.remove() } } })
    await nextTick()
    origin.focus()
    const action = document.body.querySelector<HTMLButtonElement>('.ui-toast__action')
    action?.focus()
    action?.click()
    await nextTick()

    expect(document.activeElement).toBe(main)
    wrapper.unmount()
  })

  it('keeps a toast open while the pointer rests on it or focus is inside it', async () => {
    vi.useFakeTimers()
    const wrapper = await mountSuspended(Toasts, { attachTo: document.body })
    useToast().push('success', 'Moved', { timeout: 1000, action: { label: 'Undo', run: () => {} } })
    await nextTick()
    const toast = document.body.querySelector<HTMLElement>('.ui-toast')
    if (!toast) throw new Error('expected a toast')

    toast.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(5000)
    expect(useToast().items).toHaveLength(1)

    toast.querySelector<HTMLButtonElement>('.ui-toast__action')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    toast.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(5000)
    expect(useToast().items).toHaveLength(1)

    toast.querySelector<HTMLButtonElement>('.ui-toast__action')?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    vi.advanceTimersByTime(1000)
    expect(useToast().items).toEqual([])
    wrapper.unmount()
  })

  it('drops every toast and its timer when the host unmounts', async () => {
    vi.useFakeTimers()
    const wrapper = await mountSuspended(Toasts, { attachTo: document.body })
    useToast().info('Saved', 4000)
    wrapper.unmount()

    expect(useToast().items).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
