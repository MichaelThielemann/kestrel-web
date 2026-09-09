import type { Localized } from '#kestrel-admin/types/kestrel'

export function resolveLocalized(value: Localized | undefined, lang: string): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  return value[lang] ?? value.en ?? Object.values(value)[0]
}
