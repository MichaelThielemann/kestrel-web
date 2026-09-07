import type { MediaItem, ReferenceTo } from '#kestrel/types/api'
import type { LibraryItem } from './library'

export type OpItem = { type: 'file'; id: string } | { type: 'folder'; path: string }

export interface MenuItem { label: string; value: string; danger?: boolean; disabled?: boolean }

export interface MenuItemSpec { labelKey: string; count?: number; value: string; danger?: boolean }

export interface DeleteSummary { files: number; folders: number; totalBytes: number; references: ReferenceTo[]; nonEmptyFolders: string[] }

export function toOpItem(item: LibraryItem): OpItem {
  return item.type === 'folder' ? { type: 'folder', path: item.folder.path } : { type: 'file', id: item.file.id }
}

export function resolveFileTargets(targets: OpItem[], viewItems: MediaItem[]): MediaItem[] {
  const out: MediaItem[] = []
  for (const t of targets) {
    if (t.type !== 'file') continue
    const item = viewItems.find((i) => i.id === t.id)
    if (item) out.push(item)
  }
  return out
}

export function resolveTargetItem(el: Element | null, items: LibraryItem[]): LibraryItem | null {
  const fileEl = el?.closest('[data-file-id]')
  if (fileEl) {
    const id = fileEl.getAttribute('data-file-id')
    return items.find((i) => i.type === 'file' && i.file.id === id) ?? null
  }
  const folderEl = el?.closest('[data-drop-folder]')
  if (folderEl) {
    const path = folderEl.getAttribute('data-drop-folder')
    return items.find((i) => i.type === 'folder' && i.folder.path === path) ?? null
  }
  return null
}

export function effectiveTargets(clicked: LibraryItem, isSelected: (i: LibraryItem) => boolean, selected: LibraryItem[]): LibraryItem[] {
  return isSelected(clicked) ? selected : [clicked]
}

export function deleteSummary(files: MediaItem[], targets: OpItem[], references: ReferenceTo[], nonEmptyFolders: string[]): DeleteSummary {
  return {
    files: files.length,
    folders: targets.filter((t) => t.type === 'folder').length,
    totalBytes: files.reduce((sum, f) => sum + (f.size ?? 0), 0),
    references,
    nonEmptyFolders,
  }
}

export function buildMenuItems(ctx: { targetCount: number }): MenuItemSpec[] {
  if (ctx.targetCount === 0) return []
  if (ctx.targetCount === 1) {
    return [
      { labelKey: 'media.menu.rename', value: 'rename' },
      { labelKey: 'media.menu.delete', value: 'delete', danger: true },
    ]
  }
  return [{ labelKey: 'media.menu.deleteN', count: ctx.targetCount, value: 'delete', danger: true }]
}
