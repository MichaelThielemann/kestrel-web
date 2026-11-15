
import type { ListColumn } from './list-columns'

const dateTimeFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })

/** The path in `locale`, or the only path of a model without locales; empty where the page has none in that locale. */
export function pathIn(paths: unknown, locale: string | undefined): string {
  if (typeof paths !== 'object' || paths === null) return ''
  const entries = Object.entries(paths)
  const value: unknown = locale !== undefined && Object.hasOwn(paths, locale) ? Reflect.get(paths, locale) : entries.length === 1 ? entries[0]?.[1] : undefined
  return typeof value === 'string' ? value : ''
}

export function cellDisplay(col: ListColumn, row: Record<string, unknown>, locale?: string): string {
  if (col.key === 'path') return pathIn(row._paths, locale)
  const value = row[col.key]
  if (col.key === 'updatedAt' && typeof value === 'number') return dateTimeFmt.format(new Date(value))
  if (value == null) return ''
  return String(value)
}

export function columnLabel(col: ListColumn, t: (key: string) => string): string {
  return t(col.labelKey)
}

export function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function rowLabel(row: Record<string, unknown>): string {
  return stringOrEmpty(row.title) || stringOrEmpty(row.slug) || `#${String(row.id)}`
}
