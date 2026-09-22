import type { ActionStep } from '#kestrel-core/app/utils/actions'
import { defineUiStep } from '../define'
import type { EditFormPort, SaveOutcome, Translate, WithDeps } from '../types'
import { saveOutcome } from './form'

export function deliveryRefresh<I extends { form: EditFormPort }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('delivery.refresh', async (ctx) => {
    const outcome = saveOutcome(ctx, 'delivery.refresh')
    if (outcome.failed || !ctx.input.form.pageLike) return
    await ctx.input.form.loadDelivery()
  })
}

export function retrySuffix(t: Translate, eventsQueue: boolean | undefined): string {
  return eventsQueue
    ? t('editorStatus.delivery.retryQueue', { tab: t('system.tabs.events') })
    : t('editorStatus.delivery.retryDelivery', { tab: t('system.tabs.delivery') })
}

export function deliveryToast<I extends WithDeps & { form: EditFormPort, eventsQueue?: boolean }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('delivery.toast', (ctx) => {
    const outcome = saveOutcome(ctx, 'delivery.toast')
    if (outcome.failed || !ctx.input.form.pageLike) return
    const status = outcome.events?.status
    if (status === undefined || status === 'done') return
    const { t, toast } = ctx.input.deps
    const suffix = retrySuffix(t, ctx.input.eventsQueue)
    if (status === 'error') {
      toast.error(`${t('editorStatus.delivery.failed')}${suffix}`)
    } else {
      toast.info(`${t('editorStatus.delivery.queued')}${suffix}`)
    }
  })
}
