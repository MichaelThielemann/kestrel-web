import { contentLocales } from '#kestrel-admin/utils/collections'

export interface ContentLocales {
  locales: string[]
  primary: string

  prefixPrimary: boolean
}

export function useContentLocales(): ContentLocales {
  return { ...contentLocales }
}
