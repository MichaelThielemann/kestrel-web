import type { ApiErrorDetails, MediaFolder, MediaFolderRenameResponse, MediaItem, Provenance } from '#kestrel-admin/types/api'
import { defineAction, type ActionContext, type ActionStep } from '#kestrel-core/app/utils/actions'
import { ApiError, apiErrorCode, apiErrorDetails, apiErrorMessage, apiErrorRetryable, apiErrorRunId, apiErrorStatus, retryableMessage, withRunId } from '../composables/useApi'
import type { UploadItem } from '../composables/useMediaUpload'
import { UploadTransportError, type UploadProgress, type UploadTransport } from '../composables/useUploadTransport'
import { humanizeSize, joinFolder, parentFolder } from '../utils/library'
import type { OpItem } from '../utils/ops'
import { referencedBy } from '../utils/references'
import { defineUiStep } from './define'
import { apiEach, apiRequest } from './steps/api'
import { dialogConfirm } from './steps/guard'
import { opsBusy, toastError, toastSuccess } from './steps/notify'
import { dataReload } from './steps/route'
import type { UiStepName } from './step-names'
import type { ActionDeps, BusyPort, EachReport, RefreshPort, Translate, WithDeps } from './types'

export interface CreateFolderInput extends WithDeps {
  path: string
  ops: BusyPort
  refresh: RefreshPort
}

export type RenameOrMoveTarget =
  | { kind: 'file-rename', id: string, filename: string }
  | { kind: 'folder-rename', path: string, name: string }
  | { kind: 'move', targets: readonly OpItem[], dest: string }

export interface RenameOrMoveInput extends WithDeps {
  target: RenameOrMoveTarget
  notify: 'inline' | 'toast'
  ops: BusyPort
  refresh: RefreshPort
}

export interface RenameOrMoveResult {
  moved: number
  failed: boolean
  message: string | null
  status: number
  code: string
  retryable: boolean
  runId?: string
  details?: ApiErrorDetails
}

export interface DeleteItemsInput extends WithDeps {
  files: readonly MediaItem[]
  folderPaths: readonly string[]
  recursive: boolean
  confirmed: boolean
  ops: BusyPort
  refresh: RefreshPort
  /** Receives the per-item report once every item was tried, also when some failed. */
  report?: (result: DeleteItemsResult) => void
}

export interface DeleteItemsResult {
  files: EachReport<unknown>
  folders: EachReport<unknown>
}

export interface UploadInput extends WithDeps {
  item: UploadItem
  provenance?: Provenance
  transport: UploadTransport
  signal?: AbortSignal
}

function mapFolderError(code: string, message: string, t: Translate): string {
  if (code === 'NOT_FOUND') return t('media.folderNotFound')
  if (code === 'CONFLICT') return t('media.folderConflict')
  return message
}

export const createFolder = defineAction<CreateFolderInput, MediaFolder>({
  name: 'createFolder',
  steps: [
    opsBusy<CreateFolderInput, MediaFolder>(true),
    apiRequest<CreateFolderInput, MediaFolder, MediaFolder>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('createMediaFolder'), body: { path: ctx.input.path } }),
      onSuccess: (ctx, value) => { ctx.result = value },
      onError: (ctx, err) => {
        const message = mapFolderError(err.code, err.message, ctx.input.deps.t)
        ctx.input.ops.setError?.(message)
        ctx.fail(message)
      },
    }),
    dataReload<CreateFolderInput, MediaFolder>(),
  ],
  always: [opsBusy<CreateFolderInput, MediaFolder>(false)],
})

async function patchFolder(deps: ActionDeps, path: string, to: string): Promise<MediaFolderRenameResponse> {
  try {
    return await deps.api<MediaFolderRenameResponse>(deps.capabilities.route('renameMediaFolder', { path }), { body: { path: to } })
  } catch (e) {
    throw new ApiError(
      apiErrorStatus(e),
      mapFolderError(apiErrorCode(e), apiErrorMessage(e), deps.t),
      apiErrorCode(e),
      apiErrorRetryable(e),
      apiErrorRunId(e),
      undefined,
      apiErrorDetails(e),
    )
  }
}

const applyTargets = defineUiStep<RenameOrMoveInput, RenameOrMoveResult>('media.applyTargets', async (ctx) => {
  const { deps, target, ops } = ctx.input
  const result: RenameOrMoveResult = { moved: 0, failed: false, message: null, status: 0, code: '', retryable: false }
  ctx.result = result
  try {
    if (target.kind === 'file-rename') {
      await deps.api<MediaItem>(deps.capabilities.route('updateMedia', { id: target.id }), { body: { filename: target.filename } })
      result.moved = 1
    } else if (target.kind === 'folder-rename') {
      const parent = parentFolder(target.path) ?? ''
      const to = joinFolder(parent, target.name)
      const res = await patchFolder(deps, target.path, to)
      result.moved = res.moved
    } else {
      for (const item of target.targets) {
        if (item.type === 'file') {
          await deps.api<MediaItem>(deps.capabilities.route('updateMedia', { id: item.id }), { body: { folder: target.dest } })
          result.moved++
          continue
        }
        if (target.dest === item.path || target.dest.startsWith(`${item.path}/`)) continue
        const name = item.path.slice(item.path.lastIndexOf('/') + 1)
        const to = joinFolder(target.dest, name)
        if (to === item.path) continue
        await patchFolder(deps, item.path, to)
        result.moved++
      }
    }
  } catch (e) {
    const message = apiErrorMessage(e)
    result.failed = true
    result.message = message
    result.status = apiErrorStatus(e)
    result.code = apiErrorCode(e)
    result.retryable = apiErrorRetryable(e)
    result.runId = apiErrorRunId(e)
    result.details = apiErrorDetails(e)
    ops.setError?.(withRunId(result.retryable ? retryableMessage(deps.t, result.details) : message, result.status, result.runId))
    ctx.fail(message)
  }
})

export const renameOrMove = defineAction<RenameOrMoveInput, RenameOrMoveResult>({
  name: 'renameOrMove',
  steps: [
    opsBusy<RenameOrMoveInput, RenameOrMoveResult>(true),
    applyTargets,
    dataReload<RenameOrMoveInput, RenameOrMoveResult>(),
  ],
  always: [
    opsBusy<RenameOrMoveInput, RenameOrMoveResult>(false),
    toastError<RenameOrMoveInput, RenameOrMoveResult>((ctx) =>
      (ctx.input.notify === 'toast' && ctx.result?.message
        ? { message: ctx.result.message, status: ctx.result.status, runId: ctx.result.runId, retryable: ctx.result.retryable, details: ctx.result.details }
        : null)),
  ],
})

const EMPTY_EACH_REPORT: EachReport<unknown> = { results: [], succeeded: 0, failed: 0, lastMessage: null, firstFailure: null }

function reloadWhen<I extends { refresh: RefreshPort }, R>(name: UiStepName, hasItems: (ctx: ActionContext<I, R>) => boolean): ActionStep<I, R> {
  return defineUiStep<I, R>(name, async (ctx) => {
    if (hasItems(ctx)) await ctx.input.refresh()
  })
}

const reloadIfAny = reloadWhen<DeleteItemsInput, DeleteItemsResult>('data.reload:media', (ctx) => ctx.input.files.length + ctx.input.folderPaths.length > 0)

const filesDeletedGuard = defineUiStep<DeleteItemsInput, DeleteItemsResult>('guard.filesDeleted', (ctx) => {
  const report = ctx.result?.files
  if (report && report.failed) ctx.fail(report.lastMessage ?? 'guard.filesDeleted')
})

const foldersDeletedGuard = defineUiStep<DeleteItemsInput, DeleteItemsResult>('guard.foldersDeleted', (ctx) => {
  const report = ctx.result?.folders
  if (report && report.failed) ctx.fail(report.lastMessage ?? 'guard.foldersDeleted')
})

/** Deletes files and folders for good, one request each: every item is tried, the library reloads once at the end, and the per-item report goes to `report` before a failure fails the action. */
export const deleteItems = defineAction<DeleteItemsInput, DeleteItemsResult>({
  name: 'deleteItems',
  steps: [
    dialogConfirm<DeleteItemsInput, DeleteItemsResult>((ctx) => ctx.input.confirmed),
    opsBusy<DeleteItemsInput, DeleteItemsResult>(true),
    apiEach<DeleteItemsInput, DeleteItemsResult, unknown>('media.each:files', {
      items: (ctx) => ctx.input.files.map((f) => f.id),
      call: (ctx, id) => ({ route: ctx.input.deps.capabilities.route('deleteMedia', { id }) }),
      policy: 'continue',
      onItemError: (ctx, item) => {
        if (item.code === 'CONFLICT') {
          const refs = referencedBy(item.details, item.message ?? '')
          if (refs.length > 0) {
            ctx.input.ops.setConflict?.(refs)
            return
          }
        }
        const file = ctx.input.files.find((f) => f.id === item.id)
        ctx.input.ops.setError?.(ctx.input.deps.t('media.deleteBlocked', { name: file?.filename ?? item.id, reason: item.message }))
      },
      onDone: (ctx, report) => {
        ctx.result = { files: report, folders: EMPTY_EACH_REPORT }
      },
    }),
    apiEach<DeleteItemsInput, DeleteItemsResult, unknown>('media.each:folders', {
      items: (ctx) => ctx.input.folderPaths,
      call: (ctx, path) => ({ route: ctx.input.deps.capabilities.route('deleteMediaFolder', { path }), query: ctx.input.recursive ? { recursive: true } : undefined }),
      policy: 'continue',
      onItemError: (ctx, item) => {
        ctx.input.ops.setError?.(item.message ?? '')
      },
      onDone: (ctx, report) => {
        const result = { files: ctx.result?.files ?? EMPTY_EACH_REPORT, folders: report }
        ctx.result = result
        ctx.input.report?.(result)
      },
    }),
    reloadIfAny,
    filesDeletedGuard,
    foldersDeletedGuard,
    toastSuccess<DeleteItemsInput, DeleteItemsResult>((ctx) => {
      const n = ctx.input.files.length + ctx.input.folderPaths.length
      return n > 0 ? { key: 'media.deleted', params: { n } } : null
    }),
  ],
  always: [opsBusy<DeleteItemsInput, DeleteItemsResult>(false)],
})

function provenanceField(p: Provenance | undefined): string {
  return JSON.stringify({ origin: p?.origin ?? 'human', ...(p?.tool ? { tool: p.tool } : {}), ...(p?.model ? { model: p.model } : {}) })
}

const humanizeByteCounts = (message: string) => message.replace(/(\d+) bytes/g, (_, n: string) => humanizeSize(Number(n)))

const UPSTREAM_MESSAGE_KEYS: Record<string, string> = {
  PAYLOAD_TOO_LARGE: 'media.upload.rejectedTooLarge',
  TIMEOUT: 'media.upload.timeout',
  UNAVAILABLE: 'media.upload.unavailable',
}

function upstreamMessage(t: Translate, e: UploadTransportError): string {
  if (e.code === 'NETWORK') return t('media.upload.network')
  const message = t(UPSTREAM_MESSAGE_KEYS[e.code] ?? 'media.uploadFailedReason')
  return e.status > 0 ? t('media.upload.httpStatus', { message, status: e.status }) : message
}

const MODULE_PREFIX = /^[\w-]+\/[\w-]+:\s*/

function tooLargeMessage(t: Translate, message: string, file: File): string {
  const limit = /\bfile exceeds (\d+) bytes/.exec(message)?.[1]
  if (limit) return t('media.upload.tooLargeShort', { size: humanizeSize(file.size), limit: humanizeSize(Number(limit)) })
  return t('media.uploadTooLarge', { detail: humanizeSize(file.size) })
}

function unsupportedMessage(t: Translate, message: string, file: File): string {
  const type = /\btype "([^"]+)"/.exec(message)?.[1] ?? file.type
  return type ? t('media.uploadUnsupported', { detail: type }) : t('media.upload.unsupported')
}

function uploadMessage(t: Translate, e: unknown, file: File): string {
  const code = apiErrorCode(e)
  if (code === 'UNAUTHENTICATED') return t('media.upload.sessionExpired')
  if (e instanceof UploadTransportError) return upstreamMessage(t, e)
  const message = apiErrorMessage(e)
  if (code === 'PAYLOAD_TOO_LARGE') return tooLargeMessage(t, message, file)
  if (code === 'UNSUPPORTED') return unsupportedMessage(t, message, file)
  const detail = humanizeByteCounts(message.replace(MODULE_PREFIX, ''))
  return detail ? t('media.upload.failedDetail', { detail }) : t('media.uploadFailedReason')
}

function buildUploadBody(item: UploadItem, provenance: Provenance | undefined): FormData {
  const fd = new FormData()
  fd.append('file', item.file)
  if (item.folder) fd.append('folder', item.folder)
  fd.append('provenance', provenanceField(provenance))
  return fd
}

const UPLOAD_TIMEOUT_BASE_MS = 120_000
const UPLOAD_MIN_BYTES_PER_SECOND = 32 * 1024

/**
 * How long one upload request may take before it fails with `TIMEOUT`: two minutes for kestrel to store and
 * process the file, plus the time to send it at 32 KiB/s, a floor below which an upload would not finish anyway.
 */
export function uploadTimeoutMs(bytes: number): number {
  return UPLOAD_TIMEOUT_BASE_MS + Math.ceil((bytes * 1000) / UPLOAD_MIN_BYTES_PER_SECOND)
}

const uploadBegin = defineUiStep<UploadInput, UploadItem>('upload.begin', (ctx) => {
  const { item } = ctx.input
  item.status = 'uploading'
  item.progress = 0
  item.message = undefined
  item.code = undefined
})

const uploadRequest = defineUiStep<UploadInput, UploadItem>('upload.request', async (ctx) => {
  const { item, provenance, transport, signal, deps } = ctx.input
  const onProgress = (progress: UploadProgress) => {
    item.progress = progress.percent
    item.totalKnown = progress.total > 0
    if (progress.percent >= 100 && item.status === 'uploading') item.status = 'processing'
  }
  try {
    item.result = await transport<MediaItem>(deps.capabilities.route('uploadMedia'), buildUploadBody(item, provenance), { onProgress, signal, timeoutMs: uploadTimeoutMs(item.file.size) })
    item.status = 'done'
    item.progress = 100
  } catch (e) {
    item.code = apiErrorCode(e)
    if (item.code === 'ABORTED') {
      item.status = 'cancelled'
      item.message = deps.t('media.upload.cancelled')
      return
    }
    item.status = 'failed'
    item.message = uploadMessage(deps.t, e, item.file)
  }
})

const uploadSettle = defineUiStep<UploadInput, UploadItem>('upload.settle', (ctx) => {
  ctx.result = ctx.input.item
})

export const upload = defineAction<UploadInput, UploadItem>({
  name: 'upload',
  steps: [uploadBegin, uploadRequest, uploadSettle],
})

export interface SetMediaMetaInput extends WithDeps {
  id: string
  locale: string
  fields: { alt?: string | null, title?: string | null, description?: string | null }
  ops: BusyPort
  refresh: RefreshPort
}

export interface SetMediaProvenanceInput extends WithDeps {
  id: string
  provenance: Provenance
  ops: BusyPort
  refresh: RefreshPort
}

export const setMediaMeta = defineAction<SetMediaMetaInput, MediaItem>({
  name: 'setMediaMeta',
  steps: [
    opsBusy<SetMediaMetaInput, MediaItem>(true),
    apiRequest<SetMediaMetaInput, MediaItem, MediaItem>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('updateMedia', { id: ctx.input.id }), body: { locale: ctx.input.locale, ...ctx.input.fields } }),
      onSuccess: (ctx, value) => { ctx.result = value },
      onError: (ctx, err) => {
        ctx.input.ops.setError?.(err.message)
        ctx.fail(err.message)
      },
    }),
    dataReload<SetMediaMetaInput, MediaItem>(),
  ],
  always: [opsBusy<SetMediaMetaInput, MediaItem>(false)],
})

export const setMediaProvenance = defineAction<SetMediaProvenanceInput, MediaItem>({
  name: 'setMediaProvenance',
  steps: [
    opsBusy<SetMediaProvenanceInput, MediaItem>(true),
    apiRequest<SetMediaProvenanceInput, MediaItem, MediaItem>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('updateMedia', { id: ctx.input.id }), body: { provenance: ctx.input.provenance } }),
      onSuccess: (ctx, value) => { ctx.result = value },
      onError: (ctx, err) => {
        ctx.input.ops.setError?.(err.message)
        ctx.fail(err.message)
      },
    }),
    dataReload<SetMediaProvenanceInput, MediaItem>(),
  ],
  always: [opsBusy<SetMediaProvenanceInput, MediaItem>(false)],
})
