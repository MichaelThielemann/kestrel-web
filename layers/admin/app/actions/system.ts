import type { EventRelayStatus, EventsRetryResult, ImagesJob, ImagesPruneResult, ImagesRetryFailedResult, ImagesStatus, MediaExportReport, MediaReconcileReport, MediaRepairPublicReport, MigrationsApplyResult, MigrationsDryRunResult, PublishAllReport, RebuildReport, ReplicationRestoreResult, ReplicationSnapshotResult, RetryStaleReport, UserDeleteResponse, UserReassignTarget } from '#kestrel-admin/types/api'
import { defineAction, type ActionContext, type ActionStep } from '#kestrel-core/app/utils/actions'
import { apiErrorCode, apiErrorMessage, apiErrorRunId, apiErrorStatus, withRunId } from '../composables/useApi'
import { humanizeSize } from '../utils/library'
import { staleCountText } from '../utils/stale-messages'
import { userErrorMessage } from '../utils/user-errors'
import type { UserOperation } from '../utils/user-errors'
import { defineUiStep } from './define'
import { apiRequest } from './steps/api'
import { dialogConfirm, guardSelection } from './steps/guard'
import { opsBusy } from './steps/notify'
import { dataReload } from './steps/route'
import type { ApiCall, BusyPort, RefreshPort, WithDeps } from './types'

export interface PublishAllInput extends WithDeps { ops: BusyPort }
export interface RetryStaleInput extends WithDeps { ops: BusyPort }
export interface ExportMediaInput extends WithDeps { ops: BusyPort }

export interface SnapshotInput extends WithDeps {
  ops: BusyPort
  onNotFound: () => void
  refresh: RefreshPort
}

export type RestoreTarget = { generation: string } | { at: number }

export interface RestoreInput extends WithDeps {
  point: RestoreTarget | null
  ops: BusyPort
  refresh: RefreshPort
}

export interface MigrationsDryRunInput extends WithDeps { ops: BusyPort }

export interface MigrationsApplyInput extends WithDeps {
  confirmed: boolean
  ops: BusyPort
  refresh: RefreshPort
}

export interface UserCreateInput extends WithDeps {
  username: string
  password: string
  passwordConfirm: string
  roles: string[]
  ops: BusyPort
  refresh: RefreshPort
}

export interface UserToggleInput extends WithDeps {
  userId: string
  active: boolean
  ops: BusyPort
  refresh: RefreshPort
}

export interface UserSnapshot {
  username: string
  roles: readonly string[]
  active: boolean
}

export interface UserUpdateInput extends WithDeps {
  userId: string
  username: string
  roles: readonly string[]
  active: boolean
  password: string
  passwordConfirm: string
  initial: UserSnapshot
  ops: BusyPort
  refresh: RefreshPort
}

export interface UserDeleteInput extends WithDeps {
  userId: string
  reassignTo: string | null
  confirmed: boolean
  ops: BusyPort
  refresh: RefreshPort
}

export interface UserDeleteOutcome {
  reassignTo: UserReassignTarget | null
  events: EventRelayStatus | null
}

export interface ReferencesRebuildInput extends WithDeps {
  ops: BusyPort
  refresh: RefreshPort
}

export interface LinksRebuildInput extends WithDeps {
  ops: BusyPort
  refresh: RefreshPort
}

export type PreviewPruneInput = WithDeps

export interface PrunePreview { sizes: string[], variants: number }

export interface ImagesPruneInput extends WithDeps {
  sizes: readonly string[]
  confirmed: boolean
  ops: BusyPort
  refresh: RefreshPort
}

export interface ImagesRetryFailedInput extends WithDeps {
  variants: number
  confirmed: boolean
  ops: BusyPort
  refresh: RefreshPort
}

export interface MediaReconcileInput extends WithDeps {
  ops: BusyPort
}

export interface RepairPublicMediaInput extends WithDeps { ops: BusyPort }

export interface MediaReconcileDeleteInput extends WithDeps {
  orphans: number
  confirmed: boolean
  ops: BusyPort
}

export interface DeclaredImageSize {
  name: string
  width: number
  height?: number
  fit: 'inside' | 'cover'
  format: 'webp'
  quality: number
}

export interface ImagesRegisterInput extends WithDeps {
  sizes: readonly DeclaredImageSize[]
  ops: BusyPort
  refresh: RefreshPort
}

export interface EventsRetryAllInput extends WithDeps {
  ops: BusyPort
  refresh: RefreshPort
  count: number
}

export interface EventsRetryOneInput extends WithDeps {
  ops: BusyPort
  refresh: RefreshPort
  id: string
}

export const publishAll = defineAction<PublishAllInput, PublishAllReport>({
  name: 'publishAll',
  steps: [
    opsBusy<PublishAllInput, PublishAllReport>(true),
    apiRequest<PublishAllInput, PublishAllReport, PublishAllReport>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('publishAllPages') }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(staleCountText(ctx.input.deps.t, 'queued', value.marked))
      },
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(err.message ? withRunId(err.message, err.status, err.runId) : ctx.input.deps.t('delivery.failed'))
        ctx.fail(err.message || 'delivery.failed')
      },
    }),
  ],
  always: [opsBusy<PublishAllInput, PublishAllReport>(false)],
})

export const retryStale = defineAction<RetryStaleInput, RetryStaleReport>({
  name: 'retryStale',
  steps: [
    opsBusy<RetryStaleInput, RetryStaleReport>(true),
    apiRequest<RetryStaleInput, RetryStaleReport, RetryStaleReport>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('retryStalePages') }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(staleCountText(ctx.input.deps.t, 'retried', value.retried))
      },
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(err.message ? withRunId(err.message, err.status, err.runId) : ctx.input.deps.t('delivery.failed'))
        ctx.fail(err.message || 'delivery.failed')
      },
    }),
  ],
  always: [opsBusy<RetryStaleInput, RetryStaleReport>(false)],
})

export const exportMedia = defineAction<ExportMediaInput, MediaExportReport>({
  name: 'exportMedia',
  steps: [
    opsBusy<ExportMediaInput, MediaExportReport>(true),
    apiRequest<ExportMediaInput, MediaExportReport, MediaExportReport>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('exportMedia') }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(ctx.input.deps.t('delivery.exportDone', {
          written: value.written,
          skipped: value.skipped,
          missing: value.missing,
          conflicts: value.conflicts,
          variantsWritten: value.variants.written,
          variantsSkipped: value.variants.skipped,
        }))
      },
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(err.message ? withRunId(err.message, err.status, err.runId) : ctx.input.deps.t('delivery.exportFailed'))
        ctx.fail(err.message || 'delivery.exportFailed')
      },
    }),
  ],
  always: [opsBusy<ExportMediaInput, MediaExportReport>(false)],
})

export const replicationSnapshot = defineAction<SnapshotInput, ReplicationSnapshotResult>({
  name: 'replicationSnapshot',
  steps: [
    opsBusy<SnapshotInput, ReplicationSnapshotResult>(true),
    apiRequest<SnapshotInput, ReplicationSnapshotResult, ReplicationSnapshotResult>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('replicationSnapshot') }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(ctx.input.deps.t('replication.snapshotDone', { bytes: humanizeSize(value.bytes) }))
      },
      onError: (ctx, err) => {
        if (err.code === 'NOT_FOUND') ctx.input.onNotFound()
        else ctx.input.deps.toast.error(withRunId(err.message, err.status, err.runId))
        ctx.fail(err.message || 'replication.snapshotFailed')
      },
    }),
    dataReload<SnapshotInput, ReplicationSnapshotResult>(),
  ],
  always: [opsBusy<SnapshotInput, ReplicationSnapshotResult>(false)],
})

export const replicationRestore = defineAction<RestoreInput, ReplicationRestoreResult>({
  name: 'replicationRestore',
  steps: [
    dialogConfirm<RestoreInput, ReplicationRestoreResult>((ctx) => ctx.input.point !== null),
    opsBusy<RestoreInput, ReplicationRestoreResult>(true),
    apiRequest<RestoreInput, ReplicationRestoreResult, ReplicationRestoreResult>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('replicationRestore'), body: ctx.input.point ?? undefined }),
      onSuccess: (ctx, value) => { ctx.result = value },
      onError: (ctx, err) => {
        if (err.code === 'NOT_FOUND') ctx.input.deps.toast.error(ctx.input.deps.t('replication.restoreNotFound'))
        else ctx.input.deps.toast.error(withRunId(err.message, err.status, err.runId))
        ctx.fail(err.message || 'replication.restoreFailed')
      },
    }),
    dataReload<RestoreInput, ReplicationRestoreResult>(),
  ],
  always: [opsBusy<RestoreInput, ReplicationRestoreResult>(false)],
})

export const migrationsDryRun = defineAction<MigrationsDryRunInput, MigrationsDryRunResult>({
  name: 'migrationsDryRun',
  steps: [
    opsBusy<MigrationsDryRunInput, MigrationsDryRunResult>(true),
    apiRequest<MigrationsDryRunInput, MigrationsDryRunResult, MigrationsDryRunResult>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('applyMigrations'), body: { dry: true } }),
      onSuccess: (ctx, value) => { ctx.result = value },
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(withRunId(err.message, err.status, err.runId))
        ctx.fail(err.message || 'migrations.dryRunFailed')
      },
    }),
  ],
  always: [opsBusy<MigrationsDryRunInput, MigrationsDryRunResult>(false)],
})

export const migrationsApply = defineAction<MigrationsApplyInput, MigrationsApplyResult>({
  name: 'migrationsApply',
  steps: [
    dialogConfirm<MigrationsApplyInput, MigrationsApplyResult>((ctx) => ctx.input.confirmed),
    opsBusy<MigrationsApplyInput, MigrationsApplyResult>(true),
    apiRequest<MigrationsApplyInput, MigrationsApplyResult, MigrationsApplyResult>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('applyMigrations'), body: { dry: false } }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(ctx.input.deps.t('migrations.applyDone', { count: value.applied.length }))
      },
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(withRunId(err.message, err.status, err.runId))
        ctx.fail(err.message || 'migrations.applyFailed')
      },
    }),
    dataReload<MigrationsApplyInput, MigrationsApplyResult>(),
  ],
  always: [opsBusy<MigrationsApplyInput, MigrationsApplyResult>(false)],
})

const userCreateValidate: ActionStep<UserCreateInput, undefined> = defineUiStep('user.validate', (ctx) => {
  const { username, password, passwordConfirm, ops, deps } = ctx.input
  if (!username.trim()) { ops.setError?.(deps.t('users.usernameRequired')); ctx.fail('users.usernameRequired') }
  if (password.length < 8) { ops.setError?.(deps.t('users.passwordTooShort')); ctx.fail('users.passwordTooShort') }
  if (password !== passwordConfirm) { ops.setError?.(deps.t('password.mismatch')); ctx.fail('password.mismatch') }
})

export const userCreate = defineAction<UserCreateInput, undefined>({
  name: 'userCreate',
  steps: [
    userCreateValidate,
    opsBusy<UserCreateInput, undefined>(true),
    apiRequest<UserCreateInput, undefined, unknown>('api.request', {
      call: (ctx) => ({
        route: ctx.input.deps.capabilities.route('createUser'),
        body: { username: ctx.input.username.trim(), password: ctx.input.password, roles: ctx.input.roles },
      }),
      onSuccess: (ctx) => { ctx.input.deps.toast.success(ctx.input.deps.t('users.created')) },
      onError: (ctx, err) => { ctx.input.ops.setError?.(err.message); ctx.fail(err.message) },
    }),
    dataReload<UserCreateInput, undefined>(),
  ],
  always: [opsBusy<UserCreateInput, undefined>(false)],
})

export const userToggle = defineAction<UserToggleInput, undefined>({
  name: 'userToggle',
  steps: [
    opsBusy<UserToggleInput, undefined>(true),
    apiRequest<UserToggleInput, undefined, unknown>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route(ctx.input.active ? 'deactivateUser' : 'activateUser', { id: ctx.input.userId }) }),
      onSuccess: () => {},
      onError: (ctx, err) => {
        const message = userErrorMessage(ctx.input.deps.t, ctx.input.active ? 'deactivate' : 'activate', err)
        ctx.input.deps.toast.error(withRunId(message, err.status, err.runId))
        ctx.fail(message)
      },
    }),
    dataReload<UserToggleInput, undefined>(),
  ],
  always: [opsBusy<UserToggleInput, undefined>(false)],
})

async function callUser<I extends WithDeps & { ops: BusyPort }>(ctx: ActionContext<I, undefined>, operation: UserOperation, call: ApiCall): Promise<void> {
  try {
    await ctx.input.deps.api(call.route, { ...(call.body === undefined ? {} : { body: call.body }) })
  } catch (e) {
    const message = userErrorMessage(ctx.input.deps.t, operation, { status: apiErrorStatus(e), code: apiErrorCode(e), message: apiErrorMessage(e) })
    ctx.input.ops.setError?.(message)
    ctx.fail(message)
  }
}

function rolesChanged(a: readonly string[], b: readonly string[]): boolean {
  return a.length !== b.length || a.some((role, index) => role !== b[index])
}

const userUpdateValidate: ActionStep<UserUpdateInput, undefined> = defineUiStep('user.validate', (ctx) => {
  const { username, password, passwordConfirm, ops, deps } = ctx.input
  if (!username.trim()) { ops.setError?.(deps.t('users.usernameRequired')); ctx.fail('users.usernameRequired') }
  if (password.length > 0 && password.length < 8) { ops.setError?.(deps.t('users.passwordTooShort')); ctx.fail('users.passwordTooShort') }
  if (password !== passwordConfirm) { ops.setError?.(deps.t('password.mismatch')); ctx.fail('password.mismatch') }
})

const userUpdatePatch: ActionStep<UserUpdateInput, undefined> = defineUiStep('user.patch', async (ctx) => {
  const { userId, username, roles, initial, deps } = ctx.input
  const name = username.trim()
  const renamed = name !== initial.username
  const rerolled = rolesChanged(roles, initial.roles)
  if (!renamed && !rerolled) return
  const body = { ...(renamed ? { username: name } : {}), ...(rerolled ? { roles: [...roles] } : {}) }
  await callUser(ctx, 'update', { route: deps.capabilities.route('updateUser', { id: userId }), body })
})

const userUpdateActive: ActionStep<UserUpdateInput, undefined> = defineUiStep('user.active', async (ctx) => {
  const { userId, active, initial, deps } = ctx.input
  if (active === initial.active) return
  await callUser(ctx, active ? 'activate' : 'deactivate', { route: deps.capabilities.route(active ? 'activateUser' : 'deactivateUser', { id: userId }) })
})

const userUpdatePassword: ActionStep<UserUpdateInput, undefined> = defineUiStep('user.password', async (ctx) => {
  const { userId, password, deps } = ctx.input
  if (password.length === 0) return
  await callUser(ctx, 'password', { route: deps.capabilities.route('setPassword', { id: userId }), body: { password } })
})

export const userUpdate = defineAction<UserUpdateInput, undefined>({
  name: 'userUpdate',
  steps: [
    userUpdateValidate,
    opsBusy<UserUpdateInput, undefined>(true),
    userUpdatePatch,
    userUpdateActive,
    userUpdatePassword,
    defineUiStep<UserUpdateInput, undefined>('toast.success', (ctx) => { ctx.input.deps.toast.success(ctx.input.deps.t('users.saved')) }),
    dataReload<UserUpdateInput, undefined>(),
  ],
  always: [opsBusy<UserUpdateInput, undefined>(false)],
})

const userDeleteRequest: ActionStep<UserDeleteInput, UserDeleteOutcome> = defineUiStep('user.delete', async (ctx) => {
  const { deps, userId, reassignTo, ops } = ctx.input
  try {
    const value = await deps.api<UserDeleteResponse>(deps.capabilities.route('deleteUser', { id: userId }), { body: { reassignTo } })
    ctx.result = { reassignTo: value.reassignTo, events: value._events ?? null }
  } catch (e) {
    const failure = { status: apiErrorStatus(e), code: apiErrorCode(e), message: apiErrorMessage(e) }
    const message = userErrorMessage(deps.t, reassignTo === null ? 'delete' : 'reassign', failure)
    ops.setError?.(message)
    ctx.fail(message)
  }
})

const userDeleteToast: ActionStep<UserDeleteInput, UserDeleteOutcome> = defineUiStep('toast.summary', (ctx) => {
  const { t, toast } = ctx.input.deps
  const target = ctx.result?.reassignTo ?? null
  const events = ctx.result?.events ?? null
  if (events?.status === 'error') {
    const pipelines = events.pipelines.filter((p) => p.status === 'error').map((p) => p.pipeline).join(', ')
    toast.error(t('users.deletedFollowUpFailed', { pipelines }) + t('users.followUpSeeEvents', { tab: t('system.tabs.events') }))
    return
  }
  if (events?.status === 'pending') {
    toast.info(t('users.deletedFollowUpPending'))
    return
  }
  toast.success(target === null ? t('users.deletedAnonymized') : t('users.deletedReassigned', { username: target.name }))
})

export const userDelete = defineAction<UserDeleteInput, UserDeleteOutcome>({
  name: 'userDelete',
  steps: [
    dialogConfirm<UserDeleteInput, UserDeleteOutcome>((ctx) => ctx.input.confirmed),
    opsBusy<UserDeleteInput, UserDeleteOutcome>(true),
    userDeleteRequest,
    userDeleteToast,
    dataReload<UserDeleteInput, UserDeleteOutcome>(),
  ],
  always: [opsBusy<UserDeleteInput, UserDeleteOutcome>(false)],
})

export const referencesRebuild = defineAction<ReferencesRebuildInput, RebuildReport>({
  name: 'referencesRebuild',
  steps: [
    opsBusy<ReferencesRebuildInput, RebuildReport>(true),
    apiRequest<ReferencesRebuildInput, RebuildReport, RebuildReport>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('rebuildReferences') }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(ctx.input.deps.t('refs.rebuildDone', { documents: value.documents, entries: value.entries }))
      },
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(withRunId(err.message, err.status, err.runId))
        ctx.fail(err.message)
      },
    }),
    dataReload<ReferencesRebuildInput, RebuildReport>(),
  ],
  always: [opsBusy<ReferencesRebuildInput, RebuildReport>(false)],
})

export const linksRebuild = defineAction<LinksRebuildInput, RebuildReport>({
  name: 'linksRebuild',
  steps: [
    opsBusy<LinksRebuildInput, RebuildReport>(true),
    apiRequest<LinksRebuildInput, RebuildReport, RebuildReport>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('rebuildLinks') }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(ctx.input.deps.t('references.links.rebuildDone', { documents: value.documents, entries: value.entries }))
      },
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(withRunId(err.message, err.status, err.runId))
        ctx.fail(err.message)
      },
    }),
    dataReload<LinksRebuildInput, RebuildReport>(),
  ],
  always: [opsBusy<LinksRebuildInput, RebuildReport>(false)],
})

export const previewPrune = defineAction<PreviewPruneInput, PrunePreview>({
  name: 'previewPrune',
  steps: [
    apiRequest<PreviewPruneInput, PrunePreview, ImagesStatus>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('imagesStatus') }),
      onSuccess: (ctx, value) => {
        ctx.result = { sizes: [...value.orphaned.sizes], variants: value.orphaned.variants }
      },
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(withRunId(err.message, err.status, err.runId))
        ctx.fail(err.message)
      },
    }),
    guardSelection<PreviewPruneInput, PrunePreview>((ctx) => ctx.result?.sizes ?? []),
  ],
})

export const prune = defineAction<ImagesPruneInput, ImagesPruneResult>({
  name: 'prune',
  steps: [
    dialogConfirm<ImagesPruneInput, ImagesPruneResult>((ctx) => ctx.input.confirmed && ctx.input.sizes.length > 0),
    opsBusy<ImagesPruneInput, ImagesPruneResult>(true),
    apiRequest<ImagesPruneInput, ImagesPruneResult, ImagesPruneResult>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('pruneImages'), body: { sizes: [...ctx.input.sizes] } }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(ctx.input.deps.t('images.pruneDone'))
      },
      onError: (ctx, err) => {
        const message = err.message || ctx.input.deps.t('images.pruneFailed')
        ctx.input.ops.setError?.(message)
        ctx.input.deps.toast.error(message)
        ctx.fail(message)
      },
    }),
    dataReload<ImagesPruneInput, ImagesPruneResult>(),
  ],
  always: [opsBusy<ImagesPruneInput, ImagesPruneResult>(false)],
})

export const imagesRetryFailed = defineAction<ImagesRetryFailedInput, ImagesRetryFailedResult>({
  name: 'imagesRetryFailed',
  steps: [
    dialogConfirm<ImagesRetryFailedInput, ImagesRetryFailedResult>((ctx) => ctx.input.confirmed && ctx.input.variants > 0),
    opsBusy<ImagesRetryFailedInput, ImagesRetryFailedResult>(true),
    apiRequest<ImagesRetryFailedInput, ImagesRetryFailedResult, ImagesRetryFailedResult>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('retryFailedImages') }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(ctx.input.deps.t('images.retryFailedDone', { variants: value.variants, media: value.media }))
      },
      onError: (ctx, err) => {
        const message = err.message || ctx.input.deps.t('images.retryFailedError')
        ctx.input.ops.setError?.(message)
        ctx.input.deps.toast.error(withRunId(message, err.status, err.runId))
        ctx.fail(message)
      },
    }),
    dataReload<ImagesRetryFailedInput, ImagesRetryFailedResult>(),
  ],
  always: [opsBusy<ImagesRetryFailedInput, ImagesRetryFailedResult>(false)],
})

export const mediaReconcile = defineAction<MediaReconcileInput, MediaReconcileReport>({
  name: 'mediaReconcile',
  steps: [
    opsBusy<MediaReconcileInput, MediaReconcileReport>(true),
    apiRequest<MediaReconcileInput, MediaReconcileReport, MediaReconcileReport>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('reconcileMediaReport') }),
      onSuccess: (ctx, value) => {
        ctx.result = value
      },
      onError: (ctx, err) => {
        const message = err.message || ctx.input.deps.t('media.reconcile.failed')
        ctx.input.ops.setError?.(message)
        ctx.input.deps.toast.error(withRunId(message, err.status, err.runId))
        ctx.fail(message)
      },
    }),
  ],
  always: [opsBusy<MediaReconcileInput, MediaReconcileReport>(false)],
})

export const mediaReconcileDelete = defineAction<MediaReconcileDeleteInput, MediaReconcileReport>({
  name: 'mediaReconcileDelete',
  steps: [
    dialogConfirm<MediaReconcileDeleteInput, MediaReconcileReport>((ctx) => ctx.input.confirmed && ctx.input.orphans > 0),
    opsBusy<MediaReconcileDeleteInput, MediaReconcileReport>(true),
    apiRequest<MediaReconcileDeleteInput, MediaReconcileReport, MediaReconcileReport>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('reconcileMediaDelete') }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(ctx.input.deps.t('media.reconcile.deleteDone', { count: value.blobsWithoutRow.length }))
      },
      onError: (ctx, err) => {
        const message = err.message || ctx.input.deps.t('media.reconcile.failed')
        ctx.input.ops.setError?.(message)
        ctx.input.deps.toast.error(withRunId(message, err.status, err.runId))
        ctx.fail(message)
      },
    }),
  ],
  always: [opsBusy<MediaReconcileDeleteInput, MediaReconcileReport>(false)],
})

export const repairPublicMedia = defineAction<RepairPublicMediaInput, MediaRepairPublicReport>({
  name: 'repairPublicMedia',
  steps: [
    opsBusy<RepairPublicMediaInput, MediaRepairPublicReport>(true),
    apiRequest<RepairPublicMediaInput, MediaRepairPublicReport, MediaRepairPublicReport>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('repairPublicMedia') }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        const written = value._publicMedia.written + (value._publicVariants?.written ?? 0)
        const removed = value._publicMedia.removed + (value._publicVariants?.removed ?? 0)
        const missing = value._publicMedia.missing + (value._publicVariants?.missing ?? 0)
        ctx.input.deps.toast.success(ctx.input.deps.t('delivery.repairPublicDone', { written, removed, missing }))
      },
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(err.message ? withRunId(err.message, err.status, err.runId) : ctx.input.deps.t('delivery.repairPublicFailed'))
        ctx.fail(err.message || 'delivery.repairPublicFailed')
      },
    }),
  ],
  always: [opsBusy<RepairPublicMediaInput, MediaRepairPublicReport>(false)],
})

const registerSizes: ActionStep<ImagesRegisterInput, ImagesJob> = defineUiStep('api.request:register', async (ctx) => {
  if (ctx.input.sizes.length === 0) return
  try {
    await ctx.input.deps.api(ctx.input.deps.capabilities.route('registerImageSizes'), { body: { sizes: [...ctx.input.sizes] } })
  } catch (e) {
    if (apiErrorCode(e) === 'CONFLICT') return
    const message = apiErrorMessage(e)
    ctx.input.deps.toast.error(withRunId(message, apiErrorStatus(e), apiErrorRunId(e)))
    ctx.fail(message)
  }
})

const syncAfterRegister: ActionStep<ImagesRegisterInput, ImagesJob> = apiRequest<ImagesRegisterInput, ImagesJob, ImagesJob>('api.request:sync', {
  call: (ctx) => ({ route: ctx.input.deps.capabilities.route('syncImages') }),
  onSuccess: (ctx, value) => {
    ctx.result = value
    ctx.input.deps.toast.success(ctx.input.deps.t('images.syncStarted'))
  },
  onError: (ctx, err) => {
    if (err.code === 'CONFLICT') return
    ctx.input.deps.toast.error(withRunId(err.message, err.status, err.runId))
    ctx.fail(err.message)
  },
})

export const imagesRegisterAndSync = defineAction<ImagesRegisterInput, ImagesJob>({
  name: 'imagesRegisterAndSync',
  steps: [
    opsBusy<ImagesRegisterInput, ImagesJob>(true),
    registerSizes,
    syncAfterRegister,
    dataReload<ImagesRegisterInput, ImagesJob>(),
  ],
  always: [opsBusy<ImagesRegisterInput, ImagesJob>(false)],
})

export const eventsRetryAll = defineAction<EventsRetryAllInput, EventsRetryResult>({
  name: 'eventsRetryAll',
  steps: [
    dialogConfirm<EventsRetryAllInput, EventsRetryResult>((ctx) => ctx.input.count > 0),
    opsBusy<EventsRetryAllInput, EventsRetryResult>(true),
    apiRequest<EventsRetryAllInput, EventsRetryResult, EventsRetryResult>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('eventsRetryDead') }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(ctx.input.deps.t('events.retriedAll', { count: value.retried }))
      },
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(withRunId(err.message, err.status, err.runId))
        ctx.fail(err.message || 'events.retryFailed')
      },
    }),
    dataReload<EventsRetryAllInput, EventsRetryResult>(),
  ],
  always: [opsBusy<EventsRetryAllInput, EventsRetryResult>(false)],
})

export const eventsRetryOne = defineAction<EventsRetryOneInput, EventsRetryResult>({
  name: 'eventsRetryOne',
  steps: [
    opsBusy<EventsRetryOneInput, EventsRetryResult>(true),
    apiRequest<EventsRetryOneInput, EventsRetryResult, EventsRetryResult>('api.request', {
      call: (ctx) => ({ route: ctx.input.deps.capabilities.route('eventsRetryOne', { id: ctx.input.id }) }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(ctx.input.deps.t('events.retriedOne'))
      },
      onError: (ctx, err) => {
        if (err.code === 'NOT_FOUND') ctx.input.deps.toast.error(ctx.input.deps.t('events.retryNotFound'))
        else ctx.input.deps.toast.error(withRunId(err.message, err.status, err.runId))
        ctx.fail(err.message || 'events.retryFailed')
      },
    }),
    dataReload<EventsRetryOneInput, EventsRetryResult>(),
  ],
  always: [opsBusy<EventsRetryOneInput, EventsRetryResult>(false)],
})
