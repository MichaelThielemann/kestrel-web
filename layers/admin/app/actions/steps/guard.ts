import { defineStep, type ActionContext, type ActionStep } from '../../../../core/app/utils/actions'
import type { BusyPort, ConfirmPort, EachReport, EditFormPort, Translate } from '../types'

export function guardUnsaved<I extends { t: Translate, confirm: ConfirmPort }, R = unknown>(messageKey = 'editor.discardConfirm'): ActionStep<I, R> {
  return defineStep<I, R>('guard.unsaved', (ctx) => {
    if (!ctx.input.confirm(ctx.input.t(messageKey))) ctx.fail('guard.unsaved')
  })
}

export function guardBypass<I extends { bypassGuard: () => void }, R = unknown>(): ActionStep<I, R> {
  return defineStep<I, R>('guard.bypass', (ctx) => {
    ctx.input.bypassGuard()
  })
}

export function guardSelection<I, R = unknown>(pick: (ctx: ActionContext<I, R>) => readonly unknown[]): ActionStep<I, R> {
  return defineStep<I, R>('guard.selection', (ctx) => {
    if (pick(ctx).length === 0) ctx.fail('guard.selection')
  })
}

export function guardTab<I extends { tabs: readonly string[], activeTab: string, tab: string }, R = unknown>(): ActionStep<I, R> {
  return defineStep<I, R>('guard.tab', (ctx) => {
    const { tabs, activeTab, tab } = ctx.input
    if (!tabs.includes(tab) || tab === activeTab) ctx.fail('guard.tab')
  })
}

export function guardStatus<I extends { form: EditFormPort, status: string }, R = unknown>(): ActionStep<I, R> {
  return defineStep<I, R>('guard.status', (ctx) => {
    const { form, status } = ctx.input
    if (form.saving() || !form.hasStatus() || form.status() === status) ctx.fail('guard.status')
  })
}

export function dialogConfirm<I, R = unknown>(pick: (ctx: ActionContext<I, R>) => boolean): ActionStep<I, R> {
  return defineStep<I, R>('dialog.confirm', (ctx) => {
    if (!pick(ctx)) ctx.fail('dialog.confirm')
  })
}

export function guardAnySucceeded<I extends { ops: BusyPort }>(): ActionStep<I, EachReport<unknown>> {
  return defineStep<I, EachReport<unknown>>('guard.anySucceeded', (ctx) => {
    const report = ctx.result
    if (!report || report.succeeded > 0 || !report.lastMessage) return
    ctx.input.ops.setError?.(report.lastMessage)
    ctx.fail(report.lastMessage)
  })
}
