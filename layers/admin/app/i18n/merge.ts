import { en } from './en'
import { de } from './de'
import type { AdminI18n, Catalog } from './define'

export interface MergedAdminI18n {
  catalogs: Record<string, Catalog>
  langs: string[]
  unknownKeys: Record<string, string[]>
}

export function mergeAdminI18n(overrides: AdminI18n): MergedAdminI18n {
  const catalogs: Record<string, Catalog> = { en: { ...en }, de: { ...de } }
  const langs = ['en', 'de']
  const unknownKeys: Record<string, string[]> = {}

  for (const [lang, strings] of Object.entries(overrides)) {
    const catalog = catalogs[lang] ?? {}
    if (!(lang in catalogs)) {
      catalogs[lang] = catalog
      langs.push(lang)
    }
    const unknown: string[] = []
    for (const [key, value] of Object.entries(strings)) {
      if (value === undefined) continue
      if (!(key in en)) unknown.push(key)
      catalog[key] = value
    }
    if (unknown.length > 0) unknownKeys[lang] = unknown
  }

  return { catalogs, langs, unknownKeys }
}
