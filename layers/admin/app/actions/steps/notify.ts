import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import type { ActionContext, ActionResult, ActionStep } from '#kestrel-core/app/utils/actions'
import { failureText, retryableMessage, type FailureTrace } from '../../composables/useApi'
import { defineUiStep } from '../define'
import type { ActionDeps, BusyPort, EachReport, ToastPort, Translate, WithDeps } from '../types'

export interface ToastErrorPick {
  key?: string
  message?: string
  params?: Record<string, unknown>
  status?: number
  runId?: string
  requestId?: string
  reached?: boolean
  retryable?: boolean
  details?: ApiErrorDetails
}

/** The timeout of an error toast that names an error id: 0, so that it stays until it is dismissed and the id can be copied. */
export const FAILURE_TOAST_MS = 0

/** Toasts `text`, which already names its request; a toast that shows the error id stays until it is dismissed. */
export function toastFailureText(deps: { toast: Pick<ToastPort, 'error'> }, text: string, trace: FailureTrace): void {
  const id = trace.requestId ?? trace.runId
  if (id && text.includes(id)) deps.toast.error(text, FAILURE_TOAST_MS)
  else deps.toast.error(text)
}

/** Toasts `message` with the HTTP status and the error id of the failed request, see `failureText`. */
export function toastFailure(deps: { t: Translate, toast: Pick<ToastPort, 'error'> }, message: string, trace: FailureTrace): void {
  toastFailureText(deps, failureText(deps.t, message, trace), trace)
}

export function toastSuccess<I extends WithDeps, R = unknown>(pick: (ctx: ActionContext<I, R>) => { key: string, params?: Record<string, unknown> } | null): ActionStep<I, R> {
  return defineUiStep<I, R>('toast.success', (ctx) => {
    const message = pick(ctx)
    if (!message) return
    const { t, toast } = ctx.input.deps
    toast.success(t(message.key, message.params))
  })
}

export function toastError<I extends WithDeps, R = unknown>(pick: (ctx: ActionContext<I, R>) => ToastErrorPick | null): ActionStep<I, R> {
  return defineUiStep<I, R>('toast.error', (ctx) => {
    const picked = pick(ctx)
    if (!picked) return
    const { t } = ctx.input.deps
    const text = picked.retryable ? retryableMessage(t, picked.details) : picked.message || (picked.key ? t(picked.key, picked.params) : '')
    if (!text) return
    toastFailure(ctx.input.deps, text, picked)
  })
}

export function toastSummary<I extends WithDeps, R = unknown>(pick: (ctx: ActionContext<I, R>) => { report: EachReport<unknown>, successKey: string, params?: Record<string, unknown> }): ActionStep<I, R> {
  return defineUiStep<I, R>('toast.summary', (ctx) => {
    const { report, successKey, params } = pick(ctx)
    if (report.failed > 0) return
    const { t, toast } = ctx.input.deps
    toast.success(t(successKey, params))
  })
}

export function opsBusy<I extends { ops: BusyPort }, R = unknown>(on: boolean): ActionStep<I, R> {
  return defineUiStep<I, R>(`ops.busy:${on ? 'on' : 'off'}`, (ctx) => {
    if (on) {
      ctx.input.ops.setBusy(true)
      ctx.input.ops.setError?.(null)
      ctx.input.ops.setConflict?.(null)
      return
    }
    if (ctx.input.ops.busy()) ctx.input.ops.setBusy(false)
  })
}

export function opsError<I extends { ops: BusyPort }, R = unknown>(pick: (ctx: ActionContext<I, R>) => string | null): ActionStep<I, R> {
  return defineUiStep<I, R>('ops.error', (ctx) => {
    const message = pick(ctx)
    if (message === null) return
    ctx.input.ops.setError?.(message)
  })
}

export function toastUnexpected<R>(deps: ActionDeps, result: ActionResult<R>): void {
  if (!result.ok && result.meta?.unexpected === true) deps.toast.error(deps.t('toast.unexpected'))
}
