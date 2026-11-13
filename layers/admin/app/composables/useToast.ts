import { reactive } from 'vue'

export type ToastType = 'success' | 'error' | 'info'

/** A button inside the toast; running it dismisses the toast. */
export interface ToastAction { label: string; run: () => void }

export interface Toast { id: number; type: ToastType; message: string; action?: ToastAction }

/** Options for `push`; a bare number as the third argument is the timeout. */
export interface ToastOptions {
  /** Milliseconds until the toast leaves; 0 keeps it until dismissed. */
  timeout?: number
  action?: ToastAction
}

/** Why a toast's timeout is held: the pointer rests on it, or focus is inside it. */
export type ToastHold = 'hover' | 'focus'

interface Timer { handle: ReturnType<typeof setTimeout> | null; remaining: number; startedAt: number; holds: Set<ToastHold> }

/** The toast queue: at most `limit` toasts, a toast with an action is evicted only when every toast carries one, and a held toast does not time out. */
export function createToastStore(opts: { limit?: number; defaultTimeout?: number } = {}) {
  const limit = opts.limit ?? 4
  const defaultTimeout = opts.defaultTimeout ?? 4000
  const items = reactive<Toast[]>([])
  const timers = new Map<number, Timer>()
  let seq = 0

  function stopTimer(id: number): void {
    const timer = timers.get(id)
    if (timer?.handle) clearTimeout(timer.handle)
    timers.delete(id)
  }

  function startTimer(id: number, timer: Timer): void {
    timer.startedAt = Date.now()
    timer.handle = setTimeout(() => dismiss(id), timer.remaining)
  }

  function dismiss(id: number): void {
    stopTimer(id)
    const i = items.findIndex((t) => t.id === id)
    if (i !== -1) items.splice(i, 1)
  }

  function evict(): void {
    while (items.length > limit) {
      const victim = items.find((t) => !t.action) ?? items[0]
      if (!victim) return
      dismiss(victim.id)
    }
  }

  function push(type: ToastType, message: string, options: number | ToastOptions = {}): number {
    const { timeout = defaultTimeout, action } = typeof options === 'number' ? { timeout: options } : options
    const id = ++seq
    items.push(action ? { id, type, message, action } : { id, type, message })
    if (timeout > 0) {
      const timer: Timer = { handle: null, remaining: timeout, startedAt: 0, holds: new Set() }
      timers.set(id, timer)
      startTimer(id, timer)
    }
    evict()
    return id
  }

  function hold(id: number, reason: ToastHold): void {
    const timer = timers.get(id)
    if (!timer) return
    if (timer.holds.size === 0 && timer.handle) {
      clearTimeout(timer.handle)
      timer.handle = null
      timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt))
    }
    timer.holds.add(reason)
  }

  function release(id: number, reason: ToastHold): void {
    const timer = timers.get(id)
    if (!timer || !timer.holds.delete(reason) || timer.holds.size > 0) return
    startTimer(id, timer)
  }

  function runAction(id: number): void {
    const action = items.find((t) => t.id === id)?.action
    if (!action) return
    dismiss(id)
    action.run()
  }

  function clear(): void {
    for (const id of [...timers.keys()]) stopTimer(id)
    items.splice(0)
  }

  return {
    items,
    dismiss,
    push,
    hold,
    release,
    runAction,
    clear,
    success: (m: string, t?: number) => push('success', m, t),
    error: (m: string, t?: number) => push('error', m, t),
    info: (m: string, t?: number) => push('info', m, t),
  }
}

let store: ReturnType<typeof createToastStore> | null = null

export function useToast() {
  if (!store) store = createToastStore()
  return store
}
