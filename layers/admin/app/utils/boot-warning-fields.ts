import type { InsightsBootWarning } from '#kestrel-admin/types/api'

export interface BootWarningField {
  key: string
  label: string | null
  value: string
}

const KNOWN_FIELD_ORDER = ['pipeline', 'event', 'step', 'key']

/**
 * The context fields of a boot warning besides `code` and `message`: the fields the admin knows a
 * translated label for, in a fixed order, followed by any other field alphabetically with no label.
 */
export function contextFields(warning: InsightsBootWarning): BootWarningField[] {
  const known = KNOWN_FIELD_ORDER.filter((key) => key in warning).map((key) => ({ key, label: `insights.bootWarnings.field.${key}`, value: warning[key]! }))
  const unknown = Object.keys(warning)
    .filter((key) => key !== 'code' && key !== 'message' && !KNOWN_FIELD_ORDER.includes(key))
    .sort()
    .map((key) => ({ key, label: null, value: warning[key]! }))
  return [...known, ...unknown]
}
