import { nextTick, onUnmounted, type Ref } from 'vue'
import { focusLost } from './useMediaKeyboard'

export interface UseMediaFocusReturnOptions {
  /** The library root, focused when no item can take focus. */
  root: Ref<HTMLElement | null>
  keys: Ref<readonly string[]>
  keyboard: { focus: (key: string) => void; focusActive: () => boolean }
}

/** Puts focus back into the media listing once the DOM and any closing dialog settled: on a given item, else on the active item, else on the library root. */
export function useMediaFocusReturn(opts: UseMediaFocusReturnOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null
  onUnmounted(() => { if (timer) clearTimeout(timer) })

  function later(run: () => void) {
    void nextTick().then(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(run, 0)
    })
  }

  function refocus(key?: string) {
    if (key !== undefined && opts.keys.value.includes(key)) opts.keyboard.focus(key)
    else if (!opts.keyboard.focusActive()) opts.root.value?.focus()
  }

  return {
    later,
    refocus,
    /** After a run in the listing: back into it when focus was lost or is still inside the library. */
    settle: () => later(() => { if (focusLost() || opts.root.value?.contains(document.activeElement)) refocus() }),
    /** After a restore: on the first restored file still listed, when focus was lost. */
    restored: (fileIds: readonly string[]) => later(() => {
      if (focusLost()) refocus(fileIds.map((id) => `file:${id}`).find((key) => opts.keys.value.includes(key)))
    }),
    toRoot: () => later(() => opts.root.value?.focus()),
  }
}
