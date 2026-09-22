import type { ActionStep } from '#kestrel-core/app/utils/actions'
import { defineUiStep } from '../define'
import type { EditFormPort, SaveOutcome, WithDeps } from '../types'
import { saveOutcome } from './form'

export function deliveryRefresh<I extends { form: EditFormPort }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('delivery.refresh', async (ctx) => {
    const outcome = saveOutcome(ctx, 'delivery.refresh')
    if (outcome.failed || !ctx.input.form.pageLike) return
    await ctx.input.form.loadDelivery()
  })
}

export function deliveryToast<I extends WithDeps & { form: EditFormPort, eventsQueue?: boolean }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('delivery.toast', (ctx) => {
    const outcome = saveOutcome(ctx, 'delivery.toast')
    if (outcome.failed || !ctx.input.form.pageLike) return
    const status = outcome.events?.status
    if (status === undefined || status === 'done') return
    const { t, toast } = ctx.input.deps
    const bodyKey = status === 'error' ? 'editorStatus.delivery.failed' : 'editorStatus.delivery.queued'
    const suffixKey = ctx.input.eventsQueue ? 'editorStatus.delivery.retryQueue' : 'editorStatus.delivery.retryDelivery'
    toast.error(`${t(bodyKey)}${t(suffixKey)}`)
  })
}
