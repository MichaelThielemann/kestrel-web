import type { Ref } from 'vue'
import { defaultLocale, locales, prefixPrimary } from '~~/shared/model'
import type { PageDocument, SettingsDocument } from '#kestrel-core/app/types/api'
import type { SiteSettings } from '../utils/site-settings'
import { emptySiteSettings, toSiteSettings } from '../utils/site-settings'

export interface SiteLocaleLink {
  locale: string
  path: string
  current: boolean
}

export function splitSitePath(path: string): { locale: string; rest: string } {
  const segments = path.split('/').filter(Boolean)
  const first = segments[0]
  const isLocale = first !== undefined && (locales as readonly string[]).includes(first)
  if (isLocale && (prefixPrimary || first !== defaultLocale)) return { locale: first, rest: `/${segments.slice(1).join('/')}` }
  return { locale: defaultLocale, rest: path }
}

export function useSiteLocale() {
  const route = useRoute()
  return computed(() => splitSitePath(route.path).locale)
}

export function useSiteLocaleLinks() {
  return useState<SiteLocaleLink[]>('site:locale-links', () => [])
}

export function useSitePage() {
  return useState<PageDocument | null>('site:page', () => null)
}

export function useSiteSettings(locale: Ref<string>) {
  const api = useApi()
  return useAsyncData<SiteSettings>(
    'site:settings',
    async () => {
      try {
        return toSiteSettings(await api<SettingsDocument>('/settings', { query: { locale: locale.value } }))
      } catch (e) {
        if (apiErrorStatus(e) !== 404) throw e
        return emptySiteSettings()
      }
    },
    { watch: [locale], default: emptySiteSettings },
  )
}
