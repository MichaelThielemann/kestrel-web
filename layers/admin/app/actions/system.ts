import type { ImagesJob, ImagesPruneResult, ImagesStatus, MediaExportReport, MediaReconcileReport, MigrationsApplyResult, MigrationsDryRunResult, PublishAllReport, RebuildReport, ReplicationRestoreResult, ReplicationSnapshotResult } from '#kestrel-admin/types/api'
import { defineAction, defineStep, type ActionStep } from '#kestrel-core/app/utils/actions'
import { apiErrorCode, apiErrorMessage, apiErrorRunId, apiErrorStatus, withRunId } from '../composables/useApi'
import { humanizeSize } from '../utils/library'
import { apiRequest } from './steps/api'
import { dialogConfirm, guardSelection } from './steps/guard'
import { opsBusy } from './steps/notify'
import { dataReload } from './steps/route'
import type { BusyPort, RefreshPort, WithDeps } from './types'

export interface PublishAllInput extends WithDeps { ops: BusyPort }
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
  roles: string[]
  ops: BusyPort
  refresh: RefreshPort
}

export interface UserPasswordInput extends WithDeps {
  userId: string | null
  password: string
  ops: BusyPort
}

export interface UserToggleInput extends WithDeps {
  userId: string
  active: boolean
  ops: BusyPort
  refresh: RefreshPort
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

export interface MediaReconcileInput extends WithDeps {
  ops: BusyPort
}

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

export const publishAll = defineAction<PublishAllInput, PublishAllReport>({
  name: 'publishAll',
  steps: [
    opsBusy<PublishAllInput, PublishAllReport>(true),
    apiRequest<PublishAllInput, PublishAllReport, PublishAllReport>('api.request', {
      call: () => ({ path: '/admin/publish-all/pages', method: 'POST' }),
      onSuccess: (ctx, value) => {
        ctx.result = value
        ctx.input.deps.toast.success(ctx.input.deps.t('delivery.done', { documents: value.documents, live: value.live, errors: value.errors }))
      },
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(err.message ? withRunId(err.message, err.status, err.runId) : ctx.input.deps.t('delivery.failed'))
        ctx.fail(err.message || 'delivery.failed')
      },
    }),
  ],
  always: [opsBusy<PublishAllInput, PublishAllReport>(false)],
})

export const exportMedia = defineAction<ExportMediaInput, MediaExportReport>({
  name: 'exportMedia',
  steps: [
    opsBusy<ExportMediaInput, MediaExportReport>(true),
    apiRequest<ExportMediaInput, MediaExportReport, MediaExportReport>('api.request', {
      call: () => ({ path: '/admin/media/export', method: 'POST' }),
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
      call: () => ({ path: '/admin/replication/snapshot', method: 'POST' }),
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
      call: (ctx) => ({ path: '/admin/replication/restore', method: 'POST', body: ctx.input.point ?? undefined }),
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
      call: () => ({ path: '/admin/migrations/apply', method: 'POST', body: { dry: true } }),
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
      call: () => ({ path: '/admin/migrations/apply', method: 'POST', body: { dry: false } }),
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

const userCreateValidate: ActionStep<UserCreateInput, undefined> = defineStep('user.validate', (ctx) => {
  const { username, password, ops, deps } = ctx.input
  if (!username.trim()) { ops.setError?.(deps.t('users.usernameRequired')); ctx.fail('users.usernameRequired') }
  if (password.length < 8) { ops.setError?.(deps.t('users.passwordTooShort')); ctx.fail('users.passwordTooShort') }
})

export const userCreate = defineAction<UserCreateInput, undefined>({
  name: 'userCreate',
  steps: [
    userCreateValidate,
    opsBusy<UserCreateInput, undefined>(true),
    apiRequest<UserCreateInput, undefined, unknown>('api.request', {
      call: (ctx) => ({
        path: '/users',
        method: 'POST',
        body: { username: ctx.input.username.trim(), password: ctx.input.password, roles: ctx.input.roles },
      }),
      onSuccess: (ctx) => { ctx.input.deps.toast.success(ctx.input.deps.t('users.created')) },
      onError: (ctx, err) => { ctx.input.ops.setError?.(err.message); ctx.fail(err.message) },
    }),
    dataReload<UserCreateInput, undefined>(),
  ],
  always: [opsBusy<UserCreateInput, undefined>(false)],
})

const userPasswordValidate: ActionStep<UserPasswordInput, undefined> = defineStep('user.validate', (ctx) => {
  const { userId, password, ops, deps } = ctx.input
  if (userId === null) ctx.fail('user.validate')
  if (password.length < 8) { ops.setError?.(deps.t('users.passwordTooShort')); ctx.fail('users.passwordTooShort') }
})

export const userSetPassword = defineAction<UserPasswordInput, undefined>({
  name: 'userSetPassword',
  steps: [
    userPasswordValidate,
    opsBusy<UserPasswordInput, undefined>(true),
    apiRequest<UserPasswordInput, undefined, unknown>('api.request', {
      call: (ctx) => ({ path: `/users/${ctx.input.userId}/password`, method: 'PUT', body: { password: ctx.input.password } }),
      onSuccess: (ctx) => { ctx.input.deps.toast.success(ctx.input.deps.t('users.passwordChanged')) },
      onError: (ctx, err) => { ctx.input.ops.setError?.(err.message); ctx.fail(err.message) },
    }),
  ],
  always: [opsBusy<UserPasswordInput, undefined>(false)],
})

export const userToggle = defineAction<UserToggleInput, undefined>({
  name: 'userToggle',
  steps: [
    opsBusy<UserToggleInput, undefined>(true),
    apiRequest<UserToggleInput, undefined, unknown>('api.request', {
      call: (ctx) => (ctx.input.active
        ? { path: `/users/${ctx.input.userId}`, method: 'DELETE' }
        : { path: `/users/${ctx.input.userId}/activate`, method: 'POST' }),
      onSuccess: () => {},
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(withRunId(err.message, err.status, err.runId))
        ctx.fail(err.message)
      },
    }),
    dataReload<UserToggleInput, undefined>(),
  ],
  always: [opsBusy<UserToggleInput, undefined>(false)],
})

export const referencesRebuild = defineAction<ReferencesRebuildInput, RebuildReport>({
  name: 'referencesRebuild',
  steps: [
    opsBusy<ReferencesRebuildInput, RebuildReport>(true),
    apiRequest<ReferencesRebuildInput, RebuildReport, RebuildReport>('api.request', {
      call: () => ({ path: '/admin/references/rebuild', method: 'POST' }),
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
      call: () => ({ path: '/admin/links/rebuild', method: 'POST' }),
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
      call: () => ({ path: '/admin/images/status' }),
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
      call: (ctx) => ({ path: '/admin/images/prune', method: 'POST', body: { sizes: [...ctx.input.sizes] } }),
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

export const mediaReconcile = defineAction<MediaReconcileInput, MediaReconcileReport>({
  name: 'mediaReconcile',
  steps: [
    opsBusy<MediaReconcileInput, MediaReconcileReport>(true),
    apiRequest<MediaReconcileInput, MediaReconcileReport, MediaReconcileReport>('api.request', {
      call: () => ({ path: '/admin/media/reconcile', method: 'POST' }),
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
      call: () => ({ path: '/admin/media/reconcile/delete', method: 'POST' }),
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

const registerSizes: ActionStep<ImagesRegisterInput, ImagesJob> = defineStep('api.request:register', async (ctx) => {
  if (ctx.input.sizes.length === 0) return
  try {
    await ctx.input.deps.api('/admin/images/sizes', { method: 'PUT', body: { sizes: [...ctx.input.sizes] } })
  } catch (e) {
    if (apiErrorCode(e) === 'CONFLICT') return
    const message = apiErrorMessage(e)
    ctx.input.deps.toast.error(withRunId(message, apiErrorStatus(e), apiErrorRunId(e)))
    ctx.fail(message)
  }
})

const syncAfterRegister: ActionStep<ImagesRegisterInput, ImagesJob> = apiRequest<ImagesRegisterInput, ImagesJob, ImagesJob>('api.request:sync', {
  call: () => ({ path: '/admin/images/sync', method: 'POST' }),
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
