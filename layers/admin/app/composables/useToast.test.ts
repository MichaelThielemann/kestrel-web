import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createToastStore } from './useToast'

describe('toast store', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('keeps the positional timeout of push and the shorthands', () => {
    const toasts = createToastStore()
    toasts.success('Saved', 1000)
    toasts.push('info', 'Copied', 2000)

    vi.advanceTimersByTime(1000)
    expect(toasts.items.map((t) => t.message)).toEqual(['Copied'])
    vi.advanceTimersByTime(1000)
    expect(toasts.items).toEqual([])
  })

  it('carries an action and runs it once, dismissing the toast', () => {
    const toasts = createToastStore()
    const run = vi.fn()
    const id = toasts.push('success', '3 items moved to the trash', { timeout: 8000, action: { label: 'Undo', run } })

    expect(toasts.items[0]?.action?.label).toBe('Undo')
    toasts.runAction(id)
    toasts.runAction(id)

    expect(run).toHaveBeenCalledTimes(1)
    expect(toasts.items).toEqual([])
  })

  it('pauses the timeout while held and resumes with the remaining time', () => {
    const toasts = createToastStore()
    const id = toasts.push('info', 'Moved', { timeout: 8000 })

    vi.advanceTimersByTime(5000)
    toasts.hold(id, 'hover')
    vi.advanceTimersByTime(20000)
    expect(toasts.items).toHaveLength(1)

    toasts.hold(id, 'focus')
    toasts.release(id, 'hover')
    vi.advanceTimersByTime(20000)
    expect(toasts.items).toHaveLength(1)

    toasts.release(id, 'focus')
    vi.advanceTimersByTime(2999)
    expect(toasts.items).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toasts.items).toEqual([])
  })

  it('clears the pending timer when a toast is dismissed early', () => {
    const toasts = createToastStore()
    const id = toasts.info('Moved', 1000)
    toasts.dismiss(id)

    expect(vi.getTimerCount()).toBe(0)
  })

  it('evicts the oldest toast without an action when over the limit, never an action toast while another can go', () => {
    const toasts = createToastStore({ limit: 2 })
    toasts.push('success', 'Moved', { action: { label: 'Undo', run: () => {} } })
    toasts.info('First')
    toasts.info('Second')

    expect(toasts.items.map((t) => t.message)).toEqual(['Moved', 'Second'])
    expect(vi.getTimerCount()).toBe(2)
  })

  it('evicts the oldest action toast only when every toast carries an action', () => {
    const toasts = createToastStore({ limit: 2 })
    const action = { label: 'Undo', run: () => {} }
    toasts.push('success', 'One', { action })
    toasts.push('success', 'Two', { action })
    toasts.push('success', 'Three', { action })

    expect(toasts.items.map((t) => t.message)).toEqual(['Two', 'Three'])
  })

  it('clears every toast and every timer', () => {
    const toasts = createToastStore()
    toasts.info('One')
    toasts.push('success', 'Two', { timeout: 8000, action: { label: 'Undo', run: () => {} } })
    toasts.clear()

    expect(toasts.items).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
