import type { EventRelayStatus } from '#kestrel-admin/types/api'
import type { SerializedField } from '#kestrel-admin/types/kestrel'
import { defineAction, type ActionStep } from '#kestrel-core/app/utils/actions'
import { answeredMessage } from '../composables/useApi'
import { previewDeleteAction } from './shared'
import { translationSourceValues } from '../utils/translation-copy'
import { apiEach, apiRequest, apiWrite } from './steps/api'
import { deliveryRefresh, deliveryToast, isQueuedDelivery, ownDeliveryStatus, retrySuffix } from './steps/delivery'
import { formMapErrors, formOutcome, formRebaseline, formReset, formRevealError, formSaving, formSetStatus, formValidate } from './steps/form'
import { dialogConfirm, guardAnySucceeded, guardBypass, guardStatus, guardTab, guardUnsaved } from './steps/guard'
import { defineUiStep } from './define'
import { opsBusy, toastFailure, toastFailureText, toastItemFailure, toastSuccess } from './steps/notify'
import { routeNavigate } from './steps/route'
import type { BusyPort, ConfirmPort, EachReport, EditFormPort, NavigatePort, QueryValue, SaveOutcome, Translate, WithDeps } from './types'

export type { SaveOutcome } from './types'

export interface SaveInput extends WithDeps { form: EditFormPort }
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

export interface DeleteRecordInput extends WithDeps {
  collection: string
  ids: readonly string[]
  confirmed: boolean
  hasDelivery?: boolean
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
  homeSlug: string
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
    defineUiStep<I, SaveOutcome>('toast.error', (ctx) => {
      if (!ctx.result?.failed) return
      const { deps, form } = ctx.input
      toastFailureText(deps, form.formError() || deps.t('editor.saveFailed'), ctx.result.failure ?? {})
    }),
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
    .map((item) => ownDeliveryStatus(item.value?._events))
    .filter((status): status is EventRelayStatus['status'] => status !== undefined)
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('pending')) return 'pending'
  return statuses[0]
}

function deleteDeliveryToast<I extends WithDeps & { hasDelivery?: boolean }>(): ActionStep<I, DeleteReport> {
  return defineUiStep<I, DeleteReport>('delivery.deleteToast', (ctx) => {
    if (!ctx.input.hasDelivery || ctx.result === undefined) return
    const status = worstDeliveryStatus(ctx.result)
    if (status !== 'error') return
    const { t, toast } = ctx.input.deps
    toast.error(`${t('editorStatus.delivery.deleteFailed')}${retrySuffix(t, isQueuedDelivery(status))}`)
  })
}

export const deleteRecord = defineAction<DeleteRecordInput, DeleteReport>({
  name: 'deleteRecord',
  steps: [
    dialogConfirm<DeleteRecordInput, DeleteReport>((ctx) => ctx.input.confirmed),
    opsBusy<DeleteRecordInput, DeleteReport>(true),
    apiEach<DeleteRecordInput, DeleteReport, DeleteResponse>('api.each', {
      items: (ctx) => ctx.input.ids,
      call: (ctx, id) => ({ route: ctx.input.deps.capabilities.verbRoute(ctx.input.collection, 'delete', { id }) }),
      policy: 'continue',
      onItemError: (ctx, item) => {
        toastItemFailure(ctx.input.deps, item, 'editor.deleteFailed')
      },
      onDone: (ctx, report) => {
        ctx.result = report
      },
    }),
    deleteDeliveryToast<DeleteRecordInput>(),
    guardAnySucceeded<DeleteRecordInput>('editor.deleteFailed'),
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
      call: (ctx) => ({ route: ctx.input.deps.capabilities.verbRoute(ctx.input.collection, 'deleteTranslation', { id: ctx.input.id, locale: ctx.input.locale }) }),
      onSuccess: () => {},
      onError: (ctx, err) => {
        const { t } = ctx.input.deps
        toastFailure(ctx.input.deps, answeredMessage(t, err, t('editor.translationDeleteFailed')), err)
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
      call: (ctx) => ({ route: ctx.input.deps.capabilities.verbRoute(ctx.input.form.collection, 'readAny', { id: ctx.input.form.id }), query: { locale: ctx.input.source } }),
      onSuccess: (ctx, doc) => {
        const values = translationSourceValues(ctx.input.fields, doc, ctx.input.homeSlug)
        for (const [name, value] of Object.entries(values)) ctx.input.form.setField(name, value)
      },
      onError: (ctx, err) => {
        const { t } = ctx.input.deps
        toastFailure(ctx.input.deps, answeredMessage(t, err, t('localeBar.copyFailed', { locale: ctx.input.source.toUpperCase() })), err)
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
