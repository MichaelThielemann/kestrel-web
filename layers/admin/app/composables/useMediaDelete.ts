import { ref, type Ref } from 'vue'
import type { AdminSchema, MediaItem } from '#kestrel-admin/types/api'
import { deleteItems, previewDeleteItems } from '#kestrel-admin/actions/media'
import type { ActionDeps, BusyPort, RefreshPort } from '#kestrel-admin/actions/types'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import { folderIsEmpty } from '../utils/library'
import { deleteSummary, resolveFileTargets, type DeleteSummary, type OpItem } from '../utils/ops'

export interface UseMediaDeleteOptions {
  deps: () => ActionDeps
  ops: BusyPort
  refresh: RefreshPort
  files: Ref<MediaItem[]>
  folderCounts: Ref<Map<string, number>>
  schema: Ref<AdminSchema | null>
  canDeleteTargets: (targets: OpItem[]) => boolean
  onDeletedFromViewer: () => void
}

/** Delete state and the two-step preview/confirm flow, shared by the row menu and the viewer's delete button. */
export function useMediaDelete(opts: UseMediaDeleteOptions) {
  const deleteOpen = ref(false)
  const deleteTargets = ref<OpItem[]>([])
  const deleteFiles = ref<MediaItem[]>([])
  const deleteInfo = ref<DeleteSummary | null>(null)
  const deleteFromViewer = ref(false)

  async function askDelete(opItems: OpItem[], origin: 'menu' | 'viewer' = 'menu') {
    if (!opts.canDeleteTargets(opItems)) return
    opts.ops.setError?.(null)
    deleteFromViewer.value = origin === 'viewer'
    deleteTargets.value = opItems
    const resolved = resolveFileTargets(opItems, opts.files.value)
    deleteFiles.value = resolved
    const nonEmptyFolders = opItems
      .filter((t): t is Extract<OpItem, { type: 'folder' }> => t.type === 'folder' && !folderIsEmpty(t.path, opts.folderCounts.value))
      .map((t) => t.path)
    deleteInfo.value = deleteSummary(resolved, opItems, [], nonEmptyFolders)
    deleteOpen.value = true
    const d = opts.deps()
    const r = await runAction(previewDeleteItems, { deps: d, fileIds: resolved.map((f) => f.id), capability: opts.schema.value?.capabilities.mediaReferrers })
    toastUnexpected(d, r)
    deleteInfo.value = deleteSummary(resolved, opItems, r.ok ? (r.result ?? []) : [], nonEmptyFolders)
  }

  async function onConfirmDelete(recursive: boolean) {
    const targets = deleteTargets.value
    const folderPaths = targets.filter((t): t is Extract<OpItem, { type: 'folder' }> => t.type === 'folder').map((t) => t.path)
    const d = opts.deps()
    const r = await runAction(deleteItems, {
      deps: d,
      files: deleteFiles.value,
      folderPaths,
      recursive,
      confirmed: true,
      ops: opts.ops,
      refresh: opts.refresh,
    })
    toastUnexpected(d, r)
    if (!r.ok) return
    deleteOpen.value = false
    deleteTargets.value = []
    if (deleteFromViewer.value) {
      deleteFromViewer.value = false
      opts.onDeletedFromViewer()
    }
  }

  function close() {
    deleteOpen.value = false
    deleteInfo.value = null
    deleteTargets.value = []
    deleteFiles.value = []
    deleteFromViewer.value = false
  }

  return { deleteOpen, deleteInfo, askDelete, onConfirmDelete, close }
}
