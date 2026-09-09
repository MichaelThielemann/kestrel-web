import type { SerializedBlock } from '#kestrel-admin/types/kestrel'

export const BLOCK_PICKER_RECENT_CAP = 6

export type BlockPickerGroupKind = 'favorites' | 'recent' | 'all'

export interface BlockPickerGroup {
  kind: BlockPickerGroupKind
  types: SerializedBlock[]
}

function typesByName(types: SerializedBlock[], names: string[]): SerializedBlock[] {
  const byName = new Map(types.map((type) => [type.name, type]))
  return names.map((name) => byName.get(name)).filter((type): type is SerializedBlock => type !== undefined)
}

export function groupBlockTypes(types: SerializedBlock[], favorites: string[], recent: string[]): BlockPickerGroup[] {
  const groups: BlockPickerGroup[] = []
  const favoriteTypes = typesByName(types, favorites)
  if (favoriteTypes.length) groups.push({ kind: 'favorites', types: favoriteTypes })
  const recentTypes = typesByName(types, recent)
  if (recentTypes.length) groups.push({ kind: 'recent', types: recentTypes })
  groups.push({ kind: 'all', types })
  return groups
}

export function updateRecentList(recent: string[], name: string, cap: number = BLOCK_PICKER_RECENT_CAP): string[] {
  return [name, ...recent.filter((existing) => existing !== name)].slice(0, cap)
}
