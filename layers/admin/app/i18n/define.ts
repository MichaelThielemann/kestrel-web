import type { en } from './en'

export type Catalog = Record<string, string>

export type CatalogKey = keyof typeof en

export type CatalogOverrides = Partial<Record<CatalogKey, string>>

export type AdminI18n = Record<string, CatalogOverrides>

export function defineAdminI18n(overrides: AdminI18n): AdminI18n {
  return overrides
}
