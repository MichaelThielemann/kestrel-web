import { computed, ref, type Ref } from 'vue'
import type { MediaItem } from '#kestrel-admin/types/api'
import { runAction } from '#kestrel-core/app/utils/actions'
import { deleteItems, type DeleteItemsResult } from '../actions/media'
import { needsWarning, previewDeleteItems, type DeletePrecheck } from '../actions/mediaPrecheck'
import { restoreItems, trashItems } from '../actions/mediaTrash'
import { toastUnexpected } from '../actions/steps/notify'
import type { ActionDeps, BusyPort, RefreshPort } from '../actions/types'
import { folderIsEmpty } from '../utils/library'
import { countMessage, removalState, reportProblems, type RemovalDialogState, type RemovalEntry, type RemovalProblem } from '../utils/media-removal'
import { resolveFileTargets, type OpItem } from '../utils/ops'
import { referencedBy } from '../utils/references'

export interface UseMediaBulkActionsOptions {
  deps: () => ActionDeps
  ops: BusyPort
  refresh: RefreshPort
  files: Ref<MediaItem[]>
  folderCounts: Ref<Map<string, number>>
  canDeleteTargets: (targets: OpItem[]) => boolean
  /** Called with the file ids that left the library, the files of removed folders included. */
  onRemoved?: (fileIds: string[]) => void
  /** Called once a removal the dialog confirmed is over and the dialog closed. */
  onSettled?: () => void
  onDeletedFromViewer: () => void
}

/** How long the undo toast stays while neither hovered nor focused. */
export const UNDO_TIMEOUT_MS = 8000

const fileIdsOf = (items: OpItem[]) => items.flatMap((item) => (item.type === 'file' ? [item.id] : []))
const folderPathsOf = (items: OpItem[]) => items.flatMap((item) => (item.type === 'folder' ? [item.path] : []))
const entryOf = (file: MediaItem, refs: RemovalEntry['refs'] = []): RemovalEntry => ({ id: file.id, name: file.filename, path: file.path, contentType: file.contentType, refs })

/** Removing media from the library and the picker. With the trash, files and folders move there at once with an undo toast; a dialog comes first only when a file is in use or its use could not be checked. Without the trash, a dialog confirms the final delete. Every item is reported: removed ones leave the listing, failed ones stay and stay selected. */
export function useMediaBulkActions(opts: UseMediaBulkActionsOptions) {
  const capabilities = useCapabilities()
  const { has: hasFeature } = useFeatures()
  const { schema } = useSchema()
  const toasts = useToast()
  const { t } = useT()

  const trashing = computed(() => capabilities.has('trashMedia'))
  const state = ref<RemovalDialogState | null>(null)
  let targets: OpItem[] = []
  let listed: MediaItem[] = []
  let entries: RemovalEntry[] = []
  let fromViewer = false
  let controller: AbortController | null = null

  const nameOf = (id: string) => entries.find((e) => e.id === id)?.name ?? opts.files.value.find((f) => f.id === id)?.filename ?? id
  const counts = () => ({ files: fileIdsOf(targets).length, folders: folderPathsOf(targets).length })
  const canTrash = (folderPaths: string[]) => trashing.value && (folderPaths.length === 0 || capabilities.has('trashMediaFolder'))

  async function precheck(): Promise<DeletePrecheck> {
    const deps = opts.deps()
    const caps = schema.value?.capabilities
    const tracked = hasFeature('references') || caps?.mediaReferrersMany !== undefined || caps?.mediaReferrers !== undefined
    const r = await runAction(previewDeleteItems, { deps, fileIds: fileIdsOf(targets), folderPaths: folderPathsOf(targets), many: caps?.mediaReferrersMany, one: caps?.mediaReferrers, tracked })
    toastUnexpected(deps, r)
    return r.ok && r.result ? r.result : { references: new Map(), folderFiles: [], checked: false, forbidden: false, tracked }
  }

  function withReferences(report: DeletePrecheck): RemovalEntry[] {
    const seen = new Set(listed.map((f) => f.id))
    const below = report.folderFiles.filter((f) => !seen.has(f.id))
    return [...listed, ...below].map((f) => entryOf(f, report.references.get(f.id) ?? []))
  }

  async function askRemove(items: OpItem[], origin: 'menu' | 'viewer' = 'menu') {
    if (!items.length || !opts.canDeleteTargets(items) || opts.ops.busy()) return
    opts.ops.setError?.(null)
    fromViewer = origin === 'viewer'
    targets = items
    listed = resolveFileTargets(items, opts.files.value)
    entries = listed.map((f) => entryOf(f))
    const folderPaths = folderPathsOf(items)
    if (!canTrash(folderPaths)) {
      const nonEmptyFolders = folderPaths.some((path) => !folderIsEmpty(path, opts.folderCounts.value))
      state.value = removalState('delete', { ...counts(), entries, nonEmptyFolders })
      const report = await precheck()
      entries = withReferences(report)
      if (state.value?.mode === 'delete') state.value = { ...state.value, entries, unverified: needsWarning(report) && !report.checked }
      return
    }
    opts.ops.setBusy(true)
    const report = await precheck().finally(() => opts.ops.setBusy(false))
    entries = withReferences(report)
    if (!needsWarning(report)) {
      await moveToTrash()
      return
    }
    state.value = removalState('trash', { ...counts(), entries, unverified: !report.checked })
  }

  function onProgress(done: number, total: number) {
    if (state.value && total > 1) state.value = { ...state.value, progress: { done, total } }
  }

  async function moveToTrash() {
    const deps = opts.deps()
    controller = new AbortController()
    opts.ops.setBusy(true)
    const r = await runAction(trashItems, {
      deps, fileIds: fileIdsOf(targets), folderPaths: folderPathsOf(targets), refresh: opts.refresh, signal: controller.signal, onProgress,
    }).finally(() => { opts.ops.setBusy(false); controller = null })
    toastUnexpected(deps, r)
    if (!r.ok || !r.result) return
    const report = r.result
    if (report.done.length) opts.onRemoved?.(report.done)
    const problems = reportProblems(t, report, nameOf)
    const left = new Set([...problems.failures, ...problems.skipped].map((p) => p.id))
    const moved = targets.filter((target) => !left.has(target.type === 'file' ? target.id : target.path)).length
    if (moved) offerUndo(moved, report.done)
    finish(problems.failures.length || problems.skipped.length || problems.cancelled ? problems : null, 'trash')
  }

  function offerUndo(n: number, ids: string[]) {
    const message = countMessage(t, 'media.trash.moved', n)
    if (!ids.length || !capabilities.has('restoreMedia')) {
      toasts.success(message)
      return
    }
    toasts.push('success', message, { timeout: UNDO_TIMEOUT_MS, action: { label: t('media.trash.undo'), run: () => { void undo(ids) } } })
  }

  async function undo(ids: string[]) {
    const deps = opts.deps()
    const r = await runAction(restoreItems, { deps, ids, refresh: opts.refresh })
    toastUnexpected(deps, r)
    if (!r.ok || !r.result) return
    const { done, failed, renamed } = r.result
    if (failed.length) toasts.error(t('media.trash.restoreFailed', { names: failed.map((f) => nameOf(f.id)).join(', ') }))
    else toasts.success(countMessage(t, 'media.trash.restored', done.length))
    if (renamed.length) toasts.info(t('media.trash.renamed', { names: renamed.map((rn) => `${rn.from} → ${rn.to}`).join(', ') }))
  }

  function deleteProblems(result: DeleteItemsResult): RemovalProblem[] {
    return [...result.files.results, ...result.folders.results].filter((item) => !item.ok).map((item) => {
      const refs = item.code === 'CONFLICT' ? referencedBy(item.details, item.message ?? '') : []
      const reason = refs.length ? t('media.trash.reason.referenced') : (item.message ?? '')
      return { id: item.id, name: nameOf(item.id), reason }
    })
  }

  async function deleteForGood(recursive: boolean) {
    const deps = opts.deps()
    const reported: { result?: DeleteItemsResult } = {}
    const r = await runAction(deleteItems, {
      deps, files: listed, folderPaths: folderPathsOf(targets), recursive, confirmed: true, ops: opts.ops, refresh: opts.refresh,
      report: (result) => { reported.result = result },
    })
    toastUnexpected(deps, r)
    const result = reported.result
    if (!result) return
    const removed = result.files.results.filter((item) => item.ok).map((item) => item.id)
    if (removed.length) opts.onRemoved?.(removed)
    finish(r.ok ? null : { failures: deleteProblems(result), skipped: [], cancelled: false }, 'delete')
  }

  function finish(problems: Pick<RemovalDialogState, 'failures' | 'skipped' | 'cancelled'> | null, mode: RemovalDialogState['mode']) {
    if (problems) {
      state.value = { ...(state.value ?? removalState(mode, { ...counts(), entries })), ...problems, progress: null, finished: true }
      return
    }
    const hadDialog = state.value !== null
    const viewer = fromViewer
    close()
    if (viewer) opts.onDeletedFromViewer()
    else if (hadDialog) opts.onSettled?.()
  }

  async function confirm(recursive: boolean) {
    const current = state.value
    if (!current || current.finished || opts.ops.busy()) return
    if (current.mode === 'trash') await moveToTrash()
    else if (current.mode === 'delete') await deleteForGood(recursive)
  }

  function cancel() {
    if (controller) {
      controller.abort()
      return
    }
    const settle = state.value?.finished === true && !fromViewer
    close()
    if (settle) opts.onSettled?.()
  }

  function close() {
    state.value = null
    targets = []
    listed = []
    entries = []
    fromViewer = false
  }

  return { state, open: computed(() => state.value !== null), trashing, askRemove, confirm, cancel, undo }
}
