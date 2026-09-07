import { watch } from 'vue'
import type { Ref } from 'vue'

export function useEchoGuard<T>(model: Ref<T>, current: () => unknown, reseed: (v: T) => void, empty: unknown = null): void {
  watch(model, (v) => {
    if (v !== null && v !== undefined && v === current()) return
    if (JSON.stringify(v ?? empty) === JSON.stringify(current())) return
    reseed(v)
  })
}
