import { contentTypes, locales, defaultLocale, prefixPrimary } from '~~/shared/model'
import collectionsUi from '~~/shared/collections-ui'
import blockTags from '#kestrel/consumer-block-tags'
import type { SerializedCollection } from '#kestrel/types/kestrel'
import { LAYOUT_FIELD, serializeCollections } from './collections-serialize'
import { resolveLocalized } from './localized'

export const BLOCKS_FIELD = 'body'

export const blockTagLabel = (tag: string, lang: string): string => resolveLocalized(blockTags[tag], lang) ?? tag

export const collections: SerializedCollection[] = serializeCollections(contentTypes, collectionsUi)

export const findCollection = (name: string): SerializedCollection | undefined => collections.find((c) => c.name === name)

export const editorOwnedFields = (name: string): string[] => {
  const owned = collectionsUi[name]?.editorOwned ?? []
  return findCollection(name)?.layoutField ? [...owned, LAYOUT_FIELD] : owned
}

export const contentLocales = { locales: [...locales] as string[], primary: defaultLocale, prefixPrimary }
