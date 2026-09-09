import type { SerializedField } from '#kestrel-admin/types/kestrel'
import { slugFromWire } from './edit-form'

export function translationSourceValues(
  fields: Record<string, SerializedField>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, field] of Object.entries(fields)) {
    if (!field.localized || !Object.prototype.hasOwnProperty.call(source, name)) continue
    out[name] = field.type === 'slug' ? slugFromWire(source[name]) : source[name]
  }
  return out
}
