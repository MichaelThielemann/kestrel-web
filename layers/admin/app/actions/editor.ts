import type { EventRelayStatus } from '#kestrel-admin/types/api'
import type { SerializedField } from '#kestrel-admin/types/kestrel'
import { defineAction, type ActionStep } from '#kestrel-core/app/utils/actions'
import { previewDeleteAction } from './shared'
import { translationSourceValues } from '../utils/translation-copy'
import { apiEach, apiRequest, apiWrite } from './steps/api'
import { deliveryRefresh, deliveryToast } from './steps/delivery'
import { formMapErrors, formOutcome, formRebaseline, formReset, formRevealError, formSaving, formSetStatus, formValidate } from './steps/form'
import { dialogConfirm, guardAnySucceeded, guardBypass, guardStatus, guardTab, guardUnsaved } from './steps/guard'
import { defineUiStep } from './define'
import { opsBusy, toastError, toastSuccess } from './steps/notify'
import { routeNavigate } from './steps/route'
import type { BusyPort, ConfirmPort, EachReport, EditFormPort, NavigatePort, QueryValue, SaveOutcome, Translate, WithDeps } from './types'

export type { SaveOutcome } from './types'

/** Whether the eventsQueue feature is on, so a delivery-failure toast can name the right retry route. */
export interface DeliveryModeInput { eventsQueue?: boolean }

export interface SaveInput extends WithDeps, DeliveryModeInput { form: EditFormPort }
export interface SetStatusInput extends SaveInput { status: string }

export interface DiscardInput {
  t: Translate
  confirm: ConfirmPort
  navigate: NavigatePort
  to: string
}

export interface LeaveInput {
  navigate: NavigatePort
  bypassGuard: () => void
  to: string
}

export interface DeleteRecordInput extends WithDeps, DeliveryModeInput {
  collection: string
  ids: readonly string[]
  confirmed: boolean
  pageLike?: boolean
  ops: BusyPort
  navigate: NavigatePort
  bypassGuard: () => void
  to: string
}

export interface DeleteTranslationInput extends WithDeps {
  collection: string
  id: string
  locale: string
  confirmed: boolean
  ops: BusyPort
  navigate: NavigatePort
  bypassGuard: () => void
  to: string
}

export interface CopyTranslationInput extends WithDeps {
  form: EditFormPort
  fields: Record<string, SerializedField>
  source: string
  confirmed: boolean
}

export interface SwitchTabInput {
  t: Translate
  confirm: ConfirmPort
  navigate: NavigatePort
  tabs: readonly string[]
  activeTab: string
  tab: string
  query: Record<string, QueryValue>
}

function saveSteps<I extends SaveInput>(): ActionStep<I, SaveOutcome>[] {
  return [
    formReset<I>(),
    formValidate<I>(),
    formSaving<I, SaveOutcome>(true),
    apiWrite<I>(),
    deliveryRefresh<I>(),
    deliveryToast<I>(),
    formRebaseline<I>(),
    formMapErrors<I>(),
    formOutcome<I>(),
    toastSuccess<I, SaveOutcome>(() => ({ key: 'toast.saved' })),
  ]
}

function saveAlways<I extends SaveInput>(): ActionStep<I, SaveOutcome>[] {
  return [
    formSaving<I, SaveOutcome>(false),
    formRevealError<I>(),
    toastError<I, SaveOutcome>((ctx) =>
      ctx.result?.failed ? { message: ctx.input.form.formError(), key: 'editor.saveFailed' } : null),
  ]
}

export const saveRecord = defineAction<SaveInput, SaveOutcome>({
  name: 'saveRecord',
  steps: saveSteps<SaveInput>(),
  always: saveAlways<SaveInput>(),
})

export const setStatus = defineAction<SetStatusInput, SaveOutcome>({
  name: 'setStatus',
  steps: [
    guardStatus<SetStatusInput, SaveOutcome>(),
    formSetStatus<SetStatusInput, SaveOutcome>(),
    ...saveSteps<SetStatusInput>(),
  ],
  always: saveAlways<SetStatusInput>(),
})

export const discardRecord = defineAction<DiscardInput, undefined>({
  name: 'discardRecord',
  steps: [
    guardUnsaved<DiscardInput, undefined>(),
    routeNavigate<DiscardInput, undefined>((ctx) => ({ kind: 'path', to: ctx.input.to })),
  ],
})

export const leaveEditor = defineAction<LeaveInput, undefined>({
  name: 'leaveEditor',
  steps: [
    guardBypass<LeaveInput, undefined>(),
    routeNavigate<LeaveInput, undefined>((ctx) => ({ kind: 'path', to: ctx.input.to })),
  ],
})

export const previewDeleteRecord = previewDeleteAction('previewDeleteRecord')

interface DeleteResponse { _events?: EventRelayStatus }

type DeleteReport = EachReport<DeleteResponse>

function worstDeliveryStatus(report: DeleteReport): EventRelayStatus['status'] | undefined {
  const statuses = report.results
    .filter((item) => item.ok)
    .map((item) => item.value?._events?.status)
    .filter((status): status is EventRelayStatus['status'] => status !== undefined)
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('pending')) return 'pending'
  return statuses[0]
}

function deleteDeliveryToast<I extends WithDeps & DeliveryModeInput & { pageLike?: boolean }>(): ActionStep<I, DeleteReport> {
  return defineUiStep<I, DeleteReport>('delivery.deleteToast', (ctx) => {
    if (!ctx.input.pageLike || ctx.result === undefined || worstDeliveryStatus(ctx.result) !== 'error') return
    const { t, toast } = ctx.input.deps
    const suffixKey = ctx.input.eventsQueue ? 'editorStatus.delivery.retryQueue' : 'editorStatus.delivery.retryDelivery'
    toast.error(`${t('editorStatus.delivery.deleteFailed')}${t(suffixKey)}`)
  })
}

export const deleteRecord = defineAction<DeleteRecordInput, DeleteReport>({
  name: 'deleteRecord',
  steps: [
    dialogConfirm<DeleteRecordInput, DeleteReport>((ctx) => ctx.input.confirmed),
    opsBusy<DeleteRecordInput, DeleteReport>(true),
    apiEach<DeleteRecordInput, DeleteReport, DeleteResponse>('api.each', {
      items: (ctx) => ctx.input.ids,
      call: (ctx, id) => ({ path: `/${ctx.input.collection}/${id}`, method: 'DELETE' }),
      policy: 'continue',
      onItemError: (ctx, item) => {
        if (item.message) ctx.input.deps.toast.error(item.message)
      },
      onDone: (ctx, report) => {
        ctx.result = report
      },
    }),
    deleteDeliveryToast<DeleteRecordInput>(),
    guardAnySucceeded<DeleteRecordInput>(),
    guardBypass<DeleteRecordInput, DeleteReport>(),
    routeNavigate<DeleteRecordInput, DeleteReport>((ctx) => ({ kind: 'path', to: ctx.input.to })),
    toastSuccess<DeleteRecordInput, DeleteReport>(() => ({ key: 'toast.deleted' })),
  ],
  always: [opsBusy<DeleteRecordInput, DeleteReport>(false)],
})

export const deleteTranslation = defineAction<DeleteTranslationInput, undefined>({
  name: 'deleteTranslation',
  steps: [
    dialogConfirm<DeleteTranslationInput, undefined>((ctx) => ctx.input.confirmed),
    opsBusy<DeleteTranslationInput, undefined>(true),
    apiRequest<DeleteTranslationInput, undefined, unknown>('api.request', {
      call: (ctx) => ({ path: `/${ctx.input.collection}/${ctx.input.id}/translations/${ctx.input.locale}`, method: 'DELETE' }),
      onSuccess: () => {},
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(err.message)
        ctx.fail(err.message)
      },
    }),
    guardBypass<DeleteTranslationInput, undefined>(),
    routeNavigate<DeleteTranslationInput, undefined>((ctx) => ({ kind: 'path', to: ctx.input.to })),
    toastSuccess<DeleteTranslationInput, undefined>(() => ({ key: 'toast.translationDeleted' })),
  ],
  always: [opsBusy<DeleteTranslationInput, undefined>(false)],
})

export const copyTranslation = defineAction<CopyTranslationInput, undefined>({
  name: 'copyTranslation',
  steps: [
    dialogConfirm<CopyTranslationInput, undefined>((ctx) => ctx.input.confirmed),
    apiRequest<CopyTranslationInput, undefined, Record<string, unknown>>('api.request', {
      call: (ctx) => ({ path: `/admin/${ctx.input.form.collection}/${ctx.input.form.id}`, query: { locale: ctx.input.source } }),
      onSuccess: (ctx, doc) => {
        const values = translationSourceValues(ctx.input.fields, doc)
        for (const [name, value] of Object.entries(values)) ctx.input.form.setField(name, value)
      },
      onError: (ctx, err) => {
        ctx.input.deps.toast.error(err.message)
        ctx.fail(err.message)
      },
    }),
    toastSuccess<CopyTranslationInput, undefined>((ctx) => ({ key: 'toast.translationCopied', params: { locale: ctx.input.source.toUpperCase() } })),
  ],
})

export const switchSystemTab = defineAction<SwitchTabInput, undefined>({
  name: 'switchSystemTab',
  steps: [
    guardTab<SwitchTabInput, undefined>(),
    guardUnsaved<SwitchTabInput, undefined>(),
    routeNavigate<SwitchTabInput, undefined>((ctx) => ({ kind: 'query', query: { ...ctx.input.query, tab: ctx.input.tab } })),
  ],
})
