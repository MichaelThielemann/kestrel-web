import { computed, ref } from 'vue'
import { renameOrMove, type RenameOrMoveTarget } from '#kestrel-admin/actions/media'
import type { ActionDeps, BusyPort, RefreshPort } from '#kestrel-admin/actions/types'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import type { LibraryItem } from '../utils/library'

export interface UseMediaRenameOptions {
  deps: ActionDeps
  ops: BusyPort
  refresh: RefreshPort
  canRename: (item: LibraryItem) => boolean
}

/** Rename dialog state for a file or a folder of the media library. */
export function useMediaRename(opts: UseMediaRenameOptions) {
  const renameOpen = ref(false)
  const renameTarget = ref<LibraryItem | null>(null)
  const renameName = computed(() => {
    const target = renameTarget.value
    if (!target) return ''
    return target.type === 'file' ? target.file.filename : target.folder.name
  })

  function openRename(item: LibraryItem) {
    opts.ops.setError?.(null)
    renameTarget.value = item
    renameOpen.value = true
  }

  function closeRename() {
    renameOpen.value = false
    renameTarget.value = null
  }

  async function onConfirmRename(name: string) {
    const target = renameTarget.value
    if (!target || !opts.canRename(target)) return
    const rtarget: RenameOrMoveTarget = target.type === 'file'
      ? { kind: 'file-rename', id: target.file.id, filename: name }
      : { kind: 'folder-rename', path: target.folder.path, name }
    const r = await runAction(renameOrMove, { deps: opts.deps, target: rtarget, notify: 'inline', ops: opts.ops, refresh: opts.refresh })
    toastUnexpected(opts.deps, r)
    if (r.ok) closeRename()
  }

  return { renameOpen, renameTarget, renameName, openRename, closeRename, onConfirmRename }
}
