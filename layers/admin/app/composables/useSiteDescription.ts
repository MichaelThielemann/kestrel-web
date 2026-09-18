import type { ComputedRef, Ref } from 'vue'
import type { SettingsDocument } from '#kestrel-core/app/types/api'

export function siteDescriptionOf(doc: Pick<SettingsDocument, 'description'>): string {
  return typeof doc.description === 'string' ? doc.description.trim() : ''
}

export function useSiteDescription(locale: Ref<string>): ComputedRef<string> {
  const api = useApi()
  const state = useState<Record<string, string>>('kestrel-site-description', () => ({}))

  async function load(key: string): Promise<void> {
    if (key in state.value) return
    state.value = { ...state.value, [key]: '' }
    try {
      const doc = await api<SettingsDocument>('/settings', { query: { locale: key } })
      state.value = { ...state.value, [key]: siteDescriptionOf(doc) }
    } catch {
      state.value = { ...state.value, [key]: '' }
    }
  }

  watch(locale, (key) => { void load(key) }, { immediate: true })

  return computed(() => state.value[locale.value] ?? '')
}
