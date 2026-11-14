import type { RestoreReport, RevisionDetail, RevisionPage, RevisionRestoreResponse, RevisionSummary } from '#kestrel-admin/types/api'
import { defineAction } from '#kestrel-core/app/utils/actions'
import { answeredMessage, failureText } from '../composables/useApi'
import { apiRequest } from './steps/api'
import { dialogConfirm } from './steps/guard'
import { opsBusy, toastSuccess } from './steps/notify'
import { dataReload } from './steps/route'
import { fieldNames, restoreProblems } from '../utils/revision-restore'
import type { BusyPort, RefreshPort, WithDeps } from './types'

export interface RevisionScope extends WithDeps {
  collection: string
  id: string
  locale: string
}

export interface LoadRevisionsInput extends RevisionScope {
  limit: number
  offset: number
}

export interface ReadRevisionInput extends RevisionScope {
  revisionId: string
}

export interface RestoreRevisionInput extends RevisionScope {
  revisionId: string
  confirmed: boolean
  fieldLabels: Record<string, string>
  ops: BusyPort
  refresh: RefreshPort
}

export interface LabelRevisionInput extends RevisionScope {
  revisionId: string
  label: string | null
  ops: BusyPort
}

export const loadRevisions = defineAction<LoadRevisionsInput, RevisionPage>({
  name: 'loadRevisions',
  steps: [
    apiRequest<LoadRevisionsInput, RevisionPage, RevisionPage>('api.request:revisions', {
      call: (ctx) => ({
        route: ctx.input.deps.capabilities.verbRoute(ctx.input.collection, 'revisions', { id: ctx.input.id }),
        query: { locale: ctx.input.locale, limit: ctx.input.limit, offset: ctx.input.offset },
      }),
      onSuccess: (ctx, page) => {
        ctx.result = page
      },
      onError: (ctx, err) => ctx.fail(err.message),
    }),
  ],
})

export const readRevision = defineAction<ReadRevisionInput, RevisionDetail>({
  name: 'readRevision',
  steps: [
    apiRequest<ReadRevisionInput, RevisionDetail, RevisionDetail>('api.request:revision', {
      call: (ctx) => ({
        route: ctx.input.deps.capabilities.verbRoute(ctx.input.collection, 'revision', { id: ctx.input.id, revisionId: ctx.input.revisionId }),
        query: { locale: ctx.input.locale },
      }),
      onSuccess: (ctx, revision) => {
        ctx.result = revision
      },
      onError: (ctx, err) => ctx.fail(err.message),
    }),
  ],
})

export const restoreRevision = defineAction<RestoreRevisionInput, RestoreReport | null>({
  name: 'restoreRevision',
  steps: [
    dialogConfirm<RestoreRevisionInput, RestoreReport | null>((ctx) => ctx.input.confirmed),
    opsBusy<RestoreRevisionInput, RestoreReport | null>(true),
    apiRequest<RestoreRevisionInput, RestoreReport | null, RevisionRestoreResponse>('api.request:restore', {
      call: (ctx) => ({
        route: ctx.input.deps.capabilities.verbRoute(ctx.input.collection, 'restoreRevision', { id: ctx.input.id, revisionId: ctx.input.revisionId }),
        query: { locale: ctx.input.locale },
      }),
      onSuccess: (ctx, response) => {
        ctx.result = response.restore ?? null
      },
      onError: (ctx, err) => {
        const problems = restoreProblems(err.details, ctx.input.fieldLabels)
        const { t } = ctx.input.deps
        const message = err.code === 'CONFLICT'
          ? t('revisions.skippedCannotRestore')
          : [answeredMessage(t, err, t('revisions.restoreFailed')), ...problems].join(' — ')
        ctx.input.ops.setError?.(failureText(t, message, err))
        ctx.fail(message)
      },
    }),
    dataReload<RestoreRevisionInput, RestoreReport | null>(),
    toastSuccess<RestoreRevisionInput, RestoreReport | null>((ctx) => {
      const dropped = ctx.result?.dropped ?? []
      if (dropped.length === 0) return { key: 'revisions.restored' }
      return { key: 'revisions.restoredWithoutFields', params: { fields: fieldNames(dropped, ctx.input.fieldLabels).join(', ') } }
    }),
  ],
  always: [opsBusy<RestoreRevisionInput, RestoreReport | null>(false)],
})

export const labelRevision = defineAction<LabelRevisionInput, RevisionSummary>({
  name: 'labelRevision',
  steps: [
    opsBusy<LabelRevisionInput, RevisionSummary>(true),
    apiRequest<LabelRevisionInput, RevisionSummary, RevisionSummary>('api.request:label', {
      call: (ctx) => ({
        route: ctx.input.deps.capabilities.verbRoute(ctx.input.collection, 'labelRevision', { id: ctx.input.id, revisionId: ctx.input.revisionId }),
        body: { label: ctx.input.label },
      }),
      onSuccess: (ctx, summary) => {
        ctx.result = summary
      },
      onError: (ctx, err) => {
        const { t } = ctx.input.deps
        ctx.input.ops.setError?.(failureText(t, answeredMessage(t, err, t('revisions.labelFailed')), err))
        ctx.fail(err.message || 'revisions.labelFailed')
      },
    }),
    toastSuccess<LabelRevisionInput, RevisionSummary>((ctx) => ({ key: ctx.input.label === null ? 'revisions.labelCleared' : 'revisions.labelSaved' })),
  ],
  always: [opsBusy<LabelRevisionInput, RevisionSummary>(false)],
})
