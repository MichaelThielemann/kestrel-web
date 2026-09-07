import type { Ref } from 'vue'
import type { NavigationItem } from '~~/shared/model'
import { defaultLocale, locales, prefixPrimary } from '~~/shared/model'
import type { PageDocument, SettingsDocument } from '../../../core/app/types/api'

export interface SiteLocaleLink {
  locale: string
  path: string
  current: boolean
}

export interface SiteSettings {
  title: string
  navigation: NavigationItem[]
  titleSeparator: string | null
  titlePosition: string | null
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

function toNavigationLink(value: unknown): NavigationItem['link'] | null {
  if (typeof value !== 'object' || value === null) return null
  const { type, path, broken, url, email, tel, hash, label } = value as Record<string, unknown>
  if (typeof type !== 'string') return null
  return {
    type: type as NavigationItem['link']['type'],
    ...(typeof path === 'string' ? { path } : {}),
    ...(broken === true ? { broken: true } : {}),
    ...(typeof url === 'string' ? { url } : {}),
    ...(typeof email === 'string' ? { email } : {}),
    ...(typeof tel === 'string' ? { tel } : {}),
    ...(typeof hash === 'string' ? { hash } : {}),
    ...(typeof label === 'string' ? { label } : {}),
  }
}

function toNavigationEntry(entry: unknown, allowChildren: boolean): NavigationItem[] {
  if (typeof entry !== 'object' || entry === null) return []
  const { label, link: rawLink, target, children } = entry as Record<string, unknown>
  const link = toNavigationLink(rawLink)
  if (typeof label !== 'string' || !link) return []
  const item: NavigationItem = { label, link }
  if (target === '_self' || target === '_blank') item.target = target
  if (allowChildren && Array.isArray(children)) {
    const kids = children.flatMap((child) => toNavigationEntry(child, false))
    if (kids.length > 0) item.children = kids
  }
  return [item]
}

function toNavigation(value: unknown): NavigationItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => toNavigationEntry(entry, true))
}

export function useSiteSettings(locale: Ref<string>) {
  const api = useApi()
  return useAsyncData<SiteSettings>(
    'site:settings',
    async () => {
      try {
        const doc = await api<SettingsDocument>('/settings', { query: { locale: locale.value } })
        const { titleSeparator, titlePosition } = doc as Record<string, unknown>
        return {
          title: doc.title ?? '',
          navigation: toNavigation(doc.navigation),
          titleSeparator: typeof titleSeparator === 'string' ? titleSeparator : null,
          titlePosition: typeof titlePosition === 'string' ? titlePosition : null,
        }
      } catch (e) {
        if (apiErrorStatus(e) !== 404) throw e
        return { title: '', navigation: [], titleSeparator: null, titlePosition: null }
      }
    },
    { watch: [locale], default: (): SiteSettings => ({ title: '', navigation: [], titleSeparator: null, titlePosition: null }) },
  )
}
