export const BLOCK_PICKER_RECENT_KEY = 'kestrel.blockPicker.recent'

export function parseBlockPickerRecent(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : []
  } catch {
    return []
  }
}
