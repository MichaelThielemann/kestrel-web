import type { SerializedField } from '#kestrel/types/kestrel'
import { defineAction, type ActionStep } from '../../../core/app/utils/actions'
import { previewDeleteAction } from './shared'
import { translationSourceValues } from '../utils/translation-copy'
import { apiEach, apiRequest, apiWrite } from './steps/api'
import { deliveryRemember } from './steps/delivery'
import { formMapErrors, formOutcome, formRebaseline, formReset, formRevealError, formSaving, formSetStatus, formValidate } from './steps/form'
import { dialogConfirm, guardAnySucceeded, guardBypass, guardStatus, guardTab, guardUnsaved } from './steps/guard'
import { opsBusy, toastError, toastSuccess } from './steps/notify'
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
    formReset<I, SaveOutcome>(),
    formValidate<I, SaveOutcome>(),
    formSaving<I, SaveOutcome>(true),
    apiWrite<I, SaveOutcome>(),
    deliveryRemember<I, SaveOutcome>(),
    formRebaseline<I, SaveOutcome>(),
    formMapErrors<I, SaveOutcome>(),
    formOutcome<I, SaveOutcome>(),
    toastSuccess<I, SaveOutcome>(() => ({ key: 'toast.saved' })),
  ]
}

function saveAlways<I extends SaveInput>(): ActionStep<I, SaveOutcome>[] {
  return [
    formSaving<I, SaveOutcome>(false),
    formRevealError<I, SaveOutcome>(),
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

export const deleteRecord = defineAction<DeleteRecordInput, EachReport<unknown>>({
  name: 'deleteRecord',
  steps: [
    dialogConfirm<DeleteRecordInput, EachReport<unknown>>((ctx) => ctx.input.confirmed),
    opsBusy<DeleteRecordInput, EachReport<unknown>>(true),
    apiEach<DeleteRecordInput, EachReport<unknown>>('api.each', {
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
    guardAnySucceeded<DeleteRecordInput>(),
    guardBypass<DeleteRecordInput, EachReport<unknown>>(),
    routeNavigate<DeleteRecordInput, EachReport<unknown>>((ctx) => ({ kind: 'path', to: ctx.input.to })),
    toastSuccess<DeleteRecordInput, EachReport<unknown>>(() => ({ key: 'toast.deleted' })),
  ],
  always: [opsBusy<DeleteRecordInput, EachReport<unknown>>(false)],
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
