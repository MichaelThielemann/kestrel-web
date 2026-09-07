
import type { ListColumn } from './list-columns'

const dateTimeFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })

export function cellDisplay(col: ListColumn, row: Record<string, unknown>): string {
  const value = row[col.key]
  if (col.key === 'updatedAt' && typeof value === 'number') return dateTimeFmt.format(new Date(value))
  if (value == null) return ''
  return String(value)
}

export function columnLabel(col: ListColumn, t: (key: string) => string): string {
  return t(col.labelKey)
}

export function rowLabel(row: Record<string, unknown>): string {
  return (row.title as string) || (row.slug as string) || `#${row.id}`
}
