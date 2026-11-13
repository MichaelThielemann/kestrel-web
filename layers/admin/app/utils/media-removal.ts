import type { ReferenceTo } from '#kestrel-admin/types/api'
import type { BulkReport } from '../actions/mediaTrash'
import type { Translate } from '../actions/types'

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

/** The success toast after a bulk run, by count. */
export function countMessage(t: Translate, key: string, n: number): string {
  return n === 1 ? t(key) : t(`${key}Plural`, { n })
}
