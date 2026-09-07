import { en } from '../i18n/en'
import { de } from '../i18n/de'

export type Catalog = Record<string, string>

export const ADMIN_LANGS = ['en', 'de'] as const
export type AdminLang = (typeof ADMIN_LANGS)[number]

const catalogs: Record<string, Catalog> = { en, de }

export function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m))
}

export function translate(catalog: Catalog, fallback: Catalog, key: string, params?: Record<string, unknown>): string {
  return interpolate(catalog[key] ?? fallback[key] ?? key, params)
}

export function useT() {
  const lang = useAdminLang()
  const t = (key: string, params?: Record<string, unknown>) => translate(catalogs[lang.value] ?? en, en, key, params)
  return { t, lang }
}
