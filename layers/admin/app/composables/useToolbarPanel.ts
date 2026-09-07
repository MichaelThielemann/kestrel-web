

import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useToolbarPanel<T extends string>() {
  const container = ref<HTMLElement | null>(null)
  const open = ref<T | null>(null)

  let trigger: HTMLElement | null = null

  function toggle(which: T, e: MouseEvent) {
    if (open.value === which) { open.value = null; return }
    trigger = e.currentTarget as HTMLElement
    open.value = which
  }
  function onDocPointer(e: PointerEvent) {
    if (container.value && !container.value.contains(e.target as Node)) open.value = null
  }
  function onDocKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open.value) {
      open.value = null
      trigger?.focus()
    }
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onDocPointer)
    document.addEventListener('keydown', onDocKeydown)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocPointer)
    document.removeEventListener('keydown', onDocKeydown)
  })

  return { container, open, toggle }
}
