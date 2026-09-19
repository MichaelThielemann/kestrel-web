import adminI18n from '#kestrel/consumer-admin-i18n'
import { mergeAdminI18n } from './merge'

const merged = mergeAdminI18n(adminI18n)

export const adminCatalogs = merged.catalogs
export const adminLangs: readonly string[] = merged.langs

if (import.meta.dev) {
  for (const [lang, keys] of Object.entries(merged.unknownKeys)) {
    console.warn(`[kestrel] admin i18n override for "${lang}" has keys that no catalog defines: ${keys.join(', ')}`)
  }
}
