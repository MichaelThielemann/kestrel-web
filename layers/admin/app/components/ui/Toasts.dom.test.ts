import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
