import { computed, ref, type Ref, type WritableComputedRef } from 'vue'

const toggles = new Map<string, Ref<boolean>>()

function readStored(key: string, fallback: boolean): boolean {
  if (!import.meta.client) return fallback
  try {
    const stored = localStorage.getItem(key)
    return stored === 'on' ? true : stored === 'off' ? false : fallback
  } catch {
    return fallback
  }
}

/**
 * A switch remembered per browser under the `localStorage` key as `on` or `off`, `fallback` until one is stored. Every
 * user of the same key on the page shares it, and where storage is unavailable it lives for the page's lifetime.
 */
export function useStoredToggle(key: string, fallback: boolean): WritableComputedRef<boolean> {
  let toggle = toggles.get(key)
  if (!toggle) {
    toggle = ref(readStored(key, fallback))
    toggles.set(key, toggle)
  }
  const state = toggle
  return computed({
    get: () => state.value,
    set: (next: boolean) => {
      state.value = next
      if (!import.meta.client) return
      try {
        localStorage.setItem(key, next ? 'on' : 'off')
      } catch {
        return
      }
    },
  })
}
