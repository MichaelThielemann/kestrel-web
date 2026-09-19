import { en } from '../i18n/en'
import { adminCatalogs, adminLangs } from '../i18n/catalogs'
import type { Catalog } from '../i18n/define'

export type { AdminI18n, Catalog, CatalogKey, CatalogOverrides } from '../i18n/define'

export const ADMIN_LANGS = adminLangs
export type AdminLang = string

export function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (m: string, k: string) => (params[k] != null ? String(params[k]) : m))
}

export function translate(catalog: Catalog, fallback: Catalog, key: string, params?: Record<string, unknown>): string {
  return interpolate(catalog[key] ?? fallback[key] ?? key, params)
}

export function useT() {
  const lang = useAdminLang()
  const t = (key: string, params?: Record<string, unknown>) => translate(adminCatalogs[lang.value] ?? en, en, key, params)
  return { t, lang }
}
