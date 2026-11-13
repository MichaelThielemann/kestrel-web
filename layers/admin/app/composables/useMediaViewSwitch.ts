import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { focusLost } from './useMediaKeyboard'

let handedOver = false

/** Keeps keyboard focus across the switch between the media library and its trash view: a view that unmounts with focus inside `root` hands it over, and the view mounted next puts it on `target` when focus was lost on the way. A view mounted without a hand-over leaves focus alone. */
export function useMediaViewSwitch(root: Ref<HTMLElement | null>, target: () => HTMLElement | null | undefined) {
  onMounted(() => {
    const take = handedOver
    handedOver = false
    if (take && focusLost()) target()?.focus()
  })
  onBeforeUnmount(() => {
    handedOver = import.meta.client && root.value !== null && root.value.contains(document.activeElement)
  })
}
