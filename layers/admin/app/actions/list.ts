import { defineAction } from '../../../core/app/utils/actions'
import { withRunId } from '../composables/useApi'
import { referencedBy } from '../utils/references'
import { previewDeleteAction } from './shared'
import { apiEach } from './steps/api'
import { dialogConfirm, guardAnySucceeded, guardSelection } from './steps/guard'
import { opsBusy, opsError, toastSummary, toastSuccess } from './steps/notify'
import { listRefresh } from './steps/route'
import type { BusyPort, EachReport, RefreshPort, WithDeps } from './types'

export interface BulkStatusInput extends WithDeps {
  collection: string
  ids: readonly string[]
  status: 'published' | 'draft'
  locale?: string
  ops: BusyPort
  refresh: RefreshPort
}

export interface BulkDeleteInput extends WithDeps {
  collection: string
  ids: readonly string[]
  confirmed: boolean
  ops: BusyPort
  refresh: RefreshPort
}

export const bulkSetStatus = defineAction<BulkStatusInput, EachReport<unknown>>({
  name: 'bulkSetStatus',
  steps: [
    guardSelection<BulkStatusInput, EachReport<unknown>>((ctx) => ctx.input.ids),
    opsBusy<BulkStatusInput, EachReport<unknown>>(true),
    apiEach<BulkStatusInput, EachReport<unknown>>('api.each', {
      items: (ctx) => ctx.input.ids,
      call: (ctx, id) => ({
        path: `/${ctx.input.collection}/${id}`,
        method: 'PATCH',
        body: { status: ctx.input.status, ...(ctx.input.locale ? { locale: ctx.input.locale } : {}) },
      }),
      policy: 'continue',
      onItemError: (ctx, item) => {
        if (item.message) ctx.input.deps.toast.error(withRunId(item.message, item.status ?? 0, item.runId))
      },
      onDone: (ctx, report) => {
        ctx.result = report
      },
    }),
    opsError<BulkStatusInput, EachReport<unknown>>((ctx) => (ctx.result && ctx.result.failed > 0 ? ctx.result.lastMessage : null)),
    toastSummary<BulkStatusInput, EachReport<unknown>>((ctx) => ({
      report: ctx.result!,
      successKey: ctx.input.status === 'published' ? 'toast.published' : 'toast.unpublished',
    })),
    listRefresh<BulkStatusInput, EachReport<unknown>>(),
  ],
  always: [opsBusy<BulkStatusInput, EachReport<unknown>>(false)],
})

export const previewBulkDelete = previewDeleteAction('previewBulkDelete')

export const bulkDelete = defineAction<BulkDeleteInput, EachReport<unknown>>({
  name: 'bulkDelete',
  steps: [
    dialogConfirm<BulkDeleteInput, EachReport<unknown>>((ctx) => ctx.input.confirmed),
    opsBusy<BulkDeleteInput, EachReport<unknown>>(true),
    apiEach<BulkDeleteInput, EachReport<unknown>>('api.each', {
      items: (ctx) => ctx.input.ids,
      call: (ctx, id) => ({ path: `/${ctx.input.collection}/${id}`, method: 'DELETE' }),
      policy: 'continue',
      onItemError: (ctx, item) => {
        if (item.code === 'CONFLICT') {
          const refs = referencedBy(item.details, item.message ?? '')
          if (refs.length > 0) {
            const list = refs.map((r) => (r.field ? `${r.type}/${r.id} (${r.field})` : `${r.type}/${r.id}`)).join(', ')
            ctx.input.deps.toast.error(`${ctx.input.deps.t('refs.conflictAfterPrecheck')} ${list}`)
            return
          }
        }
        if (item.message) ctx.input.deps.toast.error(withRunId(item.message, item.status ?? 0, item.runId))
      },
      onDone: (ctx, report) => {
        ctx.result = report
      },
    }),
    guardAnySucceeded<BulkDeleteInput>(),
    listRefresh<BulkDeleteInput, EachReport<unknown>>(),
    toastSuccess<BulkDeleteInput, EachReport<unknown>>(() => ({ key: 'toast.deleted' })),
  ],
  always: [opsBusy<BulkDeleteInput, EachReport<unknown>>(false)],
})
