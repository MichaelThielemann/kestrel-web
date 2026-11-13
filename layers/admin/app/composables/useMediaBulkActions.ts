import { computed, ref, type Ref } from 'vue'
import type { MediaItem } from '#kestrel-admin/types/api'
import { runAction } from '#kestrel-core/app/utils/actions'
import { deleteItems, type DeleteItemsResult } from '../actions/media'
import { needsWarning, previewDeleteItems, type DeletePrecheck } from '../actions/mediaPrecheck'
import { trashItems, type BulkReport } from '../actions/mediaTrash'
import { toastUnexpected } from '../actions/steps/notify'
import type { ActionDeps, BusyPort, RefreshPort } from '../actions/types'
import { folderIsEmpty } from '../utils/library'
import { countMessage, removalState, reportProblems, trashOutcome, type RemovalDialogState, type RemovalEntry, type RemovalProblem, type TrashOutcome } from '../utils/media-removal'
import { resolveFileTargets, type OpItem } from '../utils/ops'
import { referencedBy } from '../utils/references'
import { useMediaUndo } from './useMediaUndo'

export interface UseMediaBulkActionsOptions {
  deps: () => ActionDeps
  ops: BusyPort
  refresh: RefreshPort
  files: Ref<MediaItem[]>
  folderCounts: Ref<Map<string, number>>
  canDeleteTargets: (targets: OpItem[]) => boolean
  /** Offer the undo inside the view instead of in a toast. */
  inlineUndo?: boolean
  /** Called with the file ids that left the library, the files of removed folders included. */
  onRemoved?: (fileIds: string[]) => void
  /** Called once a removal is over with nothing left to report, after its dialog closed if it had one. */
  onSettled?: () => void
  onDeletedFromViewer: () => void
}

type Problems = Pick<RemovalDialogState, 'failures' | 'skipped' | 'cancelled'>

const fileIdsOf = (items: OpItem[]) => items.flatMap((item) => (item.type === 'file' ? [item.id] : []))
const folderPathsOf = (items: OpItem[]) => items.flatMap((item) => (item.type === 'folder' ? [item.path] : []))
const entryOf = (file: MediaItem, refs: RemovalEntry['refs'] = []): RemovalEntry => ({ id: file.id, name: file.filename, path: file.path, contentType: file.contentType, refs })
const isBelow = (file: MediaItem, paths: readonly string[]) => paths.some((p) => file.folder === p || file.folder.startsWith(`${p}/`))

/** Removing media from the library and the picker. With the trash, files and folders move there at once with an undo; a dialog comes first only when a file is in use or its use could not be checked. Without the trash, a dialog confirms the final delete. Both runs can be stopped between requests. Every item is reported: removed ones leave the listing, failed ones stay and stay selected. */
export function useMediaBulkActions(opts: UseMediaBulkActionsOptions) {
  const capabilities = useCapabilities()
  const { has: hasFeature } = useFeatures()
  const { schema } = useSchema()
  const { t } = useT()
  const undo = useMediaUndo({ inline: opts.inlineUndo === true })

  const trashing = computed(() => capabilities.has('trashMedia'))
  const state = ref<RemovalDialogState | null>(null)
  let targets: OpItem[] = []
  let listed: MediaItem[] = []
  let below: MediaItem[] = []
  let entries: RemovalEntry[] = []
  let fromViewer = false
  let controller: AbortController | null = null

  const nameOf = (id: string) => entries.find((e) => e.id === id)?.name ?? opts.files.value.find((f) => f.id === id)?.filename ?? id
  const counts = () => ({ files: fileIdsOf(targets).length, folders: folderPathsOf(targets).length })
  const canTrash = (folderPaths: string[]) => trashing.value && (folderPaths.length === 0 || capabilities.has('trashMediaFolder'))

  async function precheck(listFolders: boolean): Promise<DeletePrecheck> {
    const deps = opts.deps()
    const caps = schema.value?.capabilities
    const tracked = hasFeature('references') || caps?.mediaReferrersMany !== undefined || caps?.mediaReferrers !== undefined
    const r = await runAction(previewDeleteItems, { deps, fileIds: fileIdsOf(targets), folderPaths: folderPathsOf(targets), many: caps?.mediaReferrersMany, one: caps?.mediaReferrers, tracked, listFolders })
    toastUnexpected(deps, r)
    return r.ok && r.result ? r.result : { references: new Map(), folderFiles: [], checked: false, forbidden: false, tracked }
  }

  function withReferences(report: DeletePrecheck): RemovalEntry[] {
    const seen = new Set(listed.map((f) => f.id))
    below = report.folderFiles.filter((f) => !seen.has(f.id))
    return [...listed, ...below].map((f) => entryOf(f, report.references.get(f.id) ?? []))
  }

  async function askRemove(items: OpItem[], origin: 'menu' | 'viewer' = 'menu') {
    if (!items.length || !opts.canDeleteTargets(items) || opts.ops.busy()) return
    opts.ops.setError?.(null)
    undo.dismiss()
    fromViewer = origin === 'viewer'
    targets = items
    listed = resolveFileTargets(items, opts.files.value)
    below = []
    entries = listed.map((f) => entryOf(f))
    const folderPaths = folderPathsOf(items)
    if (!canTrash(folderPaths)) {
      const nonEmptyFolders = folderPaths.some((path) => !folderIsEmpty(path, opts.folderCounts.value))
      state.value = removalState('delete', { ...counts(), entries, nonEmptyFolders })
      const report = await precheck(true)
      entries = withReferences(report)
      if (state.value?.mode === 'delete') state.value = { ...state.value, entries, unverified: needsWarning(report) && !report.checked }
      return
    }
    opts.ops.setBusy(true)
    const report = await precheck(false).finally(() => opts.ops.setBusy(false))
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
    const before = new Map(opts.folderCounts.value)
    const reported: { report?: BulkReport } = {}
    controller = new AbortController()
    opts.ops.setBusy(true)
    const r = await runAction(trashItems, {
      deps, fileIds: fileIdsOf(targets), folderPaths: folderPathsOf(targets), refresh: opts.refresh, signal: controller.signal, onProgress,
      report: (report) => { reported.report = report },
    }).finally(() => { opts.ops.setBusy(false); controller = null })
    toastUnexpected(deps, r)
    const report = (r.ok ? r.result : undefined) ?? reported.report
    if (!report) return
    if (report.done.length) opts.onRemoved?.(report.done)
    const problems = reportProblems(t, report, nameOf)
    const outcome = trashOutcome(targets, report, before)
    if (outcome.moved || outcome.emptied) undo.offer(trashMessage(outcome), outcome.undoIds, new Map(entries.map((e) => [e.id, e.name])))
    finish(problems.failures.length || problems.skipped.length || problems.cancelled ? problems : null, 'trash')
  }

  function trashMessage({ moved, emptied }: TrashOutcome): string {
    const movedText = countMessage(t, 'media.trash.moved', moved)
    const emptiedText = countMessage(t, 'media.trash.emptied', emptied)
    if (moved && emptied) return t('media.trash.summary', { moved: movedText, emptied: emptiedText })
    return moved ? movedText : emptiedText
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
    controller = new AbortController()
    const r = await runAction(deleteItems, {
      deps, files: listed, folderPaths: folderPathsOf(targets), recursive, confirmed: true, ops: opts.ops, refresh: opts.refresh,
      signal: controller.signal, onProgress, report: (result) => { reported.result = result },
    }).finally(() => { controller = null })
    toastUnexpected(deps, r)
    const result = reported.result
    if (!result) return
    const removedFolders = result.folders.results.filter((item) => item.ok).map((item) => item.id)
    const removed = [...result.files.results.filter((item) => item.ok).map((item) => item.id), ...below.filter((f) => isBelow(f, removedFolders)).map((f) => f.id)]
    if (removed.length) opts.onRemoved?.(removed)
    const failures = deleteProblems(result)
    const cancelled = result.files.cancelled === true || result.folders.cancelled === true
    finish(failures.length || cancelled ? { failures, skipped: [], cancelled } : null, 'delete')
  }

  function finish(problems: Problems | null, mode: RemovalDialogState['mode']) {
    if (problems) {
      state.value = { ...(state.value ?? removalState(mode, { ...counts(), entries })), ...problems, progress: null, finished: true }
      return
    }
    const viewer = fromViewer
    close()
    if (viewer) opts.onDeletedFromViewer()
    else opts.onSettled?.()
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
    below = []
    entries = []
    fromViewer = false
  }

  return { state, open: computed(() => state.value !== null), trashing, askRemove, confirm, cancel, undoNotice: undo.notice, dismissUndo: undo.dismiss }
}
