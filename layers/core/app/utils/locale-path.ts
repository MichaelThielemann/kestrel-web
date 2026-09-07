export function localePath(path: string, locale: string, primaryLocale: string, prefixPrimary = false): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (locale === primaryLocale && !prefixPrimary) return p
  return p === '/' ? `/${locale}` : `/${locale}${p}`
}
