export function useMediaQuery(query: string) {
  const matches = ref(false)
  let mediaQuery: MediaQueryList | null = null

  function sync() {
    matches.value = mediaQuery?.matches ?? false
  }

  onMounted(() => {
    if (!import.meta.client) return
    mediaQuery = window.matchMedia(query)
    sync()
    mediaQuery.addEventListener('change', sync)
  })

  onUnmounted(() => mediaQuery?.removeEventListener('change', sync))

  return matches
}
