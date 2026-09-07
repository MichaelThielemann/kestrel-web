import type { SerializedCollection } from '#kestrel/types/kestrel'

export interface ListColumn {
  key: 'title' | 'slug' | 'status' | 'updatedAt'
  labelKey: string
  sortable: boolean
}

export function listColumns(schema: SerializedCollection): ListColumn[] {
  const columns: ListColumn[] = []
  if ('title' in schema.fields) columns.push({ key: 'title', labelKey: 'list.col.title', sortable: true })
  if (schema.pageLike) columns.push({ key: 'slug', labelKey: 'list.col.slug', sortable: true })
  if (schema.status) columns.push({ key: 'status', labelKey: 'list.col.status', sortable: true })
  columns.push({ key: 'updatedAt', labelKey: 'list.col.updatedAt', sortable: true })
  return columns
}

export function sortableKeys(schema: SerializedCollection): Set<string> {
  return new Set(listColumns(schema).filter((c) => c.sortable).map((c) => c.key))
}
