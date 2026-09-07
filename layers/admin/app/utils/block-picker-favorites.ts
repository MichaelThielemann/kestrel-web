export const BLOCK_PICKER_FAVORITES_KEY = 'kestrel.blockPicker.favorites'

export function parseBlockPickerFavorites(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : []
  } catch {
    return []
  }
}
