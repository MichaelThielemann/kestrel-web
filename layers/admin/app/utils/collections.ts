import blockTags from '#kestrel/consumer-block-tags'
import type { AdminSchema } from '#kestrel-admin/types/api'
import type { AdminCollection } from '#kestrel-admin/types/kestrel'
import { LAYOUT_FIELD } from '#kestrel/collections-ui'
import { resolveLocalized } from './localized'
import { DEFAULT_HOME_SLUG } from './edit-form'

export const BLOCKS_FIELD = 'body'
export const BLOCK_ALIASES_FIELD = 'blockAliases'

/** Whether a collection's served fields hold block aliases. Without the field the blocks editor offers none. */
export const hasBlockAliases = (fields: Record<string, unknown>): boolean => BLOCK_ALIASES_FIELD in fields

export interface ContentLocales {
  locales: string[]
  primary: string

  prefixPrimary: boolean
}

export const blockTagLabel = (tag: string, lang: string): string => resolveLocalized(blockTags[tag], lang) ?? tag

export const collections = (schema: AdminSchema | null): AdminCollection[] => schema?.collections ?? []

export const findCollection = (schema: AdminSchema | null, name: string): AdminCollection | undefined =>
  collections(schema).find((c) => c.name === name)

export const editorOwnedFields = (schema: AdminSchema | null, name: string): string[] => {
  const collection = findCollection(schema, name)
  const owned = collection?.editorOwned ?? []
  return collection?.layoutField ? [...owned, LAYOUT_FIELD] : owned
}

/** The slug the site serves at a locale's root; `"home"` for a server that does not report one. */
export const homeSlugOf = (schema: AdminSchema | null): string => schema?.homeSlug ?? DEFAULT_HOME_SLUG

export const contentLocales = (schema: AdminSchema | null): ContentLocales =>
  schema
    ? { locales: [...schema.locales.all], primary: schema.locales.primary, prefixPrimary: schema.locales.prefixPrimary }
    : { locales: [], primary: '', prefixPrimary: false }
