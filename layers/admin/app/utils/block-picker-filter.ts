import { resolveLocalized } from './localized'
import type { SerializedBlock } from '#kestrel-admin/types/kestrel'

function foldAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function normalizeForSearch(value: string): string {
  return foldAccents(value).toLowerCase().trim()
}

export interface BlockPickerFilterInput {
  types: SerializedBlock[]
  query: string
  tags: string[]
  lang: string
}

export function filterBlockTypes({ types, query, tags, lang }: BlockPickerFilterInput): SerializedBlock[] {
  const q = normalizeForSearch(query)
  return types.filter((type) => {
    if (tags.length && !tags.every((tag) => type.tags?.includes(tag))) return false
    if (!q) return true
    const label = resolveLocalized(type.label, lang) ?? type.name
    const description = resolveLocalized(type.description, lang)
    if (normalizeForSearch(label).includes(q) || normalizeForSearch(type.name).includes(q)) return true
    return description !== undefined && normalizeForSearch(description).includes(q)
  })
}

export function collectBlockTags(types: SerializedBlock[]): string[] {
  const tags = new Set<string>()
  for (const type of types) for (const tag of type.tags ?? []) tags.add(tag)
  return [...tags].sort()
}
