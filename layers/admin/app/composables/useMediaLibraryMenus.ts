import { computed } from 'vue'
import type { LibraryItem } from '../utils/library'
import { toOpItem, type OpItem } from '../utils/ops'
import type { MediaSelection, MediaSelectionMode } from './useMediaSelection'

export interface UseMediaLibraryMenusOptions {
  mode: MediaSelectionMode
  items: () => LibraryItem[]
  selection: Pick<MediaSelection, 'isSelected' | 'select'>
  caps: ReturnType<typeof useMediaCapabilities>
  trash: () => boolean
  onDelete: (targets: OpItem[]) => void
  onRename: (item: LibraryItem) => void
}

/** The menus of the media library: the context menu, in words, and the "…" menu of each tile in a single pick, whose only entry deletes that file. */
export function useMediaLibraryMenus(opts: UseMediaLibraryMenusOptions) {
  const { t } = useT()
  const { menuItems, onContextMenu, onSelect } = useMediaContextMenu({
    items: opts.items,
    isSelected: opts.selection.isSelected,
    select: (item) => { if (opts.mode === 'library') opts.selection.select(item) },
    onDelete: opts.onDelete,
    onRename: opts.onRename,
    trash: opts.trash,
    canRename: (item) => opts.caps.canRenameTarget(item),
    canDelete: (targets) => opts.caps.canDeleteTargets(targets),
  })
  const contextMenu = computed(() => menuItems.value.map((s) => ({
    label: t(s.labelKey, s.count != null ? { n: s.count } : undefined), value: s.value, ...(s.danger ? { danger: true } : {}),
  })))

  const tileMenu = computed(() => (opts.mode === 'pick-single' && opts.caps.canDeleteFile.value
    ? [{ label: t(opts.trash() ? 'media.menu.trash' : 'media.menu.delete'), value: 'delete', danger: true }]
    : null))
  function onTileMenu(item: LibraryItem, value: string) { if (value === 'delete') opts.onDelete([toOpItem(item)]) }

  return { contextMenu, onContextMenu, onMenuSelect: onSelect, tileMenu, onTileMenu }
}
