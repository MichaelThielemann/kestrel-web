import { computed, ref, type Ref } from 'vue'
import type { MediaItem } from '#kestrel-admin/types/api'
import { runAction } from '#kestrel-core/app/utils/actions'
import { deleteItems, type DeleteItemsResult } from '../actions/media'
import { inBlocks, needsWarning, previewDeleteItems, type DeletePrecheck } from '../actions/mediaPrecheck'
import { trashItems, type BulkReport } from '../actions/mediaTrash'
import { toastUnexpected } from '../actions/steps/notify'
import type { ActionDeps, BusyPort, RefreshPort } from '../actions/types'
import { folderIsEmpty } from '../utils/library'
import { countMessage, goneIds, hasProblems, removalState, reportProblems, trashOutcome, type RemovalDialogState, type RemovalEntry, type RemovalProblem, type TrashOutcome } from '../utils/media-removal'
import { resolveFileTargets, type OpItem } from '../utils/ops'
import { referencedBy } from '../utils/references'
import { answeredMessage, failureText } from './useApi'
import { notifyMediaRemoved } from './useMediaChanges'
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
  /** Called with the file ids an undo offered here brought back, once the views reloaded. */
  onRestored?: (fileIds: readonly string[]) => void
  onDeletedFromViewer: () => void
}

type Problems = Pick<RemovalDialogState, 'failures' | 'skipped' | 'cancelled'>

const fileIdsOf = (items: OpItem[]) => items.flatMap((item) => (item.type === 'file' ? [item.id] : []))
const folderPathsOf = (items: OpItem[]) => items.flatMap((item) => (item.type === 'folder' ? [item.path] : []))
const entryOf = (file: MediaItem, refs: RemovalEntry['refs'] = []): RemovalEntry => ({ id: file.id, name: file.filename, path: file.path, contentType: file.contentType, refs })
const isBelow = (file: MediaItem, paths: readonly string[]) => paths.some((p) => file.folder === p || file.folder.startsWith(`${p}/`))

/** Removing media from the library and the picker. With the trash composed on the site, files and folders move there at once with an undo; a dialog comes first only when a file is in use or its use could not be checked. Without the trash, a dialog confirms the final delete. A run in a dialog can be stopped between requests, so Stop is offered only while another request is left to send. Every item is reported: removed ones leave the listing, failed ones stay and stay selected, and one already gone counts as removed and opens no report by itself. When a move ends in the dialog with something left to report, its undo waits in that dialog and goes to the usual toast or notice once the dialog closes. Only the latest request's reference check counts. */
export function useMediaBulkActions(opts: UseMediaBulkActionsOptions) {
  const { has: hasFeature } = useFeatures()
  const { schema } = useSchema()
  const { t } = useT()
  const undo = useMediaUndo({ inline: opts.inlineUndo === true, onRestored: (ids) => opts.onRestored?.(ids) })

  const trashing = computed(() => schema.value?.mediaTrash === true)
  const state = ref<RemovalDialogState | null>(null)
  let targets: OpItem[] = []
  let listed: MediaItem[] = []
  let below: MediaItem[] = []
  let entries: RemovalEntry[] = []
  let fromViewer = false
  let controller: AbortController | null = null
  let request = 0

  const nameOf = (id: string) => entries.find((e) => e.id === id)?.name ?? opts.files.value.find((f) => f.id === id)?.filename ?? id
  const counts = () => ({ files: fileIdsOf(targets).length, folders: folderPathsOf(targets).length })

  async function precheck(listFolders: boolean): Promise<DeletePrecheck> {
    const deps = opts.deps()
    const caps = schema.value?.capabilities
    const tracked = hasFeature('references') || caps?.mediaReferrersMany !== undefined || caps?.mediaReferrers !== undefined
    const r = await runAction(previewDeleteItems, { deps, fileIds: fileIdsOf(targets), folderPaths: folderPathsOf(targets), many: caps?.mediaReferrersMany, one: caps?.mediaReferrers, tracked, listFolders })
    toastUnexpected(deps, r)
    return r.ok && r.result ? r.result : { references: new Map(), folderFiles: [], checked: false, forbidden: false, tracked, failure: null }
  }

  function withReferences(report: DeletePrecheck): RemovalEntry[] {
    const seen = new Set(listed.map((f) => f.id))
    below = report.folderFiles.filter((f) => !seen.has(f.id))
    return [...listed, ...below].map((f) => entryOf(f, report.references.get(f.id) ?? []))
  }

  async function askRemove(items: OpItem[], origin: 'menu' | 'viewer' = 'menu') {
    if (!items.length || !opts.canDeleteTargets(items) || opts.ops.busy()) return
    const my = ++request
    opts.ops.setError?.(null)
    undo.dismiss()
    fromViewer = origin === 'viewer'
    targets = items
    listed = resolveFileTargets(items, opts.files.value)
    below = []
    entries = listed.map((f) => entryOf(f))
    if (!trashing.value) {
      const nonEmptyFolders = folderPathsOf(items).some((path) => !folderIsEmpty(path, opts.folderCounts.value))
      state.value = removalState('delete', { ...counts(), entries, nonEmptyFolders })
      const report = await precheck(true)
      if (my !== request) return
      entries = withReferences(report)
      if (state.value?.mode === 'delete') state.value = { ...state.value, entries, unverified: needsWarning(report) && !report.checked, checkFailure: report.failure }
      return
    }
    opts.ops.setBusy(true)
    const report = await precheck(false).finally(() => opts.ops.setBusy(false))
    if (my !== request) return
    entries = withReferences(report)
    if (!needsWarning(report)) {
      await moveToTrash()
      return
    }
    state.value = removalState('trash', { ...counts(), entries, unverified: !report.checked, checkFailure: report.failure })
  }

  function onProgress(done: number, total: number) {
    if (state.value && total > 1) state.value = { ...state.value, progress: { done, total }, stoppable: done < total - 1 }
  }

  function startRun(requests: number): AbortSignal {
    const run = new AbortController()
    controller = run
    if (state.value) state.value = { ...state.value, stoppable: requests > 1 }
    return run.signal
  }

  async function moveToTrash() {
    const deps = opts.deps()
    const before = new Map(opts.folderCounts.value)
    const reported: { report?: BulkReport } = {}
    const signal = startRun(inBlocks(fileIdsOf(targets)).length + folderPathsOf(targets).length)
    opts.ops.setBusy(true)
    const r = await runAction(trashItems, {
      deps, fileIds: fileIdsOf(targets), folderPaths: folderPathsOf(targets), refresh: opts.refresh, signal, onProgress,
      report: (report) => { reported.report = report },
    }).finally(() => { opts.ops.setBusy(false); controller = null })
    toastUnexpected(deps, r)
    const report = (r.ok ? r.result : undefined) ?? reported.report
    if (!report) return
    removed([...report.done, ...goneIds(report)])
    const problems = reportProblems(t, report, nameOf, 'media.trash.trashFailed')
    const left = hasProblems(problems)
    const outcome = trashOutcome(targets, report, before)
    if (outcome.moved || outcome.emptied) undo.offer(trashMessage(outcome), outcome.undoIds, new Map(entries.map((e) => [e.id, e.name])), { hold: left })
    finish(left ? problems : null, 'trash')
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
      const reason = refs.length ? t('media.trash.reason.referenced') : answeredMessage(t, item, t('media.remove.deleteFailed'))
      return { id: item.id, name: nameOf(item.id), reason: failureText(t, reason, item), ...(item.requestId ? { requestId: item.requestId } : {}) }
    })
  }

  async function deleteForGood(recursive: boolean) {
    const deps = opts.deps()
    const reported: { result?: DeleteItemsResult } = {}
    const signal = startRun(listed.length + folderPathsOf(targets).length)
    const r = await runAction(deleteItems, {
      deps, files: listed, folderPaths: folderPathsOf(targets), recursive, confirmed: true, ops: opts.ops, refresh: opts.refresh,
      signal, onProgress, report: (result) => { reported.result = result },
    }).finally(() => { controller = null })
    toastUnexpected(deps, r)
    const result = reported.result
    if (!result) return
    const removedFolders = result.folders.results.filter((item) => item.ok).map((item) => item.id)
    const gone = [...result.files.results.filter((item) => item.ok).map((item) => item.id), ...below.filter((f) => isBelow(f, removedFolders)).map((f) => f.id)]
    removed(gone)
    const failures = deleteProblems(result)
    const cancelled = result.files.cancelled === true || result.folders.cancelled === true
    finish(failures.length || cancelled ? { failures, skipped: [], cancelled } : null, 'delete')
  }

  function removed(fileIds: string[]) {
    if (!fileIds.length) return
    opts.onRemoved?.(fileIds)
    void notifyMediaRemoved(fileIds)
  }

  function finish(problems: Problems | null, mode: RemovalDialogState['mode']) {
    if (problems) {
      state.value = { ...(state.value ?? removalState(mode, { ...counts(), entries })), ...problems, progress: null, stoppable: false, finished: true }
      return
    }
    settle()
  }

  function settle() {
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
      if (state.value?.stoppable) controller.abort()
      return
    }
    const finished = state.value?.finished === true
    const settles = finished && !fromViewer
    close()
    if (settles) opts.onSettled?.()
    if (finished) undo.release()
  }

  function undoHeld() {
    if (!state.value?.finished || !undo.held.value) return
    settle()
    undo.runHeld()
  }

  function close() {
    request++
    state.value = null
    targets = []
    listed = []
    below = []
    entries = []
    fromViewer = false
  }

  return { state, open: computed(() => state.value !== null), trashing, askRemove, confirm, cancel, undoHeld, heldUndo: undo.held, undoNotice: undo.notice, dismissUndo: undo.dismiss }
}
