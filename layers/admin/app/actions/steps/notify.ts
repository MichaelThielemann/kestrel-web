import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import { defineStep, type ActionContext, type ActionStep } from '#kestrel-core/app/utils/actions'
import { retryableMessage, withRunId } from '../../composables/useApi'
import type { BusyPort, EachReport, WithDeps } from '../types'

export interface ToastErrorPick {
  key?: string
  message?: string
  params?: Record<string, unknown>
  status?: number
  runId?: string
  retryable?: boolean
  details?: ApiErrorDetails
}

export function toastSuccess<I extends WithDeps, R = unknown>(pick: (ctx: ActionContext<I, R>) => { key: string, params?: Record<string, unknown> } | null): ActionStep<I, R> {
  return defineStep<I, R>('toast.success', (ctx) => {
    const message = pick(ctx)
    if (!message) return
    const { t, toast } = ctx.input.deps
    toast.success(t(message.key, message.params))
  })
}

export function toastError<I extends WithDeps, R = unknown>(pick: (ctx: ActionContext<I, R>) => ToastErrorPick | null): ActionStep<I, R> {
  return defineStep<I, R>('toast.error', (ctx) => {
    const picked = pick(ctx)
    if (!picked) return
    const { t, toast } = ctx.input.deps
    const text = picked.retryable ? retryableMessage(t, picked.details) : picked.message || (picked.key ? t(picked.key, picked.params) : '')
    if (!text) return
    toast.error(withRunId(text, picked.status ?? 0, picked.runId))
  })
}

export function toastSummary<I extends WithDeps, R = unknown>(pick: (ctx: ActionContext<I, R>) => { report: EachReport<unknown>, successKey: string, params?: Record<string, unknown> }): ActionStep<I, R> {
  return defineStep<I, R>('toast.summary', (ctx) => {
    const { report, successKey, params } = pick(ctx)
    if (report.failed > 0) return
    const { t, toast } = ctx.input.deps
    toast.success(t(successKey, params))
  })
}

export function opsBusy<I extends { ops: BusyPort }, R = unknown>(on: boolean): ActionStep<I, R> {
  return defineStep<I, R>(`ops.busy:${on ? 'on' : 'off'}`, (ctx) => {
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
  return defineStep<I, R>('ops.error', (ctx) => {
    const message = pick(ctx)
    if (message === null) return
    ctx.input.ops.setError?.(message)
  })
}
