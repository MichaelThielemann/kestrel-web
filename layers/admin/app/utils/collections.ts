import blockTags from '#kestrel/consumer-block-tags'
import type { AdminSchema } from '#kestrel-admin/types/api'
import type { SerializedCollection } from '#kestrel-admin/types/kestrel'
import { LAYOUT_FIELD } from '#kestrel/collections-ui'
import { resolveLocalized } from './localized'

export const BLOCKS_FIELD = 'body'

export interface ContentLocales {
  locales: string[]
  primary: string

  prefixPrimary: boolean
}

export const blockTagLabel = (tag: string, lang: string): string => resolveLocalized(blockTags[tag], lang) ?? tag

export const collections = (schema: AdminSchema | null): SerializedCollection[] => schema?.collections ?? []

export const findCollection = (schema: AdminSchema | null, name: string): SerializedCollection | undefined =>
  collections(schema).find((c) => c.name === name)

export const editorOwnedFields = (schema: AdminSchema | null, name: string): string[] => {
  const collection = findCollection(schema, name)
  const owned = collection?.editorOwned ?? []
  return collection?.layoutField ? [...owned, LAYOUT_FIELD] : owned
}

export const contentLocales = (schema: AdminSchema | null): ContentLocales =>
  schema
    ? { locales: [...schema.locales.all], primary: schema.locales.primary, prefixPrimary: schema.locales.prefixPrimary }
    : { locales: [], primary: '', prefixPrimary: false }
