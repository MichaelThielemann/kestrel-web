import { ref } from 'vue'
import { BLOCK_PICKER_RECENT_KEY, parseBlockPickerRecent } from '../utils/block-picker-recent'
import { updateRecentList } from '../utils/block-picker-groups'

function readStoredRecent(): string[] {
  if (!import.meta.client) return []
  try {
    return parseBlockPickerRecent(localStorage.getItem(BLOCK_PICKER_RECENT_KEY))
  } catch {
    return []
  }
}

export function useBlockPickerRecent() {
  const recent = ref<string[]>(readStoredRecent())

  function recordPick(name: string): void {
    recent.value = updateRecentList(recent.value, name)
    if (!import.meta.client) return
    try {
      localStorage.setItem(BLOCK_PICKER_RECENT_KEY, JSON.stringify(recent.value))
    } catch {
      return
    }
  }

  return { recent, recordPick }
}
