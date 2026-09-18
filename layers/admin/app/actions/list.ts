import { defineAction, type ActionContext } from '#kestrel-core/app/utils/actions'
import type { Workflow } from '#kestrel-admin/types/kestrel'
import { withRunId } from '../composables/useApi'
import { referencedBy } from '../utils/references'
import { previewDeleteAction } from './shared'
import { apiEach } from './steps/api'
import { dialogConfirm, guardAnySucceeded, guardSelection } from './steps/guard'
import { opsBusy, opsError, toastSummary, toastSuccess } from './steps/notify'
import { listRefresh } from './steps/route'
import type { BusyPort, EachReport, RefreshPort, WithDeps } from './types'

function eachReport<I, T>(ctx: ActionContext<I, EachReport<T>>, step: string): EachReport<T> {
  if (ctx.result === undefined) throw new Error(`api.each must run before ${step}`)
  return ctx.result
}

export interface BulkStatusInput extends WithDeps {
  collection: string
  ids: readonly string[]
  workflow: Workflow
  live: boolean
  locale?: string
  ops: BusyPort
  refresh: RefreshPort
}

const statusBody = (input: BulkStatusInput): Record<string, unknown> => ({
  [input.workflow.field]: input.live ? input.workflow.live : input.workflow.draft,
  ...(input.locale ? { locale: input.locale } : {}),
})

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
        body: statusBody(ctx.input),
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
      report: eachReport(ctx, 'toastSummary'),
      successKey: ctx.input.live ? 'toast.published' : 'toast.unpublished',
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
