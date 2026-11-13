import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { MediaItem } from '#kestrel-admin/types/api'
import type { LibraryItem } from '../utils/library'
import { useMediaSelection, type MediaSelectionMode } from './useMediaSelection'

function file(id: string): LibraryItem {
  const f: MediaItem = {
    id, filename: `${id}.jpg`, folder: '', contentType: 'image/jpeg', size: 1, path: `/media/${id}/${id}.jpg`, available: true,
    createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null,
    alt: null, title: null, description: null, variants: [], variantCounts: { done: 0, pending: 0, error: 0, failed: 0 }, focus: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] },
  }
  return { type: 'file', file: f }
}

function folder(path: string): LibraryItem {
  return { type: 'folder', folder: { path, name: path, count: 0 } }
}

function setup(mode: MediaSelectionMode, list: LibraryItem[], extra: { initial?: string[]; blocked?: string[] } = {}) {
  const items = ref<LibraryItem[]>(list)
  const blocked = new Set(extra.blocked ?? [])
  const selection = useMediaSelection({
    mode,
    items,
    initial: extra.initial,
    isBlocked: (item) => item.type === 'file' && blocked.has(item.file.id),
  })
  return { items, selection }
}

const ids = (items: readonly LibraryItem[]) => items.map((i) => (i.type === 'file' ? i.file.id : i.folder.path))

describe('media selection in the library', () => {
  it('replaces the selection on a plain click, then toggles on further clicks while anything is selected', () => {
    const [a, b, c] = [file('a'), file('b'), file('c')]
    const { selection } = setup('library', [a, b, c])

    selection.activate(a, { toggle: false, range: false })
    selection.activate(b, { toggle: false, range: false })
    expect(ids(selection.selectedItems.value)).toEqual(['a', 'b'])

    selection.activate(a, { toggle: false, range: false })
    expect(ids(selection.selectedItems.value)).toEqual(['b'])
  })

  it('selects a range from the anchor and folders as well as files', () => {
    const [f, a, b, c] = [folder('docs'), file('a'), file('b'), file('c')]
    const { selection } = setup('library', [f, a, b, c])

    selection.activate(f, { toggle: true, range: false })
    selection.activate(b, { toggle: false, range: true })

    expect(ids(selection.selectedItems.value)).toEqual(['docs', 'a', 'b'])
    expect(selection.selectedTargets()).toEqual([{ type: 'folder', path: 'docs' }, { type: 'file', id: 'a' }, { type: 'file', id: 'b' }])
  })

  it('extends from the anchor to the focus and shrinks again when the focus moves back', () => {
    const [a, b, c, d] = [file('a'), file('b'), file('c'), file('d')]
    const { selection } = setup('library', [a, b, c, d])

    selection.toggle(a)
    selection.extend(a, b)
    selection.extend(a, c)
    expect(ids(selection.selectedItems.value)).toEqual(['a', 'b', 'c'])

    selection.extend(c, b)
    expect(ids(selection.selectedItems.value)).toEqual(['a', 'b'])
  })

  it('keeps what was selected before an extension started and starts a new one after any other change', () => {
    const [a, b, c, d] = [file('a'), file('b'), file('c'), file('d')]
    const { selection } = setup('library', [a, b, c, d])

    selection.toggle(d)
    selection.extend(a, b)
    expect(ids(selection.selectedItems.value)).toEqual(['a', 'b', 'd'])
    selection.extend(b, a)
    expect(ids(selection.selectedItems.value)).toEqual(['a', 'd'])

    selection.endExtend()
    selection.extend(c, b)
    expect(ids(selection.selectedItems.value)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('prunes the selection to the visible items after every load instead of clearing it', () => {
    const [a, b, c] = [file('a'), file('b'), file('c')]
    const { items, selection } = setup('library', [a, b, c])
    selection.selectAll()

    items.value = [b, c]

    expect(ids(selection.selectedItems.value)).toEqual(['b', 'c'])
    expect(selection.count.value).toBe(2)
    expect(selection.isSelected(a)).toBe(false)

    items.value = [a, b]
    expect(ids(selection.selectedItems.value)).toEqual(['b'])
  })

  it('reports whether the whole page or part of it is selected', () => {
    const [a, b] = [file('a'), file('b')]
    const { selection } = setup('library', [a, b])

    expect([selection.allSelected.value, selection.someSelected.value]).toEqual([false, false])
    selection.toggle(a)
    expect([selection.allSelected.value, selection.someSelected.value]).toEqual([false, true])
    selection.selectAll()
    expect([selection.allSelected.value, selection.someSelected.value]).toEqual([true, false])
    selection.clear()
    expect(selection.count.value).toBe(0)
  })

  it('forgets ids that were removed', () => {
    const [a, b] = [file('a'), file('b')]
    const { selection } = setup('library', [a, b])
    selection.selectAll()

    selection.forget(['a'])
    expect(ids(selection.selectedItems.value)).toEqual(['b'])
  })
})

describe('media selection while picking several files', () => {
  it('starts from the ids the field holds and keeps picks that are not visible', () => {
    const [a, b] = [file('a'), file('b')]
    const { items, selection } = setup('pick-multi', [a, b], { initial: ['x'] })

    selection.activate(a, { toggle: false, range: false })
    items.value = [b]

    expect(selection.selectedFileIds.value).toEqual(['x', 'a'])
    expect(selection.count.value).toBe(0)
    expect(selection.selectedTargets()).toEqual([])
  })

  it('acts only on the visible picks', () => {
    const [a, b] = [file('a'), file('b')]
    const { selection } = setup('pick-multi', [a, b], { initial: ['x', 'a'] })

    expect(selection.count.value).toBe(1)
    expect(selection.selectedTargets()).toEqual([{ type: 'file', id: 'a' }])
  })

  it('toggles on every click, never selects folders and skips files that are not available yet', () => {
    const [f, a, b, c] = [folder('docs'), file('a'), file('b'), file('c')]
    const { selection } = setup('pick-multi', [f, a, b, c], { blocked: ['b'] })

    selection.activate(f, { toggle: false, range: false })
    selection.activate(a, { toggle: false, range: false })
    selection.activate(b, { toggle: false, range: false })
    expect(selection.selectedFileIds.value).toEqual(['a'])

    selection.selectAll()
    expect(selection.selectedFileIds.value).toEqual(['a', 'c'])
    expect(selection.isSelectable(f)).toBe(false)
    expect(selection.isSelectable(b)).toBe(false)

    selection.activate(a, { toggle: false, range: false })
    expect(selection.selectedFileIds.value).toEqual(['c'])
  })

  it('lets a selected file be deselected even while it is not available', () => {
    const [a] = [file('a')]
    const { selection } = setup('pick-multi', [a], { initial: ['a'], blocked: ['a'] })

    expect(selection.isSelectable(a)).toBe(true)
    selection.toggle(a)
    expect(selection.selectedFileIds.value).toEqual([])
  })

  it('deselects only the listed picks when the page is deselected', () => {
    const [a, b] = [file('a'), file('b')]
    const { selection } = setup('pick-multi', [a, b], { initial: ['x'] })
    selection.selectAll()

    selection.deselectAll()
    expect(selection.selectedFileIds.value).toEqual(['x'])
  })

  it('clears only the listed picks and keeps the ones in other folders', () => {
    const [a, b] = [file('a'), file('b')]
    const { selection } = setup('pick-multi', [a, b], { initial: ['x'] })

    selection.toggle(a)
    expect(selection.clearListed()).toBe(true)
    expect(selection.selectedFileIds.value).toEqual(['x'])
    expect(selection.clearListed()).toBe(false)
  })

  it('forgets removed ids, visible or not', () => {
    const [a] = [file('a')]
    const { selection } = setup('pick-multi', [a], { initial: ['x', 'a'] })

    selection.forget(['x', 'a'])
    expect(selection.selectedFileIds.value).toEqual([])
  })
})

describe('media selection while picking one file', () => {
  it('holds at most one file and prunes it when it is no longer listed', () => {
    const [f, a, b] = [folder('docs'), file('a'), file('b')]
    const { items, selection } = setup('pick-single', [f, a, b])

    selection.activate(a, { toggle: true, range: false })
    selection.activate(b, { toggle: false, range: true })
    expect(selection.selectedFileIds.value).toEqual(['b'])
    selection.selectAll()
    expect(selection.selectedFileIds.value).toEqual(['b'])
    expect(selection.isSelectable(f)).toBe(false)

    items.value = [a]
    expect(selection.selectedFileIds.value).toEqual([])
  })
})
