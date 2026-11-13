import type { ReferenceTo } from '#kestrel-admin/types/api'
import type { BulkFailure, BulkReport } from '../actions/mediaTrash'
import { FAILURE_TOAST_MS } from '../actions/steps/notify'
import type { Translate } from '../actions/types'
import { answeredMessage, failureText } from '../composables/useApi'
import { emptyFoldersBelow } from './library'
import type { OpItem } from './ops'

/** What the removal dialog asks for: a final delete without a trash, a move to the trash of something in use or unverified, a final delete from the trash, or emptying it. */
export type RemovalMode = 'delete' | 'trash' | 'purge' | 'empty'

/** One file the removal dialog lists; `path` is null for an item without a public copy, which shows its type icon. */
export interface RemovalEntry { id: string; name: string; path: string | null; contentType?: string; refs: ReferenceTo[] }

/** An item that was not removed, with the reason in words; `gone` marks one that no longer existed, which needs no action, and `requestId` is the error id of a failed request, offered to copy. */
export interface RemovalProblem { id: string; name: string; reason: string; gone?: boolean; requestId?: string }

export interface RemovalDialogState {
  mode: RemovalMode
  files: number
  folders: number
  entries: RemovalEntry[]
  /** The site tracks references, but whether these files are in use could not be checked. */
  unverified: boolean
  /** Why the check failed, with the HTTP status and the error id of its request; null when no request failed. */
  checkFailure: string | null
  nonEmptyFolders: boolean
  /** Blocks sent so far; shown only when there is more than one. */
  progress: { done: number; total: number } | null
  /** A stop can still take effect: the run has another request to send after the one under way. */
  stoppable: boolean
  failures: RemovalProblem[]
  skipped: RemovalProblem[]
  cancelled: boolean
  /** The run is over and the dialog only reports what was left. */
  finished: boolean
}

export function removalState(mode: RemovalMode, init: Partial<RemovalDialogState> = {}): RemovalDialogState {
  return { mode, files: 0, folders: 0, entries: [], unverified: false, checkFailure: null, nonEmptyFolders: false, progress: null, stoppable: false, failures: [], skipped: [], cancelled: false, finished: false, ...init }
}

/** "3 files and 1 folder", "1 file", "2 folders". */
export function itemCountLabel(t: Translate, files: number, folders: number): string {
  const f = files === 1 ? t('media.remove.files') : t('media.remove.filesPlural', { n: files })
  const d = folders === 1 ? t('media.remove.folders') : t('media.remove.foldersPlural', { n: folders })
  if (files && folders) return t('media.remove.both', { files: f, folders: d })
  if (folders) return d
  return f
}

const NOT_FOUND = 'not_found'

const REASON_KEYS: Record<string, string> = {
  referenced: 'media.trash.reason.referenced',
  [NOT_FOUND]: 'media.trash.reason.notFound',
  not_trashed: 'media.trash.reason.notTrashed',
}

function skippedProblems(t: Translate, report: BulkReport, nameOf: (id: string) => string): RemovalProblem[] {
  return report.skipped.map((s) => {
    const key = REASON_KEYS[s.reason]
    return { id: s.id, name: nameOf(s.id), reason: key ? t(key) : s.reason, ...(s.reason === NOT_FOUND ? { gone: true } : {}) }
  })
}

/** The text of a failed bulk request: `lead` and the message of the answer, with the HTTP status and the error id, see `failureText`. */
export function bulkFailureText(t: Translate, failure: BulkFailure, lead: string): string {
  return failureText(t, answeredMessage(t, failure, lead), failure)
}

/** The failed and skipped items of a bulk report, named for the dialog; `leadKey` says what failed for every failed item. */
export function reportProblems(t: Translate, report: BulkReport, nameOf: (id: string) => string, leadKey: string): Pick<RemovalDialogState, 'failures' | 'skipped' | 'cancelled'> {
  return {
    failures: report.failed.map((f) => ({ id: f.id, name: nameOf(f.id), reason: bulkFailureText(t, f, t(leadKey)), ...(f.requestId ? { requestId: f.requestId } : {}) })),
    skipped: skippedProblems(t, report, nameOf),
    cancelled: report.cancelled,
  }
}

/** The ids a removal skipped because they no longer existed. */
export function goneIds(report: BulkReport): string[] {
  return report.skipped.filter((s) => s.reason === NOT_FOUND).map((s) => s.id)
}

/** Whether a removal left something to report: a failure, a stop, or a skipped item that still exists. */
export function hasProblems(problems: Pick<RemovalDialogState, 'failures' | 'skipped' | 'cancelled'>): boolean {
  return problems.failures.length > 0 || problems.cancelled || problems.skipped.some((p) => !p.gone)
}

/** A message about the outcome of a run, with the tone of a toast; `timeout` overrides how long its toast stays. */
export interface RunMessage { type: 'success' | 'info' | 'error'; message: string; timeout?: number }

function restoreFailures(t: Translate, failed: readonly BulkFailure[], nameOf: (id: string) => string): RunMessage[] {
  const byRequest = new Map<string, BulkFailure[]>()
  for (const f of failed) {
    const key = f.requestId ?? f.runId ?? `${f.status} ${f.message}`
    byRequest.set(key, [...(byRequest.get(key) ?? []), f])
  }
  return [...byRequest.values()].flatMap((group) => {
    const first = group[0]
    if (!first) return []
    const message = bulkFailureText(t, first, t('media.trash.restoreFailed', { names: group.map((f) => nameOf(f.id)).join(', ') }))
    return [{ type: 'error' as const, message, ...(first.requestId ?? first.runId ? { timeout: FAILURE_TOAST_MS } : {}) }]
  })
}

/** What a restore did, in words: how many came back, which were skipped and why, which failed with the HTTP status and the error id of their request, and which came back under a new name. Says nothing about success when nothing came back. A failure that names an error id stays until it is dismissed. */
export function restoreMessages(t: Translate, report: BulkReport, nameOf: (id: string) => string): RunMessage[] {
  const skipped = skippedProblems(t, report, nameOf)
  const messages: RunMessage[] = []
  if (report.done.length) messages.push({ type: 'success', message: countMessage(t, 'media.trash.restored', report.done.length) })
  if (skipped.length) messages.push({ type: 'info', message: t('media.trash.notRestored', { names: skipped.map((p) => `${p.name} (${p.reason})`).join(', ') }) })
  messages.push(...restoreFailures(t, report.failed, nameOf))
  if (report.renamed.length) messages.push({ type: 'info', message: t('media.trash.renamed', { names: report.renamed.map((rn) => `${rn.from} → ${rn.to}`).join(', ') }) })
  return messages
}

/** The success toast after a bulk run, by count. */
export function countMessage(t: Translate, key: string, n: number): string {
  return n === 1 ? t(key) : t(`${key}Plural`, { n })
}

/** What a trash run did to its targets: `moved` targets are in the trash, `emptied` folders held nothing to trash and are gone, and `undoIds` are the ids the run moved, which an undo brings back. */
export interface TrashOutcome { moved: number; emptied: number; undoIds: string[] }

/** Reads a trash report against its targets; `counts` are the folder counts from before the run. */
export function trashOutcome(targets: readonly OpItem[], report: BulkReport, counts: Map<string, number>): TrashOutcome {
  const done = new Set(report.done)
  const unchanged = new Set(report.unchanged)
  const folders = new Map(report.folders.map((f) => [f.path, f.moved]))
  let moved = 0
  let emptied = 0
  for (const target of targets) {
    if (target.type === 'file') {
      if (done.has(target.id)) moved++
      continue
    }
    const ids = folders.get(target.path)
    if (ids === undefined) continue
    if (ids.length) moved++
    else emptied++
    emptied += emptyFoldersBelow(target.path, counts).length
  }
  return { moved, emptied, undoIds: report.done.filter((id) => !unchanged.has(id)) }
}
