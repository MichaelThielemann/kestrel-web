import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { safeLinkUrl } from '#kestrel-core/app/utils/link-url'

export interface ResolvableLink {
  type: string
  path?: string
  broken?: boolean
  url?: string
  email?: string
  tel?: string
  hash?: string
}

export function linkHrefOf(value: ResolvableLink | null | undefined): string | null {
  if (!value) return null
  switch (value.type) {
    case 'internal':
      if (value.broken) return null
      if (!value.path) return '#'
      if (!value.path.startsWith('/')) return null
      return value.hash ? `${value.path}#${value.hash}` : value.path
    case 'external':
      return value.url ? safeLinkUrl(value.url) : null
    case 'email':
      return value.email ? `mailto:${value.email}` : null
    case 'tel':
      return value.tel ? `tel:${value.tel}` : null
    default:
      return null
  }
}

export function useLinkHref(link: MaybeRefOrGetter<ResolvableLink | null | undefined>) {
  return computed(() => linkHrefOf(toValue(link)))
}
