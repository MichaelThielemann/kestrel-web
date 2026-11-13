import { ref } from 'vue'
import { renameOrMove } from '#kestrel-admin/actions/media'
import type { ActionDeps, BusyPort, RefreshPort } from '#kestrel-admin/actions/types'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import type { LibraryItem } from '../utils/library'
import { effectiveTargets, toOpItem, type OpItem } from '../utils/ops'
import type { MediaTarget } from '../utils/media-capabilities'
import { useMediaDnd, type DropResult } from './useMediaDnd'
import type { MediaSelection } from './useMediaSelection'

export interface UseMediaLibraryDragOptions {
  deps: ActionDeps
  ops: BusyPort
  refresh: RefreshPort
  selection: MediaSelection
  currentFolder: () => string
  canMoveTargets: (targets: readonly MediaTarget[]) => boolean
  onDrop: (result: DropResult) => void
}

/** Drag and drop in the media library: dragging a selected tile drags the listed selection, dropping on a folder moves it, and dropped files go to `onDrop`. */
export function useMediaLibraryDrag(opts: UseMediaLibraryDragOptions) {
  const draggedItems = ref<OpItem[]>([])

  function onItemDragStart(item: LibraryItem, e: DragEvent) {
    const set = effectiveTargets(item, opts.selection.isSelected, opts.selection.selectedItems.value)
    if (!opts.canMoveTargets(set)) { e.preventDefault(); return }
    draggedItems.value = set.map(toOpItem)
    if (!e.dataTransfer) return
    e.dataTransfer.setData('application/x-kestrel-media', '1')
    e.dataTransfer.setData('text/plain', set.map((i) => (i.type === 'file' ? i.file.filename : i.folder.path)).join('\n'))
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  function onItemDragEnd() { draggedItems.value = [] }

  const dnd = useMediaDnd({
    currentFolder: opts.currentFolder,
    onDrop: opts.onDrop,
    draggedItems: () => draggedItems.value,
    onMove: (opItems, dest) => {
      if (!opts.canMoveTargets(opItems)) return
      void runAction(renameOrMove, { deps: opts.deps, target: { kind: 'move', targets: opItems, dest }, notify: 'toast', ops: opts.ops, refresh: opts.refresh })
        .then((result) => toastUnexpected(opts.deps, result))
    },
  })

  return { ...dnd, onItemDragStart, onItemDragEnd }
}
