import type { Ref } from 'vue'

export interface RailOverlayOptions {
  isPhone: Ref<boolean>
  routePath: Ref<string>
  collapsed: Ref<boolean>
  toggleCollapsed: () => void
}

export function useRailOverlay(options: RailOverlayOptions) {
  const { isPhone, routePath, collapsed, toggleCollapsed } = options
  const railOpen = ref(false)

  const railCollapsed = computed(() => (isPhone.value ? !railOpen.value : collapsed.value))

  function closeRailOverlay() {
    railOpen.value = false
  }

  function toggleRail() {
    if (isPhone.value) {
      railOpen.value = !railOpen.value
      return
    }
    toggleCollapsed()
  }

  watch(isPhone, (phone) => { if (!phone) closeRailOverlay() })
  watch(routePath, () => closeRailOverlay())

  let escapeListener: ((event: KeyboardEvent) => void) | null = null

  watch(railOpen, (open) => {
    if (!import.meta.client) return
    if (open && !escapeListener) {
      escapeListener = (event: KeyboardEvent) => {
        if (event.key === 'Escape') closeRailOverlay()
      }
      window.addEventListener('keydown', escapeListener)
    } else if (!open && escapeListener) {
      window.removeEventListener('keydown', escapeListener)
      escapeListener = null
    }
  })

  onUnmounted(() => {
    if (escapeListener) window.removeEventListener('keydown', escapeListener)
  })

  return { railOpen, railCollapsed, toggleRail, closeRailOverlay }
}
