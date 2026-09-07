import { reactive } from 'vue'

export type ToastType = 'success' | 'error' | 'info'
export interface Toast { id: number; type: ToastType; message: string }

export function createToastStore(opts: { limit?: number; defaultTimeout?: number } = {}) {
  const limit = opts.limit ?? 4
  const defaultTimeout = opts.defaultTimeout ?? 4000
  const items = reactive<Toast[]>([])
  let seq = 0

  function dismiss(id: number): void {
    const i = items.findIndex((t) => t.id === id)
    if (i !== -1) items.splice(i, 1)
  }

  function push(type: ToastType, message: string, timeout = defaultTimeout): number {
    const id = ++seq
    items.push({ id, type, message })
    while (items.length > limit) items.shift()
    if (timeout > 0) setTimeout(() => dismiss(id), timeout)
    return id
  }

  return {
    items,
    dismiss,
    push,
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
