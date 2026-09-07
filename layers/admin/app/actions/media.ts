import type { ApiErrorDetails, MediaFolder, MediaFolderRenameResponse, MediaItem, Provenance, ReferenceTo } from '#kestrel/types/api'
import { defineAction, defineStep, type ActionContext, type ActionStep } from '../../../core/app/utils/actions'
import { ApiError, apiErrorCode, apiErrorDetails, apiErrorMessage, apiErrorRetryable, apiErrorRunId, apiErrorStatus, retryableMessage, withRunId } from '../composables/useApi'
import type { UploadItem } from '../composables/useMediaUpload'
import { humanizeSize, joinFolder, parentFolder } from '../utils/library'
import type { OpItem } from '../utils/ops'
import { referencedBy } from '../utils/references'
import { apiEach, apiRequest, referencesPrecheck } from './steps/api'
import { dialogConfirm } from './steps/guard'
import { opsBusy, toastError, toastSuccess } from './steps/notify'
import { dataReload } from './steps/route'
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
}

export interface DeleteItemsResult {
  files: EachReport<unknown>
  folders: EachReport<unknown>
}

export interface PreviewMediaDeleteInput extends WithDeps {
  fileIds: readonly string[]
  allowed: boolean
}

export interface UploadInput extends WithDeps {
  item: UploadItem
  provenance?: Provenance
}

function encodeFolderPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
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
      call: (ctx) => ({ path: '/media/folders', method: 'POST', body: { path: ctx.input.path } }),
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
    return await deps.api<MediaFolderRenameResponse>(`/media/folders/${encodeFolderPath(path)}`, { method: 'PATCH', body: { path: to } })
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

const applyTargets = defineStep<RenameOrMoveInput, RenameOrMoveResult>('media.applyTargets', async (ctx) => {
  const { deps, target, ops } = ctx.input
  const result: RenameOrMoveResult = { moved: 0, failed: false, message: null, status: 0, code: '', retryable: false }
  ctx.result = result
  try {
    if (target.kind === 'file-rename') {
      await deps.api<MediaItem>(`/media/${encodeURIComponent(target.id)}`, { method: 'PATCH', body: { filename: target.filename } })
      result.moved = 1
    } else if (target.kind === 'folder-rename') {
      const parent = parentFolder(target.path) ?? ''
      const to = joinFolder(parent, target.name)
      const res = await patchFolder(deps, target.path, to)
      result.moved = res.moved
    } else {
      for (const item of target.targets) {
        if (item.type === 'file') {
          await deps.api<MediaItem>(`/media/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: { folder: target.dest } })
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

function reloadWhen<I extends { refresh: RefreshPort }, R>(name: string, hasItems: (ctx: ActionContext<I, R>) => boolean): ActionStep<I, R> {
  return defineStep<I, R>(name, async (ctx) => {
    if (hasItems(ctx)) await ctx.input.refresh()
  })
}

const reloadFilesIfAny = reloadWhen<DeleteItemsInput, DeleteItemsResult>('data.reload:files', (ctx) => ctx.input.files.length > 0)
const reloadFoldersIfAny = reloadWhen<DeleteItemsInput, DeleteItemsResult>('data.reload:folders', (ctx) => ctx.input.folderPaths.length > 0)

const filesDeletedGuard = defineStep<DeleteItemsInput, DeleteItemsResult>('guard.filesDeleted', (ctx) => {
  const report = ctx.result?.files
  if (report && report.failed) ctx.fail(report.lastMessage ?? 'guard.filesDeleted')
})

const foldersDeletedGuard = defineStep<DeleteItemsInput, DeleteItemsResult>('guard.foldersDeleted', (ctx) => {
  const report = ctx.result?.folders
  if (report && report.failed) ctx.fail(report.lastMessage ?? 'guard.foldersDeleted')
})

export const deleteItems = defineAction<DeleteItemsInput, DeleteItemsResult>({
  name: 'deleteItems',
  steps: [
    dialogConfirm<DeleteItemsInput, DeleteItemsResult>((ctx) => ctx.input.confirmed),
    opsBusy<DeleteItemsInput, DeleteItemsResult>(true),
    apiEach<DeleteItemsInput, DeleteItemsResult, unknown>('media.each:files', {
      items: (ctx) => ctx.input.files.map((f) => f.id),
      call: (ctx, id) => ({ path: `/media/${encodeURIComponent(id)}`, method: 'DELETE' }),
      policy: 'stop',
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
    reloadFilesIfAny,
    filesDeletedGuard,
    apiEach<DeleteItemsInput, DeleteItemsResult, unknown>('media.each:folders', {
      items: (ctx) => ctx.input.folderPaths,
      call: (ctx, path) => ({ path: `/media/folders/${encodeFolderPath(path)}`, method: 'DELETE', query: ctx.input.recursive ? { recursive: true } : undefined }),
      policy: 'stop',
      onItemError: (ctx, item) => {
        ctx.input.ops.setError?.(item.message ?? '')
      },
      onDone: (ctx, report) => {
        const files = ctx.result?.files ?? EMPTY_EACH_REPORT
        ctx.result = { files, folders: report }
      },
    }),
    reloadFoldersIfAny,
    foldersDeletedGuard,
    toastSuccess<DeleteItemsInput, DeleteItemsResult>((ctx) => {
      const n = ctx.input.files.length + ctx.input.folderPaths.length
      return n > 0 ? { key: 'media.deleted', params: { n } } : null
    }),
  ],
  always: [opsBusy<DeleteItemsInput, DeleteItemsResult>(false)],
})

export const previewDeleteItems = defineAction<PreviewMediaDeleteInput, ReferenceTo[]>({
  name: 'previewDeleteItems',
  steps: [
    referencesPrecheck<PreviewMediaDeleteInput, ReferenceTo[]>('references.precheck', {
      allowed: (ctx) => ctx.input.allowed,
      target: () => 'media',
      ids: (ctx) => ctx.input.fileIds,
      onError: 'skip',
      onDone: (ctx, report) => {
        ctx.result = report.forbidden ? [] : [...report.byId.values()].flat()
      },
    }),
  ],
})

function provenanceField(p: Provenance | undefined): string {
  return JSON.stringify({ origin: p?.origin ?? 'human', ...(p?.tool ? { tool: p.tool } : {}), ...(p?.model ? { model: p.model } : {}) })
}

const humanizeByteCounts = (message: string) => message.replace(/(\d+) bytes/g, (_, n: string) => humanizeSize(Number(n)))

function uploadMessage(t: Translate, code: string, message: string): string {
  const detail = humanizeByteCounts(message)
  if (code === 'PAYLOAD_TOO_LARGE') return t('media.uploadTooLarge', { detail })
  if (code === 'UNSUPPORTED') return t('media.uploadUnsupported', { detail })
  return detail
}

function buildUploadBody(item: UploadItem, provenance: Provenance | undefined): FormData {
  const fd = new FormData()
  fd.append('file', item.file)
  if (item.folder) fd.append('folder', item.folder)
  fd.append('provenance', provenanceField(provenance))
  return fd
}

const uploadBegin = defineStep<UploadInput, UploadItem>('upload.begin', (ctx) => {
  ctx.input.item.status = 'uploading'
})

const uploadSettle = defineStep<UploadInput, UploadItem>('upload.settle', (ctx) => {
  ctx.result = ctx.input.item
})

export const upload = defineAction<UploadInput, UploadItem>({
  name: 'upload',
  steps: [
    uploadBegin,
    apiRequest<UploadInput, UploadItem, MediaItem>('api.request', {
      call: (ctx) => ({ path: '/media', method: 'POST', body: buildUploadBody(ctx.input.item, ctx.input.provenance) }),
      onSuccess: (ctx) => { ctx.input.item.status = 'done' },
      onError: (ctx, err) => {
        ctx.input.item.status = 'error'
        if (err.code !== 'UNAUTHENTICATED') ctx.input.item.message = uploadMessage(ctx.input.deps.t, err.code, err.message)
      },
    }),
    uploadSettle,
  ],
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
      call: (ctx) => ({ path: `/media/${encodeURIComponent(ctx.input.id)}`, method: 'PATCH', body: { locale: ctx.input.locale, ...ctx.input.fields } }),
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
      call: (ctx) => ({ path: `/media/${encodeURIComponent(ctx.input.id)}`, method: 'PATCH', body: { provenance: ctx.input.provenance } }),
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
