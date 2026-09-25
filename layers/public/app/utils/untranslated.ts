import { localePath } from '#kestrel-core/app/utils/locale-path'
import type { PublicPageDocument } from '#kestrel-core/app/types/api'

export function isFallbackDocument(doc: PublicPageDocument, locale: string): boolean {
  if (doc._translations) return doc._translations[locale] !== true
  return Object.values(doc._locales ?? {}).some((origin) => origin !== locale)
}

export function primaryPathOf(doc: PublicPageDocument, defaultLocale: string, prefixPrimary: boolean, homeSlug: string): string {
  const slug = doc.slug === homeSlug ? '/' : `/${doc.slug}`
  return localePath(slug, defaultLocale, defaultLocale, prefixPrimary)
}
