import { defineAction, type ActionContext, type ActionStep } from '#kestrel-core/app/utils/actions'
import { apiErrorMessage } from '../composables/useApi'
import type { ApiRoute } from '../utils/capabilities'
import { defineUiStep } from './define'
import { inBlocks } from './mediaPrecheck'
import { dataReload } from './steps/route'
import type { UiStepName } from './step-names'
import type { RefreshPort, WithDeps } from './types'

/** An id the server left alone, with its reason: `not_found`, `not_trashed`, `referenced`. */
export interface BulkSkip { id: string; reason: string }

/** An id, or a folder path, whose request failed. */
export interface BulkFailure { id: string; message: string }

export interface BulkRename { id: string; from: string; to: string }

/** A folder whose trash request succeeded, with the ids it moved; `moved` is empty for a folder that held nothing to trash, which is then gone. */
export interface BulkFolder { path: string; moved: string[] }

/** The per-item outcome of a trash, restore, purge or empty run. */
export interface BulkReport {
  /** Ids in the target state afterwards, including those already there. */
  done: string[]
  /** The ids among `done` that were in the target state before the run. */
  unchanged: string[]
  skipped: BulkSkip[]
  failed: BulkFailure[]
  /** Restored items that came back under a new display name. */
  renamed: BulkRename[]
  /** The run stopped between two blocks because its signal aborted. */
  cancelled: boolean
  /** File ids and folder paths of the blocks never sent because the run stopped. */
  unsent: string[]
  folders: BulkFolder[]
}

/** What every trash action takes: blocks stop once `signal` aborts, `onProgress` hears the blocks sent and the total after each one, and `report` gets the outcome before the reload, so it arrives even when the reload fails. */
export interface BulkInput extends WithDeps {
  refresh?: RefreshPort
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
  report?: (report: BulkReport) => void
}

export interface TrashItemsInput extends BulkInput {
  fileIds: readonly string[]
  folderPaths: readonly string[]
}

export interface TrashIdsInput extends BulkInput {
  ids: readonly string[]
}

interface BulkAnswer { ids: string[]; unchanged?: string[]; skipped?: BulkSkip[]; renamed?: BulkRename[] }

interface BulkCall { route: ApiRoute; body?: Record<string, unknown>; ids: readonly string[]; folder?: string }

export function emptyBulkReport(): BulkReport {
  return { done: [], unchanged: [], skipped: [], failed: [], renamed: [], cancelled: false, unsent: [], folders: [] }
}

function bulkStep<I extends BulkInput>(name: UiStepName, calls: (ctx: ActionContext<I, BulkReport>) => BulkCall[]): ActionStep<I, BulkReport> {
  return defineUiStep<I, BulkReport>(name, async (ctx) => {
    const { deps, signal, onProgress } = ctx.input
    const report = emptyBulkReport()
    ctx.result = report
    const list = calls(ctx)
    for (const [index, call] of list.entries()) {
      if (signal?.aborted) {
        report.cancelled = true
        report.unsent.push(...list.slice(index).flatMap((c) => c.ids))
        break
      }
      try {
        const answer = await deps.api<BulkAnswer>(call.route, call.body ? { body: call.body } : undefined)
        const unchanged = answer.unchanged ?? []
        report.done.push(...answer.ids)
        report.unchanged.push(...unchanged)
        report.skipped.push(...(answer.skipped ?? []))
        report.renamed.push(...(answer.renamed ?? []))
        if (call.folder !== undefined) report.folders.push({ path: call.folder, moved: answer.ids.filter((id) => !unchanged.includes(id)) })
      } catch (e) {
        const message = apiErrorMessage(e)
        report.failed.push(...call.ids.map((id) => ({ id, message })))
      }
      onProgress?.(index + 1, list.length)
    }
    ctx.input.report?.(report)
  })
}

const reload = <I extends BulkInput>() => dataReload<I, BulkReport>()

/** Moves files, in blocks of 200 ids, and whole folders to the trash; a folder's failure is reported under its path. */
export const trashItems = defineAction<TrashItemsInput, BulkReport>({
  name: 'trashItems',
  steps: [
    bulkStep<TrashItemsInput>('media.trash', (ctx) => {
      const { capabilities } = ctx.input.deps
      return [
        ...inBlocks(ctx.input.fileIds).map((ids) => ({ route: capabilities.route('trashMedia'), body: { ids }, ids })),
        ...ctx.input.folderPaths.map((path) => ({ route: capabilities.route('trashMediaFolder', { path }), ids: [path], folder: path })),
      ]
    }),
    reload<TrashItemsInput>(),
  ],
})

/** Brings trashed items back, in blocks of 200 ids; a display name taken meanwhile is reported in `renamed`. */
export const restoreItems = defineAction<TrashIdsInput, BulkReport>({
  name: 'restoreItems',
  steps: [
    bulkStep<TrashIdsInput>('media.restore', (ctx) => inBlocks(ctx.input.ids).map((ids) => ({ route: ctx.input.deps.capabilities.route('restoreMedia'), body: { ids }, ids }))),
    reload<TrashIdsInput>(),
  ],
})

/** Deletes trashed items for good, in blocks of 200 ids; an item still in use stays in the trash as skipped `referenced`. */
export const purgeItems = defineAction<TrashIdsInput, BulkReport>({
  name: 'purgeItems',
  steps: [
    bulkStep<TrashIdsInput>('media.purge', (ctx) => inBlocks(ctx.input.ids).map((ids) => ({ route: ctx.input.deps.capabilities.route('purgeMedia'), body: { ids }, ids }))),
    reload<TrashIdsInput>(),
  ],
})

/** Deletes everything in the trash for good, except the items still in use. */
export const emptyTrash = defineAction<BulkInput, BulkReport>({
  name: 'emptyTrash',
  steps: [
    bulkStep<BulkInput>('media.emptyTrash', (ctx) => [{ route: ctx.input.deps.capabilities.route('emptyMediaTrash'), body: {}, ids: [''] }]),
    reload<BulkInput>(),
  ],
})
