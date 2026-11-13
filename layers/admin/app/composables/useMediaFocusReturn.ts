import { nextTick, onUnmounted, type Ref } from 'vue'
import { focusLost } from './useMediaKeyboard'

export interface UseMediaFocusReturnOptions {
  /** The library root, focused when no item can take focus. */
  root: Ref<HTMLElement | null>
  keys: Ref<readonly string[]>
  keyboard: { focus: (key: string) => void; focusActive: () => boolean }
}

function typing(): boolean {
  const active = document.activeElement
  if (active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return true
  if (active instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(active.type)
  return active instanceof HTMLElement && active.isContentEditable
}

/** Puts focus back into the media listing once the DOM and any closing dialog settled: on a given item, else on the active item, else on the library root. Focus counts as adrift when it was lost or fell to an element that holds the library, such as the dialog around a picker. */
export function useMediaFocusReturn(opts: UseMediaFocusReturnOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let mounted = true
  onUnmounted(() => {
    mounted = false
    if (timer) clearTimeout(timer)
  })

  function later(run: () => void) {
    void nextTick().then(() => {
      if (!mounted) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(run, 0)
    })
  }

  function adrift(): boolean {
    if (focusLost()) return true
    const root = opts.root.value
    const active = document.activeElement
    return root !== null && active !== null && active.contains(root)
  }

  function refocus(key?: string) {
    if (key !== undefined && opts.keys.value.includes(key)) opts.keyboard.focus(key)
    else if (!opts.keyboard.focusActive()) opts.root.value?.focus()
  }

  return {
    later,
    refocus,
    /** After a run in the listing: back into it when focus is adrift or still inside the library. */
    settle: () => later(() => { if (adrift() || opts.root.value?.contains(document.activeElement)) refocus() }),
    /** After a restore: on the first restored file still listed. `requested` is set when this view offered the undo that ran; focus then moves unless the user is typing, otherwise only when it is adrift. */
    restored: (fileIds: readonly string[], requested = false) => later(() => {
      if (requested ? !typing() : adrift()) refocus(fileIds.map((id) => `file:${id}`).find((key) => opts.keys.value.includes(key)))
    }),
    toRoot: () => later(() => opts.root.value?.focus()),
  }
}
