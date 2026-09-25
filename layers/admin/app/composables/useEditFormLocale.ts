import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { Document } from '#kestrel-admin/types/api'
import type { ActionDeps } from '../actions/types'

export interface UseEditFormLocaleOptions {
  deps: ActionDeps
  collection: string
  id: string
  mode: Ref<'multi' | 'single'>
  translatable: Ref<boolean>
  locale: Ref<string>
  primaryLocale: Ref<string>
  contentLocales: Ref<string[]>
}

export function useEditFormLocale(opts: UseEditFormLocaleOptions) {
  const { deps, collection, id, mode, translatable, locale, primaryLocale, contentLocales } = opts
  const { api, capabilities } = deps

  const translations = ref<Record<string, boolean>>({})
  const copied = ref(false)
  const primaryTitle = ref('')

  const missingTranslation = computed(
    () => mode.value === 'multi' && id !== 'new' && translatable.value && translations.value[locale.value] === false,
  )

  const copySourceLocales = computed(() =>
    contentLocales.value.filter((l) => l !== locale.value && translations.value[l] === true),
  )
  const copySourceDefault = computed(() =>
    copySourceLocales.value.includes(primaryLocale.value) ? primaryLocale.value : (copySourceLocales.value[0] ?? ''),
  )
  const showCopyTranslation = computed(() => missingTranslation.value && !copied.value && copySourceLocales.value.length > 0)

  function readTranslations(row: Document | null): Record<string, boolean> {
    if (!row) return {}
    return row._translations ? { ...row._translations } : { [locale.value]: row.title != null }
  }

  function setTranslations(row: Document | null) {
    translations.value = readTranslations(row)
  }

  async function loadPrimaryTitle() {
    primaryTitle.value = ''
    if (mode.value !== 'multi' || id === 'new' || !translatable.value || locale.value === primaryLocale.value) return
    try {
      const row = await api<Document>(capabilities.verbRoute(collection, 'readAny', { id }), { query: { locale: primaryLocale.value } })
      primaryTitle.value = typeof row.title === 'string' ? row.title : ''
    } catch {
      primaryTitle.value = ''
    }
  }

  function markCopied() {
    copied.value = true
  }

  return {
    translations,
    copied,
    primaryTitle,
    missingTranslation,
    copySourceLocales,
    copySourceDefault,
    showCopyTranslation,
    setTranslations,
    loadPrimaryTitle,
    markCopied,
  }
}
