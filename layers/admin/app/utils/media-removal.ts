import type { ReferenceTo } from '#kestrel-admin/types/api'
import type { BulkReport } from '../actions/mediaTrash'
import type { Translate } from '../actions/types'
import { emptyFoldersBelow } from './library'
import type { OpItem } from './ops'

/** What the removal dialog asks for: a final delete without a trash, a move to the trash of something in use or unverified, a final delete from the trash, or emptying it. */
export type RemovalMode = 'delete' | 'trash' | 'purge' | 'empty'

/** One file the removal dialog lists; `path` is null for an item without a public copy, which shows its type icon. */
export interface RemovalEntry { id: string; name: string; path: string | null; contentType?: string; refs: ReferenceTo[] }

/** An item that was not removed, with the reason in words. */
export interface RemovalProblem { id: string; name: string; reason: string }

export interface RemovalDialogState {
  mode: RemovalMode
  files: number
  folders: number
  entries: RemovalEntry[]
  /** The site tracks references, but whether these files are in use could not be checked. */
  unverified: boolean
  nonEmptyFolders: boolean
  /** Blocks sent so far; shown only when there is more than one. */
  progress: { done: number; total: number } | null
  failures: RemovalProblem[]
  skipped: RemovalProblem[]
  cancelled: boolean
  /** The run is over and the dialog only reports what was left. */
  finished: boolean
}

export function removalState(mode: RemovalMode, init: Partial<RemovalDialogState> = {}): RemovalDialogState {
  return { mode, files: 0, folders: 0, entries: [], unverified: false, nonEmptyFolders: false, progress: null, failures: [], skipped: [], cancelled: false, finished: false, ...init }
}

/** "3 files and 1 folder", "1 file", "2 folders". */
export function itemCountLabel(t: Translate, files: number, folders: number): string {
  const f = files === 1 ? t('media.remove.files') : t('media.remove.filesPlural', { n: files })
  const d = folders === 1 ? t('media.remove.folders') : t('media.remove.foldersPlural', { n: folders })
  if (files && folders) return t('media.remove.both', { files: f, folders: d })
  if (folders) return d
  return f
}

const REASON_KEYS: Record<string, string> = {
  referenced: 'media.trash.reason.referenced',
  not_found: 'media.trash.reason.notFound',
  not_trashed: 'media.trash.reason.notTrashed',
}

/** The failed and skipped items of a bulk report, named for the dialog. */
export function reportProblems(t: Translate, report: BulkReport, nameOf: (id: string) => string): Pick<RemovalDialogState, 'failures' | 'skipped' | 'cancelled'> {
  return {
    failures: report.failed.map((f) => ({ id: f.id, name: nameOf(f.id), reason: f.message })),
    skipped: report.skipped.map((s) => {
      const key = REASON_KEYS[s.reason]
      return { id: s.id, name: nameOf(s.id), reason: key ? t(key) : s.reason }
    }),
    cancelled: report.cancelled,
  }
}

/** A message about the outcome of a run, with the tone of a toast. */
export interface RunMessage { type: 'success' | 'info' | 'error'; message: string }

/** What a restore did, in words: how many came back, which were skipped and why, which failed and which came back under a new name. Says nothing about success when nothing came back. */
export function restoreMessages(t: Translate, report: BulkReport, nameOf: (id: string) => string): RunMessage[] {
  const problems = reportProblems(t, report, nameOf)
  const messages: RunMessage[] = []
  if (report.done.length) messages.push({ type: 'success', message: countMessage(t, 'media.trash.restored', report.done.length) })
  if (problems.skipped.length) messages.push({ type: 'info', message: t('media.trash.notRestored', { names: problems.skipped.map((p) => `${p.name} (${p.reason})`).join(', ') }) })
  if (problems.failures.length) messages.push({ type: 'error', message: t('media.trash.restoreFailed', { names: problems.failures.map((p) => p.name).join(', ') }) })
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
