import type { ComputedRef } from 'vue'
import { contentLocales } from '#kestrel-admin/utils/collections'

export interface UseContentLocales {
  locales: ComputedRef<string[]>
  primary: ComputedRef<string>
  prefixPrimary: ComputedRef<boolean>
}

export function useContentLocales(): UseContentLocales {
  const { schema } = useSchema()
  const resolved = computed(() => contentLocales(schema.value))
  return {
    locales: computed(() => resolved.value.locales),
    primary: computed(() => resolved.value.primary),
    prefixPrimary: computed(() => resolved.value.prefixPrimary),
  }
}
