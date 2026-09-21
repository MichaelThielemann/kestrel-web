export const PHONE_BREAKPOINT_PX = 640

export function phoneMediaQuery(breakpointPx: number = PHONE_BREAKPOINT_PX): string {
  return `(max-width: ${breakpointPx}px)`
}

export function useIsPhone() {
  const isPhone = ref(false)
  let mediaQuery: MediaQueryList | null = null

  function sync() {
    isPhone.value = mediaQuery?.matches ?? false
  }

  onMounted(() => {
    if (!import.meta.client) return
    mediaQuery = window.matchMedia(phoneMediaQuery())
    sync()
    mediaQuery.addEventListener('change', sync)
  })

  onUnmounted(() => mediaQuery?.removeEventListener('change', sync))

  return isPhone
}
