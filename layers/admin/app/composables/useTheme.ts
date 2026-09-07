export type ThemeName = 'light' | 'dark'

export function resolveInitialTheme(opts: { stored?: string | null; prefersDark?: boolean }): ThemeName {
  if (opts.stored === 'light' || opts.stored === 'dark') return opts.stored
  return opts.prefersDark ? 'dark' : 'light'
}

export function useTheme() {
  const stored = useCookie<ThemeName | null>('kestrel-admin-theme', { default: () => null })
  const prefersDark = ref(false)
  let mq: MediaQueryList | null = null
  const onChange = (e: MediaQueryListEvent) => { prefersDark.value = e.matches }

  onMounted(() => {
    mq = window.matchMedia('(prefers-color-scheme: dark)')
    prefersDark.value = mq.matches
    mq.addEventListener('change', onChange)
  })
  onUnmounted(() => mq?.removeEventListener('change', onChange))

  const theme = computed<ThemeName>(() => resolveInitialTheme({ stored: stored.value, prefersDark: prefersDark.value }))
  const setTheme = (t: ThemeName) => { stored.value = t }
  const toggle = () => setTheme(theme.value === 'dark' ? 'light' : 'dark')

  return { theme, toggle, setTheme }
}
