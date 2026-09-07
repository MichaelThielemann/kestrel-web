import { ref, computed } from 'vue'
import type { LibraryItem } from '../utils/library'
import { resolveTargetItem, effectiveTargets, toOpItem, buildMenuItems, type MenuItemSpec, type OpItem } from '../utils/ops'

export function useMediaContextMenu(opts: {
  items: () => LibraryItem[]
  isSelected: (i: LibraryItem) => boolean
  select: (i: LibraryItem) => void
  onDelete: (items: OpItem[]) => void
  onRename: (item: LibraryItem) => void
}) {
  const targets = ref<LibraryItem[]>([])

  const menuItems = computed<MenuItemSpec[]>(() => buildMenuItems({ targetCount: targets.value.length }))

  function onContextMenu(e: MouseEvent) {
    const all = opts.items()
    const target = resolveTargetItem(e.target as Element, all)
    if (!target) {
      targets.value = []
      e.preventDefault?.()
      e.stopPropagation?.()
      return
    }
    targets.value = effectiveTargets(target, opts.isSelected, all.filter((i) => opts.isSelected(i)))
    if (!opts.isSelected(target)) opts.select(target)
  }

  function onSelect(value: string) {
    if (value === 'delete') {
      opts.onDelete(targets.value.map(toOpItem))
      return
    }
    const [only, ...rest] = targets.value
    if (value === 'rename' && only && rest.length === 0) opts.onRename(only)
  }

  return { targets, menuItems, onContextMenu, onSelect }
}
