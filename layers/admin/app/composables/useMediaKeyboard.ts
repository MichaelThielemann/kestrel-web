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
  /** Every cell of the grid in display order: a roving key, or `null` for a cell that takes no focus, such as an upload; the keys when left out. */
  cells?: () => readonly (string | null)[]
  onDelete: (targets: OpItem[]) => void
}

/** Reads the column count of a CSS grid from its resolved `grid-template-columns`. */
export function gridColumns(el: Element | null | undefined): number {
  if (!el || !import.meta.client) return 1
  const tracks = getComputedStyle(el).gridTemplateColumns.split(' ').filter((t) => t && t !== 'none')
  return Math.max(1, tracks.length)
}

/** The cells of a grid in display order: each child's roving key, or `null` for a child without one. */
export function gridCells(el: Element | null | undefined): (string | null)[] {
  return Array.from(el?.children ?? []).map((cell) => cell.querySelector<HTMLElement>('[data-roving-key]')?.dataset.rovingKey ?? null)
}

/** The key ArrowDown (`step` 1) or ArrowUp (`step` -1) moves to: the tile in the same column of the next row, or the nearest tile of that row when that cell takes no focus; `null` when there is no cell in that column. */
export function verticalTarget(cells: readonly (string | null)[], from: string, columns: number, step: 1 | -1): string | null {
  const index = cells.indexOf(from)
  if (index < 0) return null
  const cols = Math.max(1, columns)
  const column = index % cols
  for (let row = Math.floor(index / cols) + step; row >= 0 && row * cols + column < cells.length; row += step) {
    let best: string | null = null
    let distance = Infinity
    for (let i = row * cols; i < Math.min(cells.length, (row + 1) * cols); i++) {
      const key = cells[i]
      if (key == null || Math.abs(i - row * cols - column) >= distance) continue
      best = key
      distance = Math.abs(i - row * cols - column)
    }
    if (best !== null) return best
  }
  return null
}

/** Whether keyboard focus was lost: it sits on the body or on an element no longer in the document. */
export function focusLost(): boolean {
  if (!import.meta.client) return false
  const active = document.activeElement
  return active === null || active === document.body || !active.isConnected
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable
}

/** Keyboard model of the media library: one tab stop (roving tabindex), arrow keys move it (up and down by row), Shift+arrow selects from the anchor to the focus, Space toggles, Ctrl/Cmd+A selects the page, Escape clears the listed selection, Delete and Backspace delete the selection wherever focus is, or the focused item when nothing is selected or in a single pick. The selection bar takes Ctrl/Cmd+A, Escape and Delete/Backspace through `onBarKeydown`. Keys pressed in a form field or outside a tile, row or the bar are left alone. */
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

  function move(from: string, next: string | null | undefined, extend: boolean) {
    if (next == null || next === from) return
    const end = opts.itemFor(next)
    if (extend && end) selection.extend(opts.itemFor(from), end)
    else if (!extend) selection.endExtend()
    focus(next)
  }

  function targetKey(e: KeyboardEvent, key: string): string | null | undefined {
    const index = keys.value.indexOf(key)
    switch (e.key) {
      case 'ArrowRight': return keys.value[index + 1]
      case 'ArrowLeft': return keys.value[index - 1]
      case 'ArrowDown': return verticalTarget(opts.cells?.() ?? keys.value, key, opts.columns(), 1)
      case 'ArrowUp': return verticalTarget(opts.cells?.() ?? keys.value, key, opts.columns(), -1)
      case 'Home': return keys.value[0]
      case 'End': return keys.value.at(-1)
      default: return null
    }
  }

  function onSelectionKey(e: KeyboardEvent, onBar: boolean): boolean {
    const mod = e.ctrlKey || e.metaKey
    if (mod && !e.altKey && e.key.toLowerCase() === 'a') selection.selectAll()
    else if (e.key === 'Escape' && selection.count.value > 0) selection.clearListed()
    else if (onBar && !mod && (e.key === 'Delete' || e.key === 'Backspace') && selection.count.value > 0) opts.onDelete(selection.selectedTargets())
    else return false
    e.preventDefault()
    return true
  }

  function deleteTargets(item: LibraryItem): OpItem[] {
    if (selection.mode !== 'pick-single' && selection.count.value > 0) return selection.selectedTargets()
    return selection.isSelectable(item) ? effectiveTargets(item, selection.isSelected, selection.selectedItems.value).map(toOpItem) : []
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.isComposing || isEditable(e.target)) return
    const key = keyOf(e.target)
    if (key === null) return
    const item = opts.itemFor(key)
    const to = e.ctrlKey || e.metaKey || e.altKey ? null : targetKey(e, key)
    if (to !== null) {
      e.preventDefault()
      move(key, to, e.shiftKey && e.key.startsWith('Arrow'))
    } else if (e.key === ' ' && item) {
      e.preventDefault()
      selection.toggle(item)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && item && deleteTargets(item).length) {
      e.preventDefault()
      opts.onDelete(deleteTargets(item))
    } else {
      onSelectionKey(e, false)
    }
  }

  function onBarKeydown(e: KeyboardEvent) {
    if (e.isComposing || isEditable(e.target)) return
    if (onSelectionKey(e, true) && e.key === 'Escape') void nextTick(() => { focusActive() })
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
    if (replacement !== null && focusLost()) element(replacement)?.focus()
  }, { flush: 'post' })

  function focusActive(): boolean {
    const key = activeKey.value
    const el = key === null ? undefined : element(key)
    el?.focus()
    return el !== undefined
  }

  return { activeKey, onKeydown, onBarKeydown, onFocusin, focusActive, focus }
}
