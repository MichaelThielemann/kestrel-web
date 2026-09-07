import { ref } from 'vue'
import { BLOCK_PICKER_TAGS_KEY, parseBlockPickerTags } from '../utils/block-picker-tags'

function readStoredTags(): string[] {
  if (!import.meta.client) return []
  try {
    return parseBlockPickerTags(localStorage.getItem(BLOCK_PICKER_TAGS_KEY))
  } catch {
    return []
  }
}

export function useBlockPickerTags() {
  const tags = ref<string[]>(readStoredTags())

  function setTags(next: string[]): void {
    tags.value = next
    if (!import.meta.client) return
    try {
      localStorage.setItem(BLOCK_PICKER_TAGS_KEY, JSON.stringify(next))
    } catch {
      return
    }
  }

  return { tags, setTags }
}
