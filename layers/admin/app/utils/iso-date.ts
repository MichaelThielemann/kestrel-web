import { parseDate, parseDateTime, type DateValue } from '@internationalized/date'

export type IsoPrecision = 'date' | 'datetime'

export function isoToDate(iso: string | null | undefined, precision: IsoPrecision): DateValue | undefined {
  if (!iso) return undefined
  try {
    return precision === 'date' ? parseDate(iso) : parseDateTime(iso)
  } catch {
    return undefined
  }
}

export function dateToIso(value: DateValue | null | undefined): string | null {
  return value ? value.toString() : null
}
