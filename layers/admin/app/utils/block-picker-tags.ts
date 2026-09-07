export const BLOCK_PICKER_TAGS_KEY = 'kestrel.blockPicker.tags'

export function parseBlockPickerTags(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []
  } catch {
    return []
  }
}
