import { computed, nextTick, ref, watch, type Ref } from 'vue'
import { effectiveTargets, toOpItem, type OpItem } from '../utils/ops'
import type { LibraryItem } from '../utils/library'
import type { MediaSelection } from './useMediaSelection'

export interface UseMediaKeyboardOptions {
  /** The element that holds the tiles or rows; the key handler and the focus tracking sit on it. */
  root: Ref<HTMLElement | null>
  /** The roving keys in display order; each focusable tile or row carries its key as `data-roving-key`. */
  keys: Ref<readonly string[]>
  itemFor: (key: string) => LibraryItem | undefined
  selection: MediaSelection
  /** The number of tiles per row; 1 for a table. */
  columns: () => number
  onDelete: (targets: OpItem[]) => void
}

/** Reads the column count of a CSS grid from its resolved `grid-template-columns`. */
export function gridColumns(el: Element | null | undefined): number {
  if (!el || !import.meta.client) return 1
  const tracks = getComputedStyle(el).gridTemplateColumns.split(' ').filter((t) => t && t !== 'none')
  return Math.max(1, tracks.length)
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable
}

/** Keyboard model of the media library: one tab stop (roving tabindex), arrow keys move it (up and down by row), Shift+arrow extends the selection, Space toggles, Ctrl/Cmd+A selects the page, Escape clears a selection, Delete and Backspace delete. Keys pressed in a form field or outside a tile or row are left alone. */
export function useMediaKeyboard(opts: UseMediaKeyboardOptions) {
  const { root, keys, selection } = opts
  const focusKey = ref<string | null>(null)
  const activeKey = computed(() => (focusKey.value !== null && keys.value.includes(focusKey.value) ? focusKey.value : (keys.value[0] ?? null)))

  function element(key: string): HTMLElement | undefined {
    return Array.from(root.value?.querySelectorAll<HTMLElement>('[data-roving-key]') ?? []).find((el) => el.dataset.rovingKey === key)
  }

  function focus(key: string) {
    focusKey.value = key
    void nextTick(() => element(key)?.focus())
  }

  function keyOf(target: EventTarget | null): string | null {
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-roving-key]') : null
    return el && root.value?.contains(el) ? (el.dataset.rovingKey ?? null) : null
  }

  function move(from: string, to: number, extend: boolean) {
    const next = keys.value[to]
    if (next === undefined || next === from) return
    if (extend) {
      const start = opts.itemFor(from)
      const end = opts.itemFor(next)
      if (start && !selection.isSelected(start) && selection.count.value === 0) selection.toggle(start)
      if (end) selection.range(end)
    }
    focus(next)
  }

  function targetIndex(e: KeyboardEvent, index: number): number | null {
    const columns = opts.columns()
    switch (e.key) {
      case 'ArrowRight': return index + 1
      case 'ArrowLeft': return index - 1
      case 'ArrowDown': return index + columns
      case 'ArrowUp': return index - columns
      case 'Home': return 0
      case 'End': return keys.value.length - 1
      default: return null
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.isComposing || isEditable(e.target)) return
    const key = keyOf(e.target)
    if (key === null) return
    const item = opts.itemFor(key)
    const mod = e.ctrlKey || e.metaKey
    const to = mod || e.altKey ? null : targetIndex(e, keys.value.indexOf(key))
    if (to !== null) {
      e.preventDefault()
      move(key, to, e.shiftKey && e.key.startsWith('Arrow'))
      return
    }
    if (e.key === ' ' && item) {
      e.preventDefault()
      selection.toggle(item)
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      selection.selectAll()
    } else if (e.key === 'Escape' && selection.selected.value.size > 0) {
      e.preventDefault()
      selection.clear()
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && item && selection.isSelectable(item)) {
      e.preventDefault()
      opts.onDelete(effectiveTargets(item, selection.isSelected, selection.selectedItems.value).map(toOpItem))
    }
  }

  function onFocusin(e: FocusEvent) {
    const key = keyOf(e.target)
    if (key !== null) focusKey.value = key
  }

  watch(keys, (next, prev) => {
    const current = focusKey.value
    if (current === null || next.includes(current)) return
    const replacement = next[Math.min(Math.max(0, prev.indexOf(current)), next.length - 1)] ?? null
    focusKey.value = replacement
    if (replacement !== null && import.meta.client && (document.activeElement === null || document.activeElement === document.body)) {
      void nextTick(() => element(replacement)?.focus())
    }
  })

  return { activeKey, onKeydown, onFocusin }
}
