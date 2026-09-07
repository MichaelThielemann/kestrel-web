import { ref } from 'vue'
import { BLOCK_PICKER_VIEW_KEY, parseBlockPickerView, type BlockPickerView } from '../utils/block-picker-view'

function readStoredView(): BlockPickerView {
  if (!import.meta.client) return 'grid'
  try {
    return parseBlockPickerView(localStorage.getItem(BLOCK_PICKER_VIEW_KEY))
  } catch {
    return 'grid'
  }
}

export function useBlockPickerView() {
  const view = ref<BlockPickerView>(readStoredView())

  function setView(next: BlockPickerView): void {
    view.value = next
    if (!import.meta.client) return
    try {
      localStorage.setItem(BLOCK_PICKER_VIEW_KEY, next)
    } catch {
      return
    }
  }

  return { view, setView }
}
