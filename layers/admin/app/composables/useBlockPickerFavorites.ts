import { ref } from 'vue'
import { BLOCK_PICKER_FAVORITES_KEY, parseBlockPickerFavorites } from '../utils/block-picker-favorites'

function readStoredFavorites(): string[] {
  if (!import.meta.client) return []
  try {
    return parseBlockPickerFavorites(localStorage.getItem(BLOCK_PICKER_FAVORITES_KEY))
  } catch {
    return []
  }
}

export function useBlockPickerFavorites() {
  const favorites = ref<string[]>(readStoredFavorites())

  function persist(next: string[]): void {
    favorites.value = next
    if (!import.meta.client) return
    try {
      localStorage.setItem(BLOCK_PICKER_FAVORITES_KEY, JSON.stringify(next))
    } catch {
      return
    }
  }

  function toggleFavorite(name: string): void {
    persist(favorites.value.includes(name) ? favorites.value.filter((existing) => existing !== name) : [...favorites.value, name])
  }

  return { favorites, toggleFavorite }
}
