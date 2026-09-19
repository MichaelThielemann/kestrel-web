import { adminLangs } from '../i18n/catalogs'
import { pickLang } from '../i18n/lang'

function initialLang(): string {
  if (!import.meta.client) return 'en'
  return pickLang(adminLangs, navigator.languages)
}

export function useAdminLang() {
  return useCookie<string>('kestrel-admin-lang', { default: initialLang })
}
