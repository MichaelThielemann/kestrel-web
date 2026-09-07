
export function useAdminLang() {
  return useCookie<string>('kestrel-admin-lang', { default: () => 'en' })
}
