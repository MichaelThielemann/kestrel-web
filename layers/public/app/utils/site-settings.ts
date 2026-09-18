import type { NavigationItem } from '~~/shared/model'
import type { SettingsDocument } from '#kestrel-core/app/types/api'
import { boundaryCast } from '#kestrel/cast'

export interface SiteSettings {
  title: string
  description: string
  navigation: NavigationItem[]
  titleSeparator: string | null
  titlePosition: string | null
}

function toNavigationLink(value: unknown): NavigationItem['link'] | null {
  if (typeof value !== 'object' || value === null) return null
  const { type, path, broken, url, email, tel, hash, label } = boundaryCast<Record<string, unknown>>(value, 'json')
  if (typeof type !== 'string') return null
  return {
    type: boundaryCast<NavigationItem['link']['type']>(type, 'json'),
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
  const { label, link: rawLink, target, children } = boundaryCast<Record<string, unknown>>(entry, 'json')
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

export function toNavigation(value: unknown): NavigationItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => toNavigationEntry(entry, true))
}

export function emptySiteSettings(): SiteSettings {
  return { title: '', description: '', navigation: [], titleSeparator: null, titlePosition: null }
}

export function toSiteSettings(doc: SettingsDocument): SiteSettings {
  return {
    title: doc.title ?? '',
    description: typeof doc.description === 'string' ? doc.description : '',
    navigation: toNavigation(doc.navigation),
    titleSeparator: typeof doc.titleSeparator === 'string' ? doc.titleSeparator : null,
    titlePosition: typeof doc.titlePosition === 'string' ? doc.titlePosition : null,
  }
}

export function metaDescription(pageDescription: string | null | undefined, siteDescription: string | null | undefined): string {
  return pageDescription?.trim() || siteDescription?.trim() || ''
}
