import { contentLocales, type ContentLocales } from '#kestrel-admin/utils/collections'

export function useContentLocales(): ContentLocales {
  return contentLocales(useSchema().schema.value)
}
