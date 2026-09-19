import type { Revision, RevisionPage, RevisionSummary } from '#kestrel-admin/types/api'
import { defineAction } from '#kestrel-core/app/utils/actions'
import { apiRequest } from './steps/api'
import { dialogConfirm } from './steps/guard'
import { opsBusy, toastSuccess } from './steps/notify'
import { dataReload } from './steps/route'
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
  ops: BusyPort
  refresh: RefreshPort
}

export interface LabelRevisionInput extends RevisionScope {
  revisionId: string
  label: string | null
  ops: BusyPort
}

function base(input: RevisionScope): string {
  return `/admin/${input.collection}/${encodeURIComponent(input.id)}/revisions`
}

export const loadRevisions = defineAction<LoadRevisionsInput, RevisionPage>({
  name: 'loadRevisions',
  steps: [
    apiRequest<LoadRevisionsInput, RevisionPage, RevisionPage>('api.request:revisions', {
      call: (ctx) => ({ path: base(ctx.input), query: { locale: ctx.input.locale, limit: ctx.input.limit, offset: ctx.input.offset } }),
      onSuccess: (ctx, page) => {
        ctx.result = page
      },
      onError: (ctx, err) => ctx.fail(err.message),
    }),
  ],
})

export const readRevision = defineAction<ReadRevisionInput, Revision>({
  name: 'readRevision',
  steps: [
    apiRequest<ReadRevisionInput, Revision, Revision>('api.request:revision', {
      call: (ctx) => ({ path: `${base(ctx.input)}/${encodeURIComponent(ctx.input.revisionId)}`, query: { locale: ctx.input.locale } }),
      onSuccess: (ctx, revision) => {
        ctx.result = revision
      },
      onError: (ctx, err) => ctx.fail(err.message),
    }),
  ],
})

export const restoreRevision = defineAction<RestoreRevisionInput, undefined>({
  name: 'restoreRevision',
  steps: [
    dialogConfirm<RestoreRevisionInput, undefined>((ctx) => ctx.input.confirmed),
    opsBusy<RestoreRevisionInput, undefined>(true),
    apiRequest<RestoreRevisionInput, undefined, unknown>('api.request:restore', {
      call: (ctx) => ({
        path: `${base(ctx.input)}/${encodeURIComponent(ctx.input.revisionId)}/restore`,
        method: 'POST',
        query: { locale: ctx.input.locale },
      }),
      onSuccess: () => {},
      onError: (ctx, err) => {
        ctx.input.ops.setError?.(err.code === 'CONFLICT' ? ctx.input.deps.t('revisions.skippedCannotRestore') : err.message)
        ctx.fail(err.message)
      },
    }),
    dataReload<RestoreRevisionInput, undefined>(),
    toastSuccess<RestoreRevisionInput, undefined>(() => ({ key: 'revisions.restored' })),
  ],
  always: [opsBusy<RestoreRevisionInput, undefined>(false)],
})

export const labelRevision = defineAction<LabelRevisionInput, RevisionSummary>({
  name: 'labelRevision',
  steps: [
    opsBusy<LabelRevisionInput, RevisionSummary>(true),
    apiRequest<LabelRevisionInput, RevisionSummary, RevisionSummary>('api.request:label', {
      call: (ctx) => ({
        path: `${base(ctx.input)}/${encodeURIComponent(ctx.input.revisionId)}`,
        method: 'PATCH',
        body: { label: ctx.input.label },
        query: { locale: ctx.input.locale },
      }),
      onSuccess: (ctx, summary) => {
        ctx.result = summary
      },
      onError: (ctx, err) => {
        ctx.input.ops.setError?.(err.message)
        ctx.fail(err.message)
      },
    }),
    toastSuccess<LabelRevisionInput, RevisionSummary>((ctx) => ({ key: ctx.input.label === null ? 'revisions.labelCleared' : 'revisions.labelSaved' })),
  ],
  always: [opsBusy<LabelRevisionInput, RevisionSummary>(false)],
})
