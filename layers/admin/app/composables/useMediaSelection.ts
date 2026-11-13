import { computed, ref, watch, type Ref } from 'vue'
import { computeRange, itemKey, type LibraryItem } from '../utils/library'
import { toOpItem, type OpItem } from '../utils/ops'

/** `library` selects files and folders; `pick-multi` picks files and keeps picks from other folders; `pick-single` holds one file. */
export type MediaSelectionMode = 'library' | 'pick-multi' | 'pick-single'

export interface UseMediaSelectionOptions {
  mode: MediaSelectionMode
  /** The items the library lists right now, in display order. */
  items: Ref<LibraryItem[]>
  /** File ids selected from the start; only `pick-multi` keeps them. */
  initial?: readonly string[]
  /** An item that cannot be selected right now; a selected one can still be deselected. */
  isBlocked?: (item: LibraryItem) => boolean
}

/** Pointer modifiers of a click on a tile, row or checkbox. */
export interface SelectMods { toggle: boolean; range: boolean }

const FILE_PREFIX = 'file:'

/** The one selection of the media library, its multi-pick and its context menu. In `library` and `pick-single` mode it is pruned to the listed items after every load; `pick-multi` keeps picks that are not listed and drops them only through `forget` or `clear`. Actions, `clearListed` among them, act on the listed part of it. `extend` selects from the anchor to an item on top of the selection from before the extension began, so moving back shrinks it; any other change ends the extension. */
export function useMediaSelection(opts: UseMediaSelectionOptions) {
  const { mode, items } = opts
  const selected = ref<ReadonlySet<string>>(new Set(mode === 'pick-multi' ? (opts.initial ?? []).map((id) => `${FILE_PREFIX}${id}`) : []))
  let anchor: string | null = null
  let extendBase: ReadonlySet<string> | null = null

  const isSelected = (item: LibraryItem) => selected.value.has(itemKey(item))

  function isSelectable(item: LibraryItem): boolean {
    if (mode !== 'library' && item.type !== 'file') return false
    return isSelected(item) || !opts.isBlocked?.(item)
  }

  const selectableItems = computed(() => items.value.filter(isSelectable))
  const selectedItems = computed(() => items.value.filter(isSelected))
  const count = computed(() => selectedItems.value.length)
  const selectableCount = computed(() => selectableItems.value.length)
  const allSelected = computed(() => selectableItems.value.length > 0 && selectableItems.value.every(isSelected))
  const someSelected = computed(() => count.value > 0 && !allSelected.value)
  const selectedFileIds = computed(() => [...selected.value].filter((k) => k.startsWith(FILE_PREFIX)).map((k) => k.slice(FILE_PREFIX.length)))

  function set(keys: Iterable<string>) {
    selected.value = new Set(keys)
    extendBase = null
  }

  function select(item: LibraryItem) {
    if (!isSelectable(item)) return
    const key = itemKey(item)
    if (mode === 'pick-multi') set([...selected.value, key])
    else set([key])
    anchor = key
  }

  function toggle(item: LibraryItem) {
    if (!isSelectable(item)) return
    const key = itemKey(item)
    if (selected.value.has(key)) set([...selected.value].filter((k) => k !== key))
    else set(mode === 'pick-single' ? [key] : [...selected.value, key])
    anchor = key
  }

  function range(item: LibraryItem) {
    if (mode === 'pick-single') { select(item); return }
    if (!isSelectable(item)) return
    const keys = selectableItems.value.map(itemKey)
    const target = itemKey(item)
    set(computeRange(keys, anchor ?? target, target, new Set(selected.value)))
    anchor ??= target
  }

  function extend(from: LibraryItem | undefined, to: LibraryItem) {
    if (mode === 'pick-single') { select(to); return }
    if (!isSelectable(to)) return
    const target = itemKey(to)
    if (extendBase === null) {
      extendBase = selected.value
      anchor = from && isSelectable(from) ? itemKey(from) : target
    }
    selected.value = computeRange(selectableItems.value.map(itemKey), anchor ?? target, target, new Set(extendBase))
  }

  function endExtend() { extendBase = null }

  function activate(item: LibraryItem, mods: SelectMods) {
    if (mods.range) range(item)
    else if (mods.toggle || mode === 'pick-multi' || (mode === 'library' && count.value > 0)) toggle(item)
    else select(item)
  }

  function selectAll() {
    if (mode === 'pick-single') return
    set([...selected.value, ...selectableItems.value.map(itemKey)])
  }

  function deselectAll() {
    const visible = new Set(items.value.map(itemKey))
    set([...selected.value].filter((k) => !visible.has(k)))
  }

  function clear(): boolean {
    const had = selected.value.size > 0
    set([])
    anchor = null
    return had
  }

  function clearListed(): boolean {
    if (mode !== 'pick-multi') return clear()
    const had = count.value > 0
    deselectAll()
    return had
  }

  function forget(fileIds: readonly string[]) {
    const drop = new Set(fileIds.map((id) => `${FILE_PREFIX}${id}`))
    set([...selected.value].filter((k) => !drop.has(k)))
    if (anchor && drop.has(anchor)) anchor = null
  }

  const selectedTargets = (): OpItem[] => selectedItems.value.map(toOpItem)

  if (mode !== 'pick-multi') {
    watch(items, (list) => {
      const visible = new Set(list.map(itemKey))
      const kept = [...selected.value].filter((k) => visible.has(k))
      if (kept.length !== selected.value.size) set(kept)
      if (anchor && !visible.has(anchor)) anchor = null
    }, { flush: 'sync' })
  }

  return {
    mode, selected, count, selectableCount, selectedItems, selectedFileIds, allSelected, someSelected,
    isSelected, isSelectable, select, toggle, range, extend, endExtend, activate, selectAll, deselectAll, clear, clearListed, forget, selectedTargets,
  }
}

export type MediaSelection = ReturnType<typeof useMediaSelection>
